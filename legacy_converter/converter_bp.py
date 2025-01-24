# converter_bp.py
import os
import json
import dropbox
import pandas as pd
import sqlite3
from flask import Blueprint, request, jsonify
from flask_login import login_required
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# KML parser
from kml_to_geojson_functions import parse_kml

converter_bp = Blueprint("converter_bp", __name__)

load_dotenv()

# Dropbox credentials for refresh token flow
DROPBOX_REFRESH_TOKEN = os.getenv("DROPBOX_REFRESH_TOKEN")
DROPBOX_APP_KEY = os.getenv("DROPBOX_APP_KEY")
DROPBOX_APP_SECRET = os.getenv("DROPBOX_APP_SECRET")

DATABASE_FILE = "UsersDB.db"
ALLOWED_EXT = {"xlsx", "csv", "kml"}

def get_db():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def get_dropbox_client():
    """
    Create a Dropbox client using refresh token + app key/secret => short-lived tokens auto-refreshed.
    """
    if not (DROPBOX_REFRESH_TOKEN and DROPBOX_APP_KEY and DROPBOX_APP_SECRET):
        raise ValueError("Missing Dropbox refresh token or app credentials in environment.")
    return dropbox.Dropbox(
        oauth2_refresh_token=DROPBOX_REFRESH_TOKEN,
        app_key=DROPBOX_APP_KEY,
        app_secret=DROPBOX_APP_SECRET
    )

@converter_bp.route("/upload_and_convert", methods=["POST"])
@login_required
def upload_and_convert():
    """
    1) KML -> parse immediately, insert into DB. Return success.
    2) XLSX/CSV -> 
       - Read the file locally to get REAL sheet names (if XLSX) & columns from the first sheet/CSV.
       - Upload the file to Dropbox.
       - Return { sheets: [...], columns: [...], file_name: "theFile.xlsx" } so the front end can pick a sheet + geometry columns.
    """
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part in request"})
    uploaded_file = request.files["file"]
    if not uploaded_file.filename:
        return jsonify({"success": False, "error": "No selected file"})

    filename = secure_filename(uploaded_file.filename)
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"success": False, "error": "File extension not allowed"})

    # Save locally (temp)
    save_dir = os.path.join("static", "uploads")
    os.makedirs(save_dir, exist_ok=True)
    local_path = os.path.join(save_dir, filename)
    uploaded_file.save(local_path)

    if ext == "kml":
        # parse KML right away
        try:
            placemarks = parse_kml(local_path)
            if not placemarks:
                os.remove(local_path)
                return jsonify({"success": False, "error": "No valid placemarks in KML."})

            db = get_db()
            cur = db.cursor()
            for pm in placemarks:
                coords = pm["coordinates"]  # list of [lon, lat, alt]
                geometry_json = json.dumps({"type": "LineString", "coordinates": coords})
                # Insert into DB (sample: status=Planned, etc.)
                cur.execute("""
                    INSERT INTO Cables
                    (name, date_start, date_end, status, restrictions, cable_type, wrap_material, geometry)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    pm["name"], None, None,
                    "Planned",
                    "None",
                    "Unknown",
                    "Unknown",
                    geometry_json
                ))
            db.commit()
            db.close()
            os.remove(local_path)

            return jsonify({"success": True, "message": "KML parsed & cables inserted into DB."})
        except Exception as e:
            if os.path.exists(local_path):
                os.remove(local_path)
            return jsonify({"success": False, "error": str(e)})

    else:
        # XLSX or CSV
        try:
            if ext == "csv":
                df = pd.read_csv(local_path, nrows=50)  # read a small sample
                sheet_names = ["CSV_Data"]
            else:
                xls = pd.ExcelFile(local_path)
                sheet_names = xls.sheet_names
                # read the FIRST sheet's columns for user to see
                df = pd.read_excel(xls, sheet_name=sheet_names[0], nrows=50)

            columns_list = list(df.columns)

            # Now upload to Dropbox
            dbx = get_dropbox_client()
            dropbox_path = f"/uploads/{filename}"
            with open(local_path, "rb") as f:
                dbx.files_upload(f.read(), dropbox_path, mode=dropbox.files.WriteMode.overwrite)

            os.remove(local_path)

            return jsonify({
                "success": True,
                "message": "File uploaded, here are sheets & columns.",
                "file_name": filename,         # so the front end knows which file to re-download
                "sheets": sheet_names, 
                "columns": columns_list,
                "is_csv": (ext == "csv")
            })

        except Exception as e:
            if os.path.exists(local_path):
                os.remove(local_path)
            return jsonify({"success": False, "error": str(e)})


@converter_bp.route("/process_sheet", methods=["POST"])
@login_required
def process_sheet():
    """
    The user picks:
      - file_name  (returned by upload_and_convert)
      - sheet_name (for XLSX), or 'CSV_Data' for CSV
      - lat_column, lon_column (which columns to use for geometry)
      - optionally other fields...
    We re-download from Dropbox, parse, insert cables, produce final CSV, upload final, return link.
    """
    # required fields
    required = ["file_name", "sheet_name", "lat_column", "lon_column"]
    for field in required:
        if field not in request.form:
            return jsonify({"success": False, "error": f"Missing {field} in form."})

    file_name = request.form["file_name"]
    sheet_name = request.form["sheet_name"]
    lat_col = request.form["lat_column"]
    lon_col = request.form["lon_column"]

    # 1) Re-download from Dropbox
    try:
        dbx = get_dropbox_client()
        dropbox_path = f"/uploads/{file_name}"

        # local path
        save_dir = os.path.join("static", "uploads")
        os.makedirs(save_dir, exist_ok=True)
        local_path = os.path.join(save_dir, file_name)

        # Download
        md, res = dbx.files_download(dropbox_path)
        with open(local_path, "wb") as f:
            f.write(res.content)

    except Exception as e:
        return jsonify({"success": False, "error": f"Error re-downloading from Dropbox: {str(e)}"})

    # 2) Parse the file with user-chosen sheet
    ext = file_name.rsplit(".", 1)[-1].lower()
    try:
        if ext == "csv":
            df = pd.read_csv(local_path)
        else:
            df = pd.read_excel(local_path, sheet_name=sheet_name)

        # Insert each row -> DB
        conn = get_db()
        cur = conn.cursor()

        for _, row in df.iterrows():
            # read mandatory fields or defaults
            cable_name = row.get("name", "Unnamed")
            status_val = row.get("status", "Planned")
            date_start = row.get("date_start", None)
            date_end = row.get("date_end", None)

            # geometry from lat/lon columns user picked
            if pd.isnull(row.get(lat_col)) or pd.isnull(row.get(lon_col)):
                # skip row if lat/lon missing
                continue
            lat = float(row[lat_col])
            lon = float(row[lon_col])

            # Build a line with 2 points for demonstration (shift the second point a bit)
            geometry_dict = {
                "type": "LineString",
                "coordinates": [
                    [lon, lat],
                    [lon + 0.01, lat + 0.01]
                ]
            }
            geometry_json = json.dumps(geometry_dict)

            cur.execute("""
                INSERT INTO Cables
                (name, date_start, date_end, status, restrictions, cable_type, wrap_material, geometry)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cable_name,
                date_start,
                date_end,
                status_val,
                "None",
                "Unknown",
                "Unknown",
                geometry_json
            ))
        conn.commit()
        conn.close()

        # produce final CSV (with the lat/lon columns user used, etc.)
        processed_name = "processed_" + file_name
        processed_path = os.path.join(save_dir, processed_name)
        df.to_csv(processed_path, index=False)

        # Upload final
        dbx.files_upload(open(processed_path,"rb").read(), f"/uploads/{processed_name}", mode=dropbox.files.WriteMode.overwrite)
        share_link_data = dbx.sharing_create_shared_link_with_settings(f"/uploads/{processed_name}")
        share_link = share_link_data.url.replace("?dl=0", "?dl=1")

        os.remove(local_path)
        os.remove(processed_path)

        return jsonify({"success": True, "dropbox_path": share_link})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})
    finally:
        # remove local file if it still exists
        local_final = os.path.join("static","uploads", file_name)
        if os.path.exists(local_final):
            os.remove(local_final)

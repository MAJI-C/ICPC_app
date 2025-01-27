# converter_bp.py
import os
import json
import sqlite3
import geojson
import re
import pandas as pd
import tempfile


from dotenv import load_dotenv
from shapely.geometry import LineString
from flask import Blueprint, request, jsonify, send_file
from flask_login import login_required
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Your existing KML parser that returns a GeoJSON string
from kml_to_geojson_functions import process_kml_file

converter_bp = Blueprint("converter_bp", __name__)
load_dotenv()

DATABASE_FILE = "UsersDB.db"
ALLOWED_EXT = {"xlsx", "csv", "kml"}

def get_db():
    conn = sqlite3.connect(DATABASE_FILE)
    return conn

@converter_bp.route("/upload_and_convert", methods=["POST"])
@login_required
def upload_and_convert():
    """
    1) Handles file upload.
    2) If KML, parse to a GeoJSON string via `process_kml_file`.
    3) Convert that string back to a Python dict so we return a real JSON object to the client.
    """
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part in request."}), 400

    uploaded_file = request.files["file"]
    if not uploaded_file.filename:
        return jsonify({"success": False, "error": "No selected file."}), 400

    filename = secure_filename(uploaded_file.filename)
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"success": False, "error": f"File extension '{ext}' not allowed."}), 400

    # Save locally (temp)
    save_dir = os.path.join("static", "uploads")
    os.makedirs(save_dir, exist_ok=True)
    local_path = os.path.join(save_dir, filename)
    uploaded_file.save(local_path)

    try:
        if ext == "kml":
            # Parse KML -> GeoJSON (string)
            geojson_str = process_kml_file(local_path)
            # Remove the temp file
            os.remove(local_path)

            # Convert that string to a Python dict
            try:
                geojson_dict = json.loads(geojson_str)
            except json.JSONDecodeError as err:
                return jsonify({
                    "success": False,
                    "error": f"Unable to parse JSON from KML: {err}"
                }), 500

            return jsonify({
                "success": True,
                "message": "KML parsed successfully.",
                # Return as an actual dict to the frontend
                "geojson": geojson_dict
            })

        else:
            # XLSX or CSV (placeholder, adapt to your actual code)
            os.remove(local_path)
            return jsonify({
                "success": True,
                "message": f"{ext.upper()} file parsed successfully. (Not implemented here)",
                "geojson": {}
            })
    except Exception as e:
        if os.path.exists(local_path):
            os.remove(local_path)
        return jsonify({"success": False, "error": str(e)}), 500


@converter_bp.route("/confirm_insertion", methods=["POST"])
@login_required
def confirm_insertion():
    """
    Receives final GeoJSON (including user-updated metadata), inserts into DB.
    Expects JSON: { "geojson": {...} }
    The entire FeatureCollection is stored in the 'feature_collection' column of `Cables`.
    """
    data = request.json
    if not data or "geojson" not in data:
        return jsonify({"success": False, "error": "No GeoJSON provided."}), 400

    # Convert the Python dict -> JSON string
    fc_str = json.dumps(data["geojson"], ensure_ascii=False)

    try:
        conn = get_db()
        cur = conn.cursor()

        # We'll store the entire FeatureCollection in one column
        cur.execute("INSERT INTO Cables (feature_collection) VALUES (?)", (fc_str,))
        conn.commit()
        cable_id = cur.lastrowid
        conn.close()

        return jsonify({
            "success": True,
            "message": "GeoJSON inserted into DB successfully.",
            "cable_id": cable_id
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@converter_bp.route("/download_geojson", methods=["POST"])
@login_required
def download_geojson():
    """
    Takes JSON body with "geojson", saves it as .geojson, returns it as a file download.
    """
    data = request.json
    if not data or "geojson" not in data:
        return jsonify({"success": False, "error": "No GeoJSON provided."}), 400

    fc_str = json.dumps(data["geojson"], ensure_ascii=False, indent=2)

    tmp_dir = os.path.join("static", "downloads")
    os.makedirs(tmp_dir, exist_ok=True)

    tmp_file = os.path.join(tmp_dir, "converted.geojson")
    with open(tmp_file, "w", encoding="utf-8") as f:
        f.write(fc_str)

    return send_file(tmp_file, as_attachment=True, download_name="converted.geojson")


def convert_xlsx_to_geojson(uploaded_file):
    """
    Converts an uploaded XLSX file to GeoJSON format and saves the outputs.

    Args:
        uploaded_file: The uploaded XLSX file object.

    Returns:
        dict: A dictionary containing sheet names as keys and GeoJSON file paths as values.
    """
    try:
        # create the directory to save files
        save_dir = os.path.join("static", "tempconvertedfiles")
        os.makedirs(save_dir, exist_ok=True)

        # save the uploaded file temporarily
        file_path = os.path.join(save_dir, secure_filename(uploaded_file.filename))
        uploaded_file.save(file_path)

        # process the file using the existing `process_excel_to_geojson`
        geojson_outputs = process_excel_to_geojson(file_path, save_dir)

        # Clean up the temporary uploaded file, ADD LATER??
        #os.remove(file_path)

        # return paths to GeoJSON files
        return geojson_outputs

    except Exception as e:
        print(f"ERROR: Conversion failed: {e}")
        raise

def find_coordinate_columns(df):
    """
    Dynamically identifies latitude, longitude, and depth columns in a DataFrame.
    Handles both named and unnamed columns.
    """
    lat_deg_col = lon_deg_col = None
    lat_min_col = lon_min_col = None
    depth_col = None

    print("DEBUG: Starting column detection...")
    for i, col in enumerate(df.columns):
        sample_values = df[col].dropna().astype(str).head(10)
        print(f"DEBUG: Checking column '{col}' with sample values: {sample_values.tolist()}")

        # skip columns with too much text (irrelevant data)
        if sample_values.str.len().mean() > 20:
            print(f"DEBUG: Skipping column '{col}' due to excessive text.")
            continue

        # detect latitude columns
        if "latitude" in str(col).lower() or "lat" in str(col).lower():
            if all(re.match(r"[NSEW]?\d{1,3}[^\d]*\d{1,2}\.\d+", val) for val in sample_values if val):
                lat_deg_col = col
                print(f"DEBUG: Combined latitude column identified: {lat_deg_col}")
            elif all(re.match(r"^\d{1,3}$", val) for val in sample_values if val.isdigit()):
                lat_deg_col = col
                print(f"DEBUG: Latitude degree column identified: {lat_deg_col}")

        # detect longitude columns
        elif "longitude" in str(col).lower() or "lon" in str(col).lower():
            if all(re.match(r"[NSEW]?\d{1,3}[^\d]*\d{1,2}\.\d+", val) for val in sample_values if val):
                lon_deg_col = col
                print(f"DEBUG: Combined longitude column identified: {lon_deg_col}")
            elif all(re.match(r"^\d{1,3}$", val) for val in sample_values if val.isdigit()):
                lon_deg_col = col
                print(f"DEBUG: Longitude degree column identified: {lon_deg_col}")

        # detect depth column
        if re.match(r"^(depth|cable depth)", str(col).strip(), re.IGNORECASE):
            if all(re.match(r"^\d+(\.\d+)?$", val) for val in sample_values if val.replace('.', '', 1).isdigit()):
                depth_col = col
                print(f"DEBUG: Depth column identified: {depth_col}")

        # check for unnamed columns for minutes or combined values
        if "Unnamed" in str(col):
            if all(re.match(r"^\d{1,2}\.\d+$", val) for val in sample_values if val.replace('.', '', 1).isdigit()):
                if lat_deg_col and i > df.columns.get_loc(lat_deg_col) and not lat_min_col:
                    lat_min_col = col
                    print(f"DEBUG: Latitude minute column identified: {lat_min_col}")
                elif lon_deg_col and i > df.columns.get_loc(lon_deg_col) and not lon_min_col:
                    lon_min_col = col
                    print(f"DEBUG: Longitude minute column identified: {lon_min_col}")

    # scan rows if required columns are not detected
    if not (lat_deg_col and lon_deg_col):
        print("DEBUG: Scanning rows for coordinate-related keywords...")
        for row_idx in range(min(5, len(df))):
            for col_idx, cell in enumerate(df.iloc[row_idx]):
                cell = str(cell).lower()
                if "latitude" in cell or "lat" in cell:
                    lat_deg_col = df.columns[col_idx]
                    print(f"DEBUG: Latitude column identified from rows: {lat_deg_col}")
                elif "longitude" in cell or "lon" in cell:
                    lon_deg_col = df.columns[col_idx]
                    print(f"DEBUG: Longitude column identified from rows: {lon_deg_col}")
                elif re.match(r"^(depth|cable depth)", cell, re.IGNORECASE):
                    depth_col = df.columns[col_idx]
                    print(f"DEBUG: Depth column identified from rows: {depth_col}")

    print("DEBUG: Column detection results:", {
        "lat_deg_col": lat_deg_col,
        "lat_min_col": lat_min_col,
        "lon_deg_col": lon_deg_col,
        "lon_min_col": lon_min_col,
        "depth_col": depth_col,
    })
    return {
        "lat_deg_col": lat_deg_col,
        "lat_min_col": lat_min_col,
        "lon_deg_col": lon_deg_col,
        "lon_min_col": lon_min_col,
        "depth_col": depth_col,
    }


def parse_coordinate(degree, minutes=None):
    """
    Convert degrees and minutes to decimal degrees.
    Handles combined and split formats.
    """
    try:
        if isinstance(degree, str) and re.match(r"[NSEW]?\d{1,3}[^\d]*\d{1,2}\.\d+", degree):
            match = re.match(r"([NSEW])?(\d{1,3})[^\d]*(\d{1,2}\.\d+)", degree, re.IGNORECASE)
            if match:
                direction = match.group(1)
                degrees = int(match.group(2))
                minutes = float(match.group(3))
                decimal_degrees = degrees + (minutes / 60)
                if direction and direction.upper() in ('S', 'W'):
                    decimal_degrees = -decimal_degrees
                return decimal_degrees

        # Handle separate degrees and minutes
        if degree is not None and minutes is not None:
            degree = float(degree)
            minutes = float(minutes)
            return degree + (minutes / 60)

    except (ValueError, TypeError):
        return None


def extract_coordinates_to_df(df):
    """
    Extracts latitude, longitude, and depth from a DataFrame.
    Handles combined and split formats for degrees and minutes.
    """
    col_mapping = find_coordinate_columns(df)
    lat_deg_col = col_mapping["lat_deg_col"]
    lat_min_col = col_mapping["lat_min_col"]
    lon_deg_col = col_mapping["lon_deg_col"]
    lon_min_col = col_mapping["lon_min_col"]
    depth_col = col_mapping["depth_col"]

    if not (lat_deg_col and lon_deg_col):
        print("DEBUG: Missing required latitude or longitude columns. Skipping sheet.")
        return pd.DataFrame()

    # handle combined or split formats for latitude and longitude
    df["latitude_combined"] = (
        df.apply(lambda row: parse_coordinate(row[lat_deg_col], row[lat_min_col]), axis=1)
        if lat_min_col
        else df[lat_deg_col].apply(parse_coordinate)
    )
    df["longitude_combined"] = (
        df.apply(lambda row: parse_coordinate(row[lon_deg_col], row[lon_min_col]), axis=1)
        if lon_min_col
        else df[lon_deg_col].apply(parse_coordinate)
    )

    # create standardized DataFrame
    coordinates_df = pd.DataFrame({
        "longitude": df["longitude_combined"],
        "latitude": df["latitude_combined"],
        "depth": (
            df[depth_col].apply(
                lambda x: float(x) if pd.notna(x) and str(x).replace('.', '', 1).isdigit() else None
            )
            if depth_col
            else None
        )
    })

    # drop rows with missing coordinates
    coordinates_df = coordinates_df.dropna(subset=["longitude", "latitude"]).copy()
    return coordinates_df

def format_as_geojson(coordinates):
    """
    Convert a list of coordinates into a GeoJSON feature collection.
    """
    geojson_output = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": coordinates
                },
                "properties": {
                    "Name": "Cable Route",
                    "Status": "Active"
                }
            }
        ]
    }
    return json.dumps(geojson_output, indent=2)


# WORKS ON ALL

def process_excel_to_geojson(file_path, save_dir):
    """
    Process an Excel file and extract coordinate data into GeoJSON format.

    Args:
        file_path (str): Path to the Excel file.
        save_dir (str): Directory to save GeoJSON files.

    Returns:
        dict: A dictionary mapping sheet names to GeoJSON file paths.
    """
    xls = pd.ExcelFile(file_path)
    geojson_files = {} 

    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name)
        coords_df = extract_coordinates_to_df(df)

        if not coords_df.empty and len(coords_df) >= 10:
            coords_df["depth"] = coords_df["depth"].fillna(0)
            geojson_data = create_geojson(coords_df[["longitude", "latitude", "depth"]].fillna(0).values.tolist())

            # save the GeoJSON data to a file
            geojson_filename = f"{sheet_name.replace(' ', '_')}.geojson"
            geojson_path = os.path.join(save_dir, geojson_filename)
            with open(geojson_path, "w") as f:
                f.write(geojson_data)

            geojson_files[sheet_name] = {
                "file_path": geojson_path,
                "filename": geojson_filename,
                "coordinates": coords_df[["longitude", "latitude", "depth"]].values.tolist()
            }

    print(f"{len(geojson_files)} cables found and saved.")
    return geojson_files 

def create_geojson(
    coordinates,
    buried_depth='-',
    category_of_cable='-',
    condition='-',
    feature_language='-',
    feature_name='-',
    feature_name_usage='-',
    date_end='-',
    date_start='-',
    status='-',
    scale_minimum='-',
    file_locator='-',
    file_reference='-',
    headline='-',
    information_language='-',
    information_text='-',
    component_of='-',
    updates='-',
    positions='-',
    provides_information='-',
):
    """
    Creates a GeoJSON FeatureCollection with metadata based on specified parameters.
    """
    metadata = {
        "Buried Depth": buried_depth,
        "Category of Cable": category_of_cable,
        "Condition": condition,
        "[Feature Name]: Language": feature_language,
        "[Feature Name]: Name": feature_name,
        "[Feature Name]: Name Usage": feature_name_usage,
        "[Fixed Date Range]: Date End": date_end,
        "[Fixed Date Range]: Date Start": date_start,
        "Status": status,
        "Scale Minimum": scale_minimum,
        "[Information]: File Locator": file_locator,
        "[Information]: File Reference": file_reference,
        "[Information]: Headline": headline,
        "[Information]: Language": information_language,
        "[Information]: Text": information_text,
        "Feature Association: Component of": component_of,
        "Feature Association: Updates": updates,
        "Feature Association: Positions": positions,
        "Feature Association: Provides Information": provides_information,
    }

    feature = geojson.Feature(
        geometry=geojson.LineString(coordinates),
        properties=metadata
    )
    feature_collection = geojson.FeatureCollection([feature])

    return geojson.dumps(feature_collection, indent=2)

@converter_bp.route("/save_geojson", methods=["POST"])
@login_required
def save_geojson():
    """
    Save the final GeoJSON with user-edited properties.
    """
    try:
        # get the edited properties and GeoJSON from the request
        edited_properties = request.json.get("properties")
        coordinates = request.json.get("coordinates")
        output_filename = request.json.get("filename", "output.geojson")
        output_dir = os.path.join("static", "tempconvertedfiles")
        os.makedirs(output_dir, exist_ok=True)

        # build the final GeoJSON structure
        geojson_data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": coordinates
                    },
                    "properties": edited_properties
                }
            ]
        }

        output_path = os.path.join(output_dir, output_filename)
        with open(output_path, "w") as geojson_file:
            json.dump(geojson_data, geojson_file, indent=2)

        return jsonify({"success": True, "message": "GeoJSON saved successfully.", "file_path": output_path})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@converter_bp.route("/confirm_xlsx_insertion", methods=["POST"])
@login_required
def confirm_xlsx_insertion():
    """
    Inserts a specific updated GeoJSON file into the DB.
    Expects JSON: { "file_path": "path_to_geojson_file" }
    """
    data = request.json
    if not data or "file_path" not in data:
        return jsonify({"success": False, "error": "No file path provided."}), 400

    file_path = data["file_path"]

    # Check if the file exists
    if not os.path.exists(file_path):
        return jsonify({"success": False, "error": f"File not found: {file_path}"}), 404

    try:
        # Read the GeoJSON file
        with open(file_path, "r", encoding="utf-8") as f:
            geojson_content = json.load(f)

        # Validate the GeoJSON structure
        if "features" not in geojson_content or "type" not in geojson_content:
            return jsonify({"success": False, "error": "Invalid GeoJSON format."}), 400

        # Insert into the database
        fc_str = json.dumps(geojson_content, ensure_ascii=False)
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO Cables (feature_collection) VALUES (?)", (fc_str,))
        conn.commit()
        cable_id = cur.lastrowid
        conn.close()

        return jsonify({
            "success": True,
            "message": "GeoJSON inserted into DB successfully.",
            "cable_id": cable_id
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to insert into DB: {str(e)}"}), 500


    
@converter_bp.route("/download_xlsx_geojson", methods=["POST"])
@login_required
def download_xlsx_geojson():
    """
    Sends a specific updated GeoJSON file for download.
    Expects JSON: { "file_path": "path_to_geojson_file" }
    """
    data = request.json
    if not data or "file_path" not in data:
        return jsonify({"success": False, "error": "No file path provided."}), 400

    file_path = data["file_path"]

    # Check if the file exists
    if not os.path.exists(file_path):
        return jsonify({"success": False, "error": f"File not found: {file_path}"}), 404

    # Send the file for download
    try:
        return send_file(file_path, as_attachment=True, download_name=os.path.basename(file_path))
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to send file: {str(e)}"}), 500



@converter_bp.route("/upload_xlsx", methods=["POST"])
@login_required
def upload_xlsx():
    """
    Handles XLSX file uploads, converts them to GeoJSON, and returns metadata for further processing.
    """
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part in request."}), 400

    uploaded_file = request.files["file"]
    if not uploaded_file.filename:
        return jsonify({"success": False, "error": "No selected file."}), 400

    filename = secure_filename(uploaded_file.filename)
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext != "xlsx":
        return jsonify({"success": False, "error": "Invalid file type for this endpoint."}), 400

    try:
        # Convert XLSX to GeoJSON using the existing function
        geojson_files = convert_xlsx_to_geojson(uploaded_file)

        return jsonify({
            "success": True,
            "message": "XLSX file processed successfully.",
            "files": geojson_files
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

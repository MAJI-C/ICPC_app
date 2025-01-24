# converter_bp.py
import os
import json
import sqlite3

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

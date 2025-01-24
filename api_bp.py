# api_bp.py
import json
import sqlite3
from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging

api_bp = Blueprint("api_bp", __name__)
logging.basicConfig(level=logging.DEBUG)

DATABASE_FILE = "UsersDB.db"

def get_db():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

@api_bp.route("/api/cables", methods=["GET"])
@login_required
def get_cables():
    """
    Retrieves cables from the database with optional filtering and returns a GeoJSON FeatureCollection.
    """
    try:
        conn = get_db()
        cur = conn.cursor()

        # Fetch all feature_collections from the database
        cur.execute("SELECT feature_collection FROM Cables")
        rows = cur.fetchall()
        conn.close()

        all_features = []
        for row in rows:
            feature_collection = json.loads(row["feature_collection"])
            all_features.extend(feature_collection.get("features", []))

        # Apply filters if provided
        name = request.args.get('Name', '').strip().lower()
        status = request.args.get('Status', '').strip().lower()
        condition = request.args.get('Condition', '').strip().lower()
        category_of_cable = request.args.get('CategoryOfCable', '').strip().lower()

        if any([name, status, condition, category_of_cable]):
            filtered_features = []
            for feature in all_features:
                props = feature.get("properties", {})
                match = True
                if name and name not in (props.get("[Feature Name]: Name", "").lower()):
                    match = False
                if status and status not in (props.get("Status", "").lower()):
                    match = False
                if condition and condition not in (props.get("Condition", "").lower()):
                    match = False
                if category_of_cable and category_of_cable not in (
                    props.get("Category of Cable", "").lower()
                ):
                    match = False
                if match:
                    filtered_features.append(feature)
            all_features = filtered_features

        # Create the GeoJSON FeatureCollection
        geojson_response = {
            "type": "FeatureCollection",
            "features": all_features
        }

        return jsonify(geojson_response)
    except Exception as e:
        logging.exception("Error fetching cables from the database.")
        return jsonify({"success": False, "error": str(e)}), 500


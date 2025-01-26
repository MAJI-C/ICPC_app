# api_bp.py
import json
import sqlite3
from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
###crossing
from shapely.geometry import shape
from shapely.ops import unary_union

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
    try:
        conn = get_db()
        cur = conn.cursor()

        # Fetch all cables from the database
        cur.execute("SELECT feature_collection FROM Cables")
        rows = cur.fetchall()
        conn.close()

        all_features = []
        for row in rows:
            feature_collection = json.loads(row["feature_collection"])
            all_features.extend(feature_collection.get("features", []))

        #debugging empty checkbox
        print("Returning cables:", all_features)
        print("Returning GeoJSON response:", {"type": "FeatureCollection", "features": all_features})

        # Apply filters
        name = request.args.get('Name', '').strip().lower()
        status = request.args.get('Status', '').strip().lower()
        condition = request.args.get('Condition', '').strip().lower()

        if any([name, status, condition]):
            all_features = [
                feature
                for feature in all_features
                if (
                    (not name or name in feature["properties"].get("[Feature Name]: Name", "").lower())
                    and (not status or status in feature["properties"].get("Status", "").lower())
                    and (not condition or condition in feature["properties"].get("Condition", "").lower())
                )
            ]

        return jsonify({"type": "FeatureCollection", "features": all_features})

    except Exception as e:
        logging.exception("Error fetching cables.")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/api/cable-crossings", methods=["GET"])
@login_required

def get_cable_crossings():
    """
    Check for cable crossings in the database and return crossing cables
    """
    try:
        conn = get_db()
        cur = conn.cursor()

        # Fetch feature_collections from the database
        cur.execute("SELECT feature_collection FROM Cables")
        rows = cur.fetchall()
        conn.close()

        all_features = []
        for row in rows:
            feature_collection = json.loads(row["feature_collection"])
            all_features.extend(feature_collection.get("features", []))

        # Convert features to Shapely geometries
        geometries = []
        for feature in all_features:
            geometry = shape(feature["geometry"])
            geometries.append(geometry)

        # Find intersections using unary_union (this combines all geometries into one and finds intersections)
        union = unary_union(geometries)

        # Check if intersection
        crossing_features = []
        for i, geom in enumerate(geometries):
            for j, other_geom in enumerate(geometries):
                if i != j and geom.intersects(other_geom):  # Check if geometries intersect
                    crossing_features.append({
                        "cable_1": all_features[i]["properties"],
                        "cable_2": all_features[j]["properties"]
                    })

        return jsonify({"crossings": crossing_features})

    except Exception as e:
        logging.exception("Error checking for cable crossings.")
        return jsonify({"success": False, "error": str(e)}), 500
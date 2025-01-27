import json
import os
import sqlite3
from flask import Blueprint, jsonify, request
from flask_login import login_required
from shapely.geometry import shape
from shapely.ops import transform
import pyproj
from shapely.ops import unary_union

api_bp = Blueprint("api_bp", __name__)
DATABASE_FILE = "UsersDB.db"

def get_db():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

@api_bp.route("/api/cables", methods=["GET"])
@login_required
def get_cables():
    """
    Returns cables from DB as a GeoJSON FeatureCollection,
    optionally filtered by ?Status=..., ?Condition=...
    """
    try:
        status_filter = request.args.get("Status", "").strip()
        cond_filter   = request.args.get("Condition", "").strip()

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT feature_collection FROM Cables")
        rows = cur.fetchall()
        conn.close()

        all_features = []
        for row in rows:
            feature_collection = row["feature_collection"]
            if not feature_collection:
                continue
            data = json.loads(feature_collection)

            # Check if data is a dict or a list
            if isinstance(data, dict):
                # assume { "type": "FeatureCollection", "features": [...] }
                feature_list = data.get("features", [])
            elif isinstance(data, list):
                # It's already a list of features
                feature_list = data
            else:
                feature_list = []

            for feat in feature_list:
                props = feat.get("properties", {})

                # Filter by Status
                if status_filter and props.get("Status", "") != status_filter:
                    continue

                # Filter by Condition
                if cond_filter and props.get("Condition", "") != cond_filter:
                    continue

                # If we pass filters, add
                all_features.append(feat)

        # Return as a FeatureCollection
        return jsonify({
            "type": "FeatureCollection",
            "features": all_features
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@api_bp.route("/api/cable-crossings/territorial", methods=["GET"])
@login_required
def get_territorial_crossings():
    """
    GET /api/cable-crossings/territorial?cable=C-Lion
    Returns intersections with 'simplified_eez_12nm_v4.geojson'
    zone_label = 'territorial'
    """
    return compute_zone_intersections("territorial", "simplified_eez_12nm_v4.geojson")

@api_bp.route("/api/cable-crossings/contiguous", methods=["GET"])
@login_required
def get_contiguous_crossings():
    """
    GET /api/cable-crossings/contiguous?cable=C-Lion
    Returns intersections with 'simplified_eez_24nm_v4.geojson'
    zone_label = 'contiguous'
    """
    return compute_zone_intersections("contiguous", "simplified_eez_24nm_v4.geojson")

@api_bp.route("/api/cable-crossings/eez", methods=["GET"])
@login_required
def get_eez_crossings():
    """
    GET /api/cable-crossings/eez?cable=C-Lion
    Returns intersections with 'simplified_eez_v12.geojson'
    zone_label = 'eez'
    """
    return compute_zone_intersections("eez", "simplified_eez_v12.geojson")

@api_bp.route("/api/cable-crossings/ecs", methods=["GET"])
@login_required
def get_ecs_crossings():
    """
    GET /api/cable-crossings/ecs?cable=C-Lion
    Returns intersections with 'simplified_ecs_v02.geojson'
    zone_label = 'ecs'
    """
    return compute_zone_intersections("ecs", "simplified_ecs_v02.geojson")

@api_bp.route("/api/cable-crossings/highseas", methods=["GET"])
@login_required
def get_highseas_crossings():
    """
    GET /api/cable-crossings/highseas?cable=C-Lion
    Returns intersections with 'simplified_High_Seas_v2.geojson'
    zone_label = 'highseas'
    """
    return compute_zone_intersections("highseas", "simplified_High_Seas_v2.geojson")


def compute_zone_intersections(zone_label, filename):
    try:
        cable_name = request.args.get("cable", "").strip().lower()

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT feature_collection FROM Cables")
        rows = cur.fetchall()
        conn.close()

        cable_geom_list = []
        for row in rows:
            feature_collection = row["feature_collection"]
            if not feature_collection:
                continue
            data = json.loads(feature_collection)

            # handle list vs dict
            if isinstance(data, dict):
                feature_list = data.get("features", [])
            elif isinstance(data, list):
                feature_list = data
            else:
                feature_list = []

            for feat in feature_list:
                props = feat.get("properties", {})
                if props.get("[Feature Name x]: Name", "").lower() == cable_name:
                    g = shape(feat["geometry"])
                    cable_geom_list.append(g)

        if not cable_geom_list:
            return jsonify({"error": f"Cable '{cable_name}' not found"}), 404

        cable_geom = unary_union(cable_geom_list)


        base_path = os.path.join("static", "simplified_geojson_files")
        file_path = os.path.join(base_path, filename)
        if not os.path.exists(file_path):
            return jsonify({"error": f"{filename} not found"}), 404

        with open(file_path, "r", encoding="utf-8") as f:
            zone_data = json.load(f)

        project_to_mercator = pyproj.Transformer.from_crs(
            "EPSG:4326", "EPSG:3857", always_xy=True
        ).transform

        intersections = []
        # For each zone polygon
        for zfeat in zone_data.get("features", []):
            geom = zfeat.get("geometry")
            if not geom or not geom.get("type"):
                continue
            zone_geom = shape(geom)
            country_name = zfeat.get("properties", {}).get("SOVEREIGN1", "Unknown")

            if cable_geom.intersects(zone_geom):
                inters = cable_geom.intersection(zone_geom)
                if not inters.is_empty:
                    inters_geojson = json.loads(json.dumps(inters.__geo_interface__))
                    inters_merc = transform(project_to_mercator, inters)
                    length_m = inters_merc.length
                    length_km = length_m / 1000.0

                    intersections.append({
                        "zone_label": zone_label,
                        "cable_name": cable_name,
                        "country_name": country_name,
                        "intersection_km": round(length_km, 3),
                        "geometry": inters_geojson
                    })

        return jsonify({"intersections": intersections}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api_bp.route("/api/cable-crossings/cables", methods=["GET"])
@login_required
def get_cable_to_cable_crossings():

    try:
        cable_name_query = request.args.get("cable", "").strip().lower()
        if not cable_name_query:
            return jsonify({"error": "Missing 'cable' query param"}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT feature_collection FROM Cables")
        rows = cur.fetchall()
        conn.close()

        # 1) Build geometry for the requested cable (call it "cableA")
        cableA_geom_list = []
        for row in rows:
            fc = row["feature_collection"]
            if not fc:
                continue
            data = json.loads(fc)
            if isinstance(data, dict):
                feature_list = data.get("features", [])
            elif isinstance(data, list):
                feature_list = data
            else:
                feature_list = []

            for feat in feature_list:
                props = feat.get("properties", {})
                if props.get("[Feature Name x]: Name", "").lower() == cable_name_query:
                    cableA_geom_list.append(shape(feat["geometry"]))

        if not cableA_geom_list:
            return jsonify({"error": f"Cable '{cable_name_query}' not found"}), 404


        cableA_geom = unary_union(cableA_geom_list)

        crossings = []

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT feature_collection FROM Cables")
        rows2 = cur.fetchall()
        conn.close()

        for row2 in rows2:
            fc2 = row2["feature_collection"]
            if not fc2:
                continue
            data2 = json.loads(fc2)
            if isinstance(data2, dict):
                feature_list2 = data2.get("features", [])
            elif isinstance(data2, list):
                feature_list2 = data2
            else:
                feature_list2 = []

            # Build geometry for cableB
            cableB_name = None
            cableB_geom_list = []
            for feat2 in feature_list2:
                props2 = feat2.get("properties", {})
                # The name from the partial feature
                nameB = props2.get("[Feature Name x]: Name", "").lower()
                if not cableB_name and nameB:
                    cableB_name = nameB  # store one name to identify it
                cableB_geom_list.append(shape(feat2["geometry"]))

            if not cableB_geom_list:
                continue
            cableB_geom = unary_union(cableB_geom_list)

            # If cableB is the same as cableA, skip
            if cableB_name == cable_name_query:
                continue

            # Check intersection
            if cableA_geom.intersects(cableB_geom):
                inters = cableA_geom.intersection(cableB_geom)
                if not inters.is_empty:
                    inter_geojson = json.loads(json.dumps(inters.__geo_interface__))

                    crossings.append({
                        "cableA": cable_name_query,
                        "cableB": cableB_name,
                        "geometry": inter_geojson
                    })

        return jsonify({"crossings": crossings}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
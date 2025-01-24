import sqlite3
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from app import get_db

profile_bp = Blueprint("profile_bp", __name__)

@profile_bp.route("/profile_info", methods=["GET"])
@login_required
def profile_info():
    """
    Returns user profile data as JSON (to be displayed in a popup).
    """
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT user_id, name, email, role FROM User WHERE user_id = ?", 
        (current_user.id,)
    )
    user_data = cursor.fetchone()

    if not user_data:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "user_id": user_data["user_id"],
        "name": user_data["name"],
        "email": user_data["email"],
        "role": user_data["role"]
    })

@profile_bp.route("/update_profile", methods=["POST"])
@login_required
def update_profile():
    """
    Updates user *password* in the profile. (Currently only handles password changes.)
    """
    data = request.json
    db = get_db()
    cursor = db.cursor()

    # Extract input
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    confirm_password = data.get("confirm_password")

    # Check for missing input
    if not current_password or not new_password or not confirm_password:
        return jsonify({"error": "All password fields are required"}), 400

    # Check if current password matches
    cursor.execute("SELECT password FROM User WHERE user_id = ?", (current_user.id,))
    user = cursor.fetchone()
    if not user or not check_password_hash(user["password"], current_password):
        return jsonify({"error": "Current password is incorrect"}), 400

    # Check if new passwords match
    if new_password != confirm_password:
        return jsonify({"error": "New password and confirmation do not match"}), 400

    # Update the password
    hashed_password = generate_password_hash(new_password)
    try:
        cursor.execute(
            "UPDATE User SET password = ? WHERE user_id = ?",
            (hashed_password, current_user.id)
        )
        db.commit()
        return jsonify({"success": "Password updated successfully"}), 200
    except sqlite3.IntegrityError:
        return jsonify({"error": "Failed to update password"}), 500
    finally:
        # Typically you do not close the DB here if using Flask’s `g` object
        # because Flask closes it automatically after the request.
        # But if you really want to close it manually, you can keep this:
        db.close()

import os
from dotenv import load_dotenv
import pandas as pd
import dropbox
from flask import Blueprint, request, jsonify
from flask_login import login_required
from werkzeug.utils import secure_filename

converter_bp = Blueprint("converter_bp", __name__)

# Dropbox Access Token
load_dotenv()

# Get the Dropbox access token from the environment
DROPBOX_ACCESS_TOKEN = os.getenv("DROPBOX_ACCESS_TOKEN")

@converter_bp.route("/upload_and_convert", methods=["POST"])
@login_required
def upload_and_convert():
    """
    Handle file uploads (Excel/CSV/XML/KML).
    Convert or parse them as needed and upload to Dropbox.
    """
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file part in request"})

    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No selected file"})

    filename = secure_filename(file.filename)
    allowed_ext = {'xlsx', 'csv', 'xml', 'kml'}
    ext = filename.rsplit('.', 1)[-1].lower()
    if ext not in allowed_ext:
        return jsonify({"success": False, "error": "File extension not allowed"})

    # Save file locally
    save_dir = os.path.join("static", "uploads")
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)
    file.save(save_path)

    try:
        # Upload to Dropbox
        dbx = dropbox.Dropbox(DROPBOX_ACCESS_TOKEN)
        dropbox_path = f"/uploads/{filename}"  # Path in Dropbox
        with open(save_path, "rb") as f:
            dbx.files_upload(f.read(), dropbox_path, mode=dropbox.files.WriteMode.overwrite)

        # Optionally clean up the local file
        os.remove(save_path)

    except dropbox.exceptions.ApiError as e:
        return jsonify({"success": False, "error": f"Dropbox API error: {str(e)}"})
    except Exception as e:
        return jsonify({"success": False, "error": f"Error: {str(e)}"})

    return jsonify({"success": True, "message": f"File '{filename}' uploaded to Dropbox successfully."})

# Flask App Setup Guide

## Overview
This Flask app provides a simple login system with a user dashboard. The project uses SQLite for the database, Flask-Login for authentication, and Flask-WTF for form validation.

## Prerequisites
Ensure you have the following installed:
1. Python 3.10
2. `pip` (Python package manager)
3. Virtual environment support (`venv`)
4. Git LFS (for handling large GeoJSON files)

---

## Setup Instructions

### 1. Clone the Repository
Clone the code from the GitHub repository:
```bash
git clone <repository-url>
cd <repository-name>
```
### 2. Set Up a Virtual Environment
```bash
virtualenv .venv
source .venv/bin/activate
```
### 3. Install Dependencies
```bash
pip install -r requirements.txt
```
### 4. Create a .env File
Generate a SECRET_KEY and create a .env file in the project root:
python -c "import secrets; print(secrets.token_hex(16))"
SECRET_KEY=<your_generated_secret_key>
DATABASE_FILE=UsersDB.db

### 5. Initialize the Database
python database_init.py

### 6. Add .env to .gitignore

### 7. Run the Flask App
flask run

### 8. Kill
```
lsof -i :5000 | awk 'NR>1 {print $2}' | xargs kill -9
```

### Git LFS Setup Guide
1. Open Your Terminal and Navigate to your repository:
```
    cd /path/to/your/repository
```
2. Install Git LFS

Install Git LFS depending on your platform:

    Linux:
```
sudo apt install git-lfs
```
Mac:
```
    brew install git-lfs
```
    Windows: Download and install Git LFS for Windows.

After installation, initialize Git LFS:
```
git lfs install
```
3. Track GeoJSON Files

Tell Git LFS to track .geojson files:
```
git lfs track "*.geojson"
```
This creates a .gitattributes file. Verify it:
```
cat .gitattributes
```
You should see:
```
*.geojson filter=lfs diff=lfs merge=lfs -text
```
Stage and commit the .gitattributes file:
```
git add .gitattributes
git commit -m "Add Git LFS tracking for GeoJSON files"
```
4. Add and Push GeoJSON Files

Add the GeoJSON files and commit them:
```
git add *.geojson
git commit -m "Add GeoJSON files with Git LFS"
```
Push the changes to the map branch:
```
git push origin map
```
5. Ensure Collaborators Use Git LFS

    Collaborators must install Git LFS before cloning the repository:
```
    git lfs install
    git clone <repository-url>
```
Notes

    For files exceeding 500 MB, consider offloading them to a cloud storage solution (e.g., AWS S3 or Google Cloud).
    Simplify large GeoJSON files with tools like mapshaper to reduce file sizes while maintaining usability.
    Use Flask-Caching or a CDN to improve performance for frequently accessed data.


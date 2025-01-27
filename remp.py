import sqlite3
import json

DATABASE_FILE = "UsersDB.db"

def test_cables():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT feature_collection FROM Cables")
    rows = cur.fetchall()
    conn.close()

    for row in rows:
        try:
            feature_collection = json.loads(row["feature_collection"])
            print(json.dumps(feature_collection, indent=2))
        except json.JSONDecodeError as e:
            print(f"Invalid JSON: {e} - {row['feature_collection']}")

test_cables()

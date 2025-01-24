import os
from dotenv import load_dotenv
import sqlite3
from flask import g

DATABASE_FILE = os.getenv("DATABASE_FILE", "UsersDB.db")

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE_FILE)
        g.db.row_factory = sqlite3.Row
    return g.db

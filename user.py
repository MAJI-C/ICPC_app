from flask_login import UserMixin
from db_utils import get_db


class User(UserMixin):
    def __init__(self, user_id, name, email, password, role):
        self.id = user_id
        self.name = name
        self.email = email
        self.password = password
        self.role = role
        
    @staticmethod
    def get(user_id):
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT * FROM User WHERE user_id = ?", (user_id,))
        user = cursor.fetchone()
        if user:
            return User(
                user_id=user["user_id"],
                name=user["name"],
                email=user["email"],
                password=user["password"],
                role=user["role"]
            )
        return None

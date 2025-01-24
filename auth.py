# auth.py

from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_user, login_required, logout_user, current_user
from werkzeug.security import check_password_hash
from user import User
from db_utils import get_db
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired, Email

auth_bp = Blueprint("auth_bp", __name__)

# A simple login form
class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()], render_kw={"placeholder": "Email"})
    password = PasswordField('Password', validators=[DataRequired()], render_kw={"placeholder": "Password"})
    submit = SubmitField('Log In')

@auth_bp.route('/', methods=['GET', 'POST'])
def login():
    """
    If user is authenticated, redirect to /dashboard.
    Otherwise, show login form.
    """
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    form = LoginForm()
    if form.validate_on_submit():
        conn = get_db()
        user_row = conn.execute(
            "SELECT * FROM User WHERE email = ?",
            (form.email.data,)
        ).fetchone()
        conn.close()

        if user_row and check_password_hash(user_row["password"], form.password.data):
            user_obj = User(
                user_id=user_row["user_id"],
                name=user_row["name"],
                email=user_row["email"],
                password=user_row["password"],
                role=user_row["role"]
            )
            login_user(user_obj)
            flash('Logged in successfully!', 'success')
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid email or password', 'danger')

    return render_template('login.html', form=form)

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('auth_bp.login'))

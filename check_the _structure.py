import sqlite3
import os

# Connect to your SQLite database
db_path = "UsersDB.db"  # Replace with your SQLite database path
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Query to get all columns from the table (replace 'your_table' with actual name)
query = "SELECT * FROM Cables"  # Replace `your_table` with the table name
cursor.execute(query)

# Fetch column names
column_names = [description[0] for description in cursor.description]

# Directory to save the .txt files
output_dir = "record_files"
os.makedirs(output_dir, exist_ok=True)

# Iterate through the rows and save each record to a .txt file
for idx, row in enumerate(cursor.fetchall(), start=1):
    file_path = os.path.join(output_dir, f"record_{idx}.txt")
    with open(file_path, 'w', encoding='utf-8') as file:
        for column_name, value in zip(column_names, row):
            file.write(f"{column_name}: {value}\n")  # Write column name and value to file
    print(f"Saved record to {file_path}")

# Close the connection
conn.close()

print("All records have been saved!")

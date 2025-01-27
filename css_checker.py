import os
import re


def extract_selectors_from_files(folder_paths, file_extensions):
    """Extract class and ID selectors from files with given extensions."""
    selectors = set()
    # Regex patterns for class and ID in HTML/JS files
    class_pattern = r'class=["\']([^"\']+)["\']'
    id_pattern = r'id=["\']([^"\']+)["\']'

    for folder_path in folder_paths:
        for root, _, files in os.walk(folder_path):
            for file in files:
                if file.endswith(file_extensions):
                    file_path = os.path.join(root, file)
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()

                        # Extract class and ID selectors
                        classes = re.findall(class_pattern, content)
                        ids = re.findall(id_pattern, content)

                        # Split multiple class values and add each one separately
                        for class_group in classes:
                            selectors.update(class_group.split())
                        selectors.update(ids)

    return selectors


def extract_selectors_from_css(css_file):
    """Extract class and ID selectors from a CSS file."""
    selectors = set()
    # Match class (.classname) or ID (#idname) selectors
    css_pattern = r'([.#][a-zA-Z0-9_-]+)'

    with open(css_file, "r", encoding="utf-8") as f:
        content = f.read()
        matches = re.findall(css_pattern, content)
        selectors.update(matches)

    return selectors


def compare_css_usage(project_folder):
    """Compare CSS usage in the project."""
    # Define folders to scan for HTML and JS files
    html_folder = os.path.join(project_folder, "templates/partial")
    js_folder = os.path.join(project_folder, "static", "scripts")

    # Extract selectors from HTML and JS files
    used_selectors = extract_selectors_from_files(
        [html_folder, js_folder], (".html", ".js")
    )

    # Path to CSS folder
    css_folder = os.path.join(project_folder, "static", "css")
    css_files = [
        f for f in os.listdir(css_folder) if f.endswith(".css")
    ]

    for css_file in css_files:
        css_path = os.path.join(css_folder, css_file)
        css_selectors = extract_selectors_from_css(css_path)

        # Separate used and unused selectors
        used = css_selectors & used_selectors
        unused = css_selectors - used_selectors

        print(f"\nCSS File: {css_file}")
        print(f"Used Selectors ({len(used)}): {used}")
        print(f"Unused Selectors ({len(unused)}): {unused}")


# Path to your main project folder
project_folder = ""  # Replace with the actual path
compare_css_usage(project_folder)

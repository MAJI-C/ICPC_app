import os
from lxml import etree


class SubmarineCableXML:
    def __init__(self, metadata, locations):
        self.metadata = metadata
        self.locations = locations

    def create_xml(self):
        """utilizes dictionaries in python as input, see latter example for reference"""
    
        root = etree.Element("CableData")

        # metadata
        metadata_element = etree.SubElement(root, "Metadata")
        for key, value in self.metadata.items():
            element = etree.SubElement(metadata_element, key)
            element.text = value if value is not None else "" #None will not give anything, this could be changed to a placeholder or something

        # location points
        locations_element = etree.SubElement(root, "Locations")
        for location in self.locations:
            location_element = etree.SubElement(locations_element, "Location")
            for key, value in location.items():
                element = etree.SubElement(location_element, key)
                element.text = str(value) if value is not None else "" #None will not give anything, this could be changed to a placeholder or something

        return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="UTF-8")

    def save_xml(self, file_name):
        xml_data = self.create_xml()
        with open(file_name, 'wb') as file:
            file.write(xml_data)
#         print(f"XML file saved as {file_name}") #Print statement

# Example:
metadata = {
    "Name": "Example Cable",
    "Language": "English",
    "DateStart": "2025-01-01",
    "DateEnd": None,
    "Status": "1",
    "Restrictions": "1",
    "CableType": "2",
    "WrapMaterial": "Polyethylene"
}

locations = [
    {"Index": 1, "Longitude": 12.34, "Latitude": 56.78, "Depth": 1000},
    {"Index": 2, "Longitude": 23.45, "Latitude": 67.89, "Depth": None},
    {"Index": 3, "Longitude": None, "Latitude": None, "Depth": None}
]

submarine_cable_xml = SubmarineCableXML(metadata, locations)
submarine_cable_xml.save_xml("xml_example_file.xml")
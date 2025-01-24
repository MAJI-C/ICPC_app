import os
import xml.etree.ElementTree as ET
import geojson

def process_kml_file(kml_file_path):
    """
    Converts a KML file to GeoJSON files, with metadata conforming to the specified schema.
    
    Args:
        kml_file_path (str): The path to the KML file.
    """
    def parse_kml(file_path):
        """
        Parses a KML file and extracts placemark information, filtering out standalone points.
        
        Args:
            file_path (str): The path to the KML file.
        
        Returns:
            list[dict]: A list of dictionaries, each containing 'name' and 'coordinates' for placemarks
                        with more than one coordinate.
        """
        namespace = {'kml': 'http://www.opengis.net/kml/2.2'}
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Initialize a list to store placemark information
        placemarks = []
        
        # Parse through all Placemark elements
        for placemark in root.findall('.//kml:Placemark', namespace):

            name = placemark.find('kml:name', namespace)
            name = name.text if name is not None else "Unnamed Placemark"
            
            coordinates = placemark.find('.//kml:coordinates', namespace)
            if coordinates is not None:
                # Parse coordinates (longitude, latitude, altitude)
                points = [list(map(float, coord.strip().split(','))) for coord in coordinates.text.strip().split()]
            else:
                points = []
            
            # Include only placemarks with more than one coordinate
            if len(points) > 1:
                placemarks.append({'name': name, 'coordinates': points})
        
        return placemarks

    def create_geojson(features):
        """
        Creates a GeoJSON FeatureCollection with metadata based on specified parameters.

        Args:
            features (list[dict]): A list of features, each containing 'coordinates' and other metadata.

        Returns:
            str: The GeoJSON encoding as a formatted string.
        """
        geojson_features = []
        for feature in features:
            metadata = {
                "Buried Depth": feature.get('buried_depth', None),
                "Category of Cable": feature.get('category_of_cable', None),
                "Condition": feature.get('condition', None),
                "[Feature Name]: Language": feature.get('feature_language', None),
                "[Feature Name]: Name": feature.get('feature_name', None),
                "[Feature Name]: Name Usage": feature.get('feature_name_usage', None),
                "[Fixed Date Range]: Date End": feature.get('date_end', None),
                "[Fixed Date Range]: Date Start": feature.get('date_start', None),
                "Status": feature.get('status', None),
                "Scale Minimum": feature.get('scale_minimum', None),
                "[Information]: File Locator": feature.get('file_locator', None),
                "[Information]: File Reference": feature.get('file_reference', None),
                "[Information]: Headline": feature.get('headline', None),
                "[Information]: Language": feature.get('information_language', None),
                "[Information]: Text": feature.get('information_text', None),
                "Feature Association: Component of": feature.get('component_of', None),
                "Feature Association: Updates": feature.get('updates', None),
                "Feature Association: Positions": feature.get('positions', None),
                "Feature Association: Provides Information": feature.get('provides_information', None),
            }

            geojson_feature = geojson.Feature(
                geometry=geojson.LineString(feature['coordinates']),
                properties=metadata
            )
            geojson_features.append(geojson_feature)

        feature_collection = geojson.FeatureCollection(geojson_features)

        # Encode
        return geojson.dumps(feature_collection, indent=2)
    
    placemarks = parse_kml(kml_file_path)
    cable_groups = {}

    for placemark in placemarks:
        # Extract name for metadata and file name
        feature_name = placemark['name']
        cable_name = feature_name.split()[0]  # Assuming the cable name is the first word in the feature name

        if cable_name not in cable_groups:
            cable_groups[cable_name] = []
        
        cable_groups[cable_name].append({
            'coordinates': placemark['coordinates'],
            'feature_name': feature_name
        })

    for cable_name, features in cable_groups.items():
        # File path for the GeoJSON file
        # file_path = os.path.join(os.getcwd(), f"{cable_name}.geojson")

        # Generate GeoJSON with the specified metadata
        geojson_data = create_geojson(features)

        # # Save GeoJSON to file
        # with open(file_path, 'w') as file:
        #     file.write(geojson_data)
        # print(f"Saved GeoJSON: {file_path}")

    return geojson_data
import geojson

# Define metadata
metadata = {
    "Name": "Transatlantic Cable",
    "Language": "English",
    "DateStart": "2025-01-01",
    "DateEnd": "2025-12-31",
    "Status": "1",
    "Restrictions": "1",
    "CableType": "1",
    "WrapMaterial": "Polyethylene"
}

# Define metadata
coordinates = [
    [-9.139337, 38.722252, -200],
    [-10.139337, 36.722252, -200],
    [-20.6356, 14.6937, -300],
    [-30.0, 10.0, -400],
    [-45.0, 15.0, -500],
    [-60.0, 30.0, -600],
    [-61.0, 30.0, -700],
    [-65.0, 31.0, -800],
    [-70.0, 33.0, -900],
    [-72.5, 36.0, -1000],
    [-75.165222, 39.952583, -1100]
]

# Create GeoJSON
feature = geojson.Feature(
    geometry=geojson.LineString(coordinates),
    properties=metadata
)
feature_collection = geojson.FeatureCollection([feature])

# Encode
encoded_geojson = geojson.dumps(feature_collection, indent=2)

# Save
with open('example_geojson.geojson', 'w') as file:
    file.write(encoded_geojson)
document.addEventListener("DOMContentLoaded", () => {
  /*************************************************************
   * 1) CREATE THE MAP
   *************************************************************/
  const map = L.map("map", {
    center: [40, -10],
    zoom: 3,
    minZoom: 2,
    attributionControl: false,
  });

  // Attribution in bottom-right
  L.control
    .attribution({ position: "bottomright" })
    .addTo(map)
    .setPrefix(
      'Data © <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
    );

  // Base layers (OSM, Satellite)
  const baseLayers = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      zIndex: 1,
    }),
    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { zIndex: 1 }
    ),
  };
  baseLayers.osm.addTo(map);

  /*************************************************************
   * 2) MARITIME ZONES AS VECTOR TILES
   *************************************************************/
  const vectorGrid = {
    eez: {
      url: "https://tileserver-with-data.onrender.com/data/eez_boundaries/{z}/{x}/{y}.pbf",
      className: "eez-layer",
    },
    territorial: {
      url: "https://tileserver-with-data.onrender.com/data/eez_12nm/{z}/{x}/{y}.pbf",
      className: "territorial-layer",
    },
    contiguous: {
      url: "https://tileserver-with-data.onrender.com/data/eez_24nm/{z}/{x}/{y}.pbf",
      className: "contiguous-layer",
    },
    ecs: {
      url: "https://tileserver-with-data.onrender.com/data/ecs/{z}/{x}/{y}.pbf",
      className: "ecs-layer",
    },
    highseas: {
      url: "https://tileserver-with-data.onrender.com/data/high_seas/{z}/{x}/{y}.pbf",
      className: "highseas-layer",
    },
  };

  const overlayLayers = {};
  Object.entries(vectorGrid).forEach(([key, { url, className }]) => {
    overlayLayers[key] = L.vectorGrid.protobuf(url, {
      vectorTileLayerStyles: { default: {} },
      interactive: true,
      zIndex: 9,
      getFeatureId: (feat) => feat.properties.MRGID_Ter1 || feat.properties.Sovereign1,
    });
    overlayLayers[key].options.className = className;

    overlayLayers[key].on("mouseover", (e) => {
      const props = e.layer.properties || {};
      const popupContent = `
        <strong>Zone:</strong> ${props.Sovereign1 || "Unknown"}<br>
        <strong>MRGID_Ter1:</strong> ${props.MRGID_Ter1 || "N/A"}
      `;
      L.popup({ closeButton: false, autoPan: false })
        .setLatLng(e.latlng)
        .setContent(popupContent)
        .openOn(map);
    });

    overlayLayers[key].on("mouseout", () => {
      map.closePopup();
    });
  });

  /*************************************************************
   * 3) TOGGLE BASE LAYERS & OVERLAYS
   *************************************************************/
  document.querySelectorAll('input[name="baselayer"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      Object.values(baseLayers).forEach((layer) => map.removeLayer(layer));
      baseLayers[e.target.value].addTo(map);
    });
  });

  document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const layerKey = e.target.value;
      if (overlayLayers[layerKey]) {
        if (e.target.checked) {
          overlayLayers[layerKey].addTo(map);
        } else {
          map.removeLayer(overlayLayers[layerKey]);
        }
      }
    });
  });

  /*************************************************************
   * 4) RESET OVERLAYS BUTTON
   *************************************************************/
  const resetOverlaysButton = document.getElementById("reset-overlays");
  if (resetOverlaysButton) {
    resetOverlaysButton.addEventListener("click", () => {
      document
        .querySelectorAll('input[type="checkbox"]')
        .forEach((checkbox) => {
          checkbox.checked = false;
          const layerKey = checkbox.value;
          if (overlayLayers[layerKey]) {
            map.removeLayer(overlayLayers[layerKey]);
          }
        });
    });
  }

  /*************************************************************
   * 5) POPUPS & BUTTON LOGIC
   *************************************************************/
  function setupPopup(buttonId, popupId, closeId = null) {
    const button = document.getElementById(buttonId);
    const popup = document.getElementById(popupId);

    if (!button || !popup) {
      console.error(`Popup elements missing: buttonId=${buttonId}, popupId=${popupId}`);
      return;
    }

    // Toggle popup visibility
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = popup.style.display === "block";
      document.querySelectorAll(".layers-popup").forEach((p) => (p.style.display = "none")); // Hide all other popups
      popup.style.display = isVisible ? "none" : "block";
    });

    // Close popup with a dedicated close button
    if (closeId) {
      const closeButton = document.getElementById(closeId);
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          popup.style.display = "none";
        });
      } else {
        console.warn(`Close button not found: closeId=${closeId}`);
      }
    }

    // Close popup when clicking outside
    document.addEventListener("click", (e) => {
      if (!popup.contains(e.target) && e.target !== button) {
        popup.style.display = "none";
      }
    });

    // Prevent closing when clicking inside the popup
    popup.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Initialize popups
  setupPopup("cable-filter-button", "cables-popup", "close-cables-popup");
  setupPopup("layers-button", "layers-popup");

  /*************************************************************
   * 6) CABLE FILTERING LOGIC
   *************************************************************/
  const cablesGroup = L.featureGroup().addTo(map);

  // Function to style cables
  function getCableStyle(properties) {
    const styles = {
      "1": { color: "green", weight: 3 },
      "5": { color: "orange", weight: 3 },
      default: { color: "gray", weight: 2 },
    };
    return styles[properties?.Condition] || styles.default;
  }

  /*************************************************************
   * 3) FETCH CABLES AND POPULATE CHECKBOXES
   *************************************************************/
  function fetchCables(filters = {}) {
    console.log("Fetching cables with filters:", filters);

    const url = new URL("/api/cables", window.location.origin);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });

    return fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
      })
      .catch((err) => {
        console.error("Error fetching cables:", err);
        return { features: [] };
      });
  }

  function updateCheckboxes(features) {
    const checkboxList = document.getElementById("checkbox-list");
    checkboxList.innerHTML = ""; // Clear current list

    if (!features || features.length === 0) {
      checkboxList.innerHTML = "<p>No cables available.</p>";
      return;
    }

    const cableNames = new Set(
      features.map((f) => f.properties["[Feature Name]: Name"] || "Unknown")
    );

    cableNames.forEach((name) => {
      const wrapper = document.createElement("div");
      const checkbox = document.createElement("input");
      const label = document.createElement("label");

      checkbox.type = "checkbox";
      checkbox.value = name;
      checkbox.id = `checkbox-${name}`;
      label.htmlFor = `checkbox-${name}`;
      label.textContent = name;

      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      checkboxList.appendChild(wrapper);

      checkbox.addEventListener("change", () =>
        updateMapWithSelectedCheckboxes(features)
      );
    });
  }

  function updateMapWithSelectedCheckboxes(features) {
    const selectedNames = Array.from(
      document.querySelectorAll(
        '#checkbox-list input[type="checkbox"]:checked'
      )
    ).map((checkbox) => checkbox.value);

    cablesGroup.clearLayers();

    features.forEach((feature) => {
      const name = feature.properties["[Feature Name]: Name"] || "Unknown";
      if (selectedNames.includes(name)) {
        const layer = L.geoJSON(feature, {
          style: getCableStyle(feature.properties),
        }).addTo(cablesGroup);

        layer.bindPopup(`
          <strong>Name:</strong> ${name}<br>
          <strong>Status:</strong> ${feature.properties["Status"] || "Unknown"}<br>
          <strong>Condition:</strong> ${
            feature.properties["Condition"] || "Unknown"
          }
        `);
      }
    });
  }

  /*************************************************************
   * 4) APPLY FILTERS AND RESET
   *************************************************************/
  function applyFilters() {
    const status = document.getElementById("status-select").value;
    const condition = document.getElementById("condition-select").value;

    const filters = {
      Status: status || null,
      Condition: condition || null,
    };

    fetchCables(filters).then((geojson) => {
      if (geojson && geojson.features) {
        updateCheckboxes(geojson.features);
        updateMapWithSelectedCheckboxes(geojson.features);
      }
    });
  }

  document
    .getElementById("status-select")
    .addEventListener("change", applyFilters);
  document
    .getElementById("condition-select")
    .addEventListener("change", applyFilters);

  document
    .getElementById("reset-filters")
    .addEventListener("click", () => {
      document.getElementById("status-select").value = "";
      document.getElementById("condition-select").value = "";

      fetchCables().then((geojson) => {
        if (geojson && geojson.features) {
          updateCheckboxes(geojson.features);
          updateMapWithSelectedCheckboxes(geojson.features);
        }
      });
    });

  // Initialize
  fetchCables().then((geojson) => {
    if (geojson && geojson.features) {
      updateCheckboxes(geojson.features);
      updateMapWithSelectedCheckboxes(geojson.features);
    }
  });
});
function fetchCableCrossings() {
  fetch("/api/cable-crossings")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const { cable_crossings, zone_intersections } = data;

      // Visualize cable-to-cable crossings
      cable_crossings.forEach((crossing) => {
        const { cable_1, cable_2 } = crossing;
        console.log(
          `Cable 1: ${cable_1["[Feature Name]: Name"]} crosses Cable 2: ${cable_2["[Feature Name]: Name"]}`
        );
        L.marker(cable_1.geometry.coordinates[0], {
          title: `Crossing between ${cable_1["[Feature Name]: Name"]} and ${cable_2["[Feature Name]: Name"]}`
        }).addTo(map);
      });

      // Visualize cable-to-zone intersections
      zone_intersections.forEach((intersection) => {
        const { cable, zone } = intersection;
        console.log(
          `Cable: ${cable["[Feature Name]: Name"]} intersects Zone: ${zone["[Feature Name]: Name"]}`
        );
        L.marker(cable.geometry.coordinates[0], {
          title: `Intersection between ${cable["[Feature Name]: Name"]} and Zone: ${zone["[Feature Name]: Name"]}`
        }).addTo(map);
      });
    })
    .catch((err) => console.error("Error fetching cable crossings:", err));
}

/*************************************************************
 * 4) ADD CHECKBOXES FOR CROSSING OPTIONS
 *************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const checkboxList = document.getElementById("checkbox-list");

  checkboxList.innerHTML += `
    <div>
      <label>
        <input type="checkbox" id="show-crossings" />
        Show Crossings with Other Cables
      </label>
    </div>
    <div>
      <label>
        <input type="checkbox" id="show-zone-intersections" />
        Show Crossings with Maritime Zones
      </label>
    </div>
  `;

  document.getElementById("show-crossings").addEventListener("change", (e) => {
    if (e.target.checked) {
      fetchCableCrossings();
    } else {
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          map.removeLayer(layer);
        }
      });
    }
  });
});


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

  // Fetch and display cables based on filters
  function fetchCables(filters = {}) {
    console.log("Fetching cables with filters:", filters);

    const url = new URL("/api/cables", window.location.origin);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
      })
      .then((geojson) => {
        cablesGroup.clearLayers();

        if (!geojson.features || geojson.features.length === 0) {
          console.warn("No cable data found for filters.");
          return;
        }

        geojson.features.forEach((feature) => {
          const layer = L.geoJSON(feature, {
            style: getCableStyle(feature.properties),
          }).addTo(cablesGroup);

          layer.bindPopup(`
            <strong>Name:</strong> ${feature.properties["[Feature Name]: Name"] || "N/A"}<br>
            <strong>Status:</strong> ${feature.properties["Status"] || "Unknown"}<br>
            <strong>Condition:</strong> ${feature.properties["Condition"] || "Unknown"}<br>
            <strong>Category:</strong> ${feature.properties["Category of Cable"] || "N/A"}
          `);
        });
      })
      .catch((err) => console.error("Error fetching cables:", err));
  }

  // Dynamically apply filters
  function applyFilters() {
    const status = document.getElementById("status-select").value;
    const condition = document.getElementById("condition-select").value;
    const selectedNames = Array.from(
      document.querySelectorAll('#checkbox-list input[type="checkbox"]:checked')
    ).map((checkbox) => checkbox.value);

    const filters = {
      Status: status || null,
      Condition: condition || null,
      Name: selectedNames.length > 0 ? selectedNames : null,
    };

    console.log("Applying filters:", filters);
    fetchCables(filters);
  }

  // Populate checkboxes dynamically
  function populateCheckboxes() {
    const checkboxList = document.getElementById("checkbox-list");
    if (!checkboxList) {
      console.error("Checkbox list element not found!");
      return;
    }
  
    fetch("/api/cables")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
      })
      .then((geojson) => {
        console.log("Received cables data:", geojson); // Debugging
        checkboxList.innerHTML = ""; // Clear existing checkboxes
  
        if (!geojson.features || geojson.features.length === 0) {
          checkboxList.innerHTML = "<p>No cables available.</p>";
          console.warn("No cables found in the response.");
          return;
        }
  
        const cableNames = new Set(
          geojson.features.map((f) => f.properties["[Feature Name]: Name"] || "Unknown")
        );
  
        cableNames.forEach((name) => {
          const wrapper = document.createElement("div");
          const checkbox = document.createElement("input");
          const label = document.createElement("label");
  
          checkbox.type = "checkbox";
          checkbox.value = name;
          label.textContent = name;
  
          wrapper.appendChild(checkbox);
          wrapper.appendChild(label);
          checkboxList.appendChild(wrapper);
  
          checkbox.addEventListener("change", applyFilters);
        });
  
        console.log("Cable names populated:", Array.from(cableNames)); // Debug populated names
      })
      .catch((err) => console.error("Error populating checkboxes:", err));
  }

  // Reset filters
  document.getElementById("reset-filters").addEventListener("click", () => {
    document.getElementById("status-select").value = "";
    document.getElementById("condition-select").value = "";
    document.querySelectorAll('#checkbox-list input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = false;
    });
    cablesGroup.clearLayers();
  });

  // Cable styling
  function getCableStyle(properties) {
    const styles = {
      "1": { color: "green", weight: 3 },
      "5": { color: "orange", weight: 3 },
      default: { color: "gray", weight: 2 },
    };
    return styles[properties?.Condition] || styles.default;
  }

  // Initialize
  populateCheckboxes();


  /*************************************************************
   * 3) DETECT CABLE CROSSINGS
   *************************************************************/
  function fetchCableCrossings() {
    fetch("/api/cable-crossings")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (data.crossings && data.crossings.length > 0) {
          data.crossings.forEach((crossing) => {
            alert(
              `Cable 1: ${crossing.cable_1["[Feature Name]: Name"]} crosses Cable 2: ${crossing.cable_2["[Feature Name]: Name"]}`
            );
          });
        } else {
          console.log("No cable crossings detected.");
        }
      })
      .catch((err) => console.error("Error fetching cable crossings:", err));
  }

  fetchCableCrossings();
});

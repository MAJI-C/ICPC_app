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

  // Base layers
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

  // Leaflet attribution
  L.control
    .attribution({ position: "bottomright" })
    .addTo(map)
    .setPrefix('Data © <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors');

  /*************************************************************
   * 2) MARITIME ZONES (Vector Tiles) for Visualization Only
   *************************************************************/
  const vectorGrid = {
    territorial: {
      url: "https://tileserver-with-data.onrender.com/data/eez_12nm/{z}/{x}/{y}.pbf",
      className: "territorial-layer",
    },
    contiguous: {
      url: "https://tileserver-with-data.onrender.com/data/eez_24nm/{z}/{x}/{y}.pbf",
      className: "contiguous-layer",
    },
    eez: {
      url: "https://tileserver-with-data.onrender.com/data/eez_boundaries/{z}/{x}/{y}.pbf",
      className: "eez-layer",
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

    // Optional mouseover popup for zone name
    overlayLayers[key].on("mouseover", (e) => {
      const props = e.layer.properties || {};
      const popupContent = `
        <strong>Zone:</strong> ${props.Sovereign1 || "Unknown"}<br/>
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
  // Base layer radio
  document.querySelectorAll('input[name="baselayer"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      Object.values(baseLayers).forEach((layer) => map.removeLayer(layer));
      baseLayers[e.target.value].addTo(map);
    });
  });

  // Overlays checkboxes
  document
    .querySelectorAll('input[type="checkbox"][value]')
    .forEach((checkbox) => {
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

  // Reset Overlays button
  const resetOverlaysButton = document.getElementById("reset-overlays");
  if (resetOverlaysButton) {
    resetOverlaysButton.addEventListener("click", () => {
      document
        .querySelectorAll('input[type="checkbox"][value]')
        .forEach((cb) => {
          cb.checked = false;
          const key = cb.value;
          if (overlayLayers[key]) {
            map.removeLayer(overlayLayers[key]);
          }
        });
    });
  }

  /*************************************************************
   * 4) POPUPS & BUTTON LOGIC (Layers, Cable Filter popups)
   *************************************************************/
  function setupPopup(buttonId, popupId, closeId = null) {
    const button = document.getElementById(buttonId);
    const popup = document.getElementById(popupId);
    if (!button || !popup) return;

    button.addEventListener("click", (evt) => {
      evt.stopPropagation();
      const isVisible = popup.style.display === "block";
      // Hide other popups
      document.querySelectorAll(".popup").forEach((p) => (p.style.display = "none"));
      popup.style.display = isVisible ? "none" : "block";
    });

    if (closeId) {
      const closeButton = document.getElementById(closeId);
      if (closeButton) {
        closeButton.addEventListener("click", () => (popup.style.display = "none"));
      }
    }

    document.addEventListener("click", (evt) => {
      if (!popup.contains(evt.target) && evt.target !== button) {
        popup.style.display = "none";
      }
    });

    popup.addEventListener("click", (evt) => {
      evt.stopPropagation();
    });
  }

  setupPopup("cable-filter-button", "cables-popup", "close-cables-popup");
  setupPopup("layers-button", "layers-popup");

  /*************************************************************
   * 5) CABLE LOGIC (FILTERS + CHECKBOXES)
   *************************************************************/
  const cablesGroup = L.featureGroup().addTo(map);

  // Style cables by Condition
  function getCableStyle(props) {
    // Thicker lines with partial opacity
    const conditionStyles = {
      "1": { color: "green", weight: 6, opacity: 0.5 },
      "5": { color: "orange", weight: 6, opacity: 0.5 },
      default: { color: "gray", weight: 4, opacity: 0.5 },
    };
    return conditionStyles[props?.Condition] || conditionStyles.default;
  }

  // We'll keep references to zone/cable crossing layers for each cable
  // so we can remove them if the cable is unchecked or reset
  const zoneCrossingsByCable = {
    territorial: {},
    contiguous: {},
    eez: {},
    ecs: {},
    highseas: {},
  };

  // And cableCrossingsByCable for cable-to-cable intersections
  const cableCrossingsByCable = {};

  // Fetch cables from /api/cables
  function fetchCables(filters = {}) {
    const url = new URL("/api/cables", window.location.origin);
    Object.entries(filters).forEach(([k, v]) => {
      if (v) url.searchParams.append(k, v);
    });
    return fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP error! Status: ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error("Error fetching cables:", err);
        return { features: [] };
      });
  }

  // Populate checkboxes
  function updateCheckboxes(features) {
    const checkboxList = document.getElementById("checkbox-list");
    if (!checkboxList) return;
    checkboxList.innerHTML = "";

    if (!features || features.length === 0) {
      checkboxList.innerHTML = "<p>No cables available.</p>";
      return;
    }

    // Unique cable names
    const cableNames = new Set(
      features.map((f) => f.properties["[Feature Name]: Name"] || "Unknown")
    );

    cableNames.forEach((name) => {
      const div = document.createElement("div");
      const cb = document.createElement("input");
      const label = document.createElement("label");

      cb.type = "checkbox";
      cb.value = name;
      cb.id = `checkbox-${name}`;
      label.htmlFor = `checkbox-${name}`;
      label.textContent = name;

      div.appendChild(cb);
      div.appendChild(label);
      checkboxList.appendChild(div);

      // When user checks/unchecks a cable
      cb.addEventListener("change", () =>
        handleCableCheckboxChange(features, name, cb.checked)
      );
    });
  }

  function handleCableCheckboxChange(allFeatures, cableName, checked) {
    if (checked) {
      // re-run "updateMapWithSelected" to draw
      updateMapWithSelectedCheckboxes(allFeatures);
    } else {
      // remove that cable's lines from map
      removeCableAndCrossings(cableName);
      // re-run update (some lines might remain from other cables)
      updateMapWithSelectedCheckboxes(allFeatures);
    }
  }

  function removeCableAndCrossings(cableName) {
    // Remove zone crossing lines for that cable
    Object.keys(zoneCrossingsByCable).forEach((zone) => {
      if (zoneCrossingsByCable[zone][cableName]) {
        map.removeLayer(zoneCrossingsByCable[zone][cableName]);
        delete zoneCrossingsByCable[zone][cableName];
      }
    });
    // Remove cable-cable intersections
    if (cableCrossingsByCable[cableName]) {
      map.removeLayer(cableCrossingsByCable[cableName]);
      delete cableCrossingsByCable[cableName];
    }
  }

  // Show only checked cables in cablesGroup
  function updateMapWithSelectedCheckboxes(features) {
    cablesGroup.clearLayers();
    const selectedNames = getSelectedCables();

    features.forEach((feat) => {
      const cName = feat.properties["[Feature Name]: Name"] || "Unknown";
      if (selectedNames.includes(cName)) {
        const layer = L.geoJSON(feat, { style: getCableStyle(feat.properties) })
          .bindPopup(`
            <div style="display:flex; align-items:center;">
              <i class="fa-solid fa-circle" style="color:blue; margin-right:5px;"></i>
              <div>
                <strong>Cable:</strong> ${cName}<br/>
                <strong>Status:</strong> ${feat.properties["Status"] || "?"}<br/>
                <strong>Condition:</strong> ${feat.properties["Condition"] || "?"}
              </div>
            </div>
          `);
        layer.addTo(cablesGroup);
      }
    });
  }

  // Filter logic
  function applyFilters() {
    const statusVal = document.getElementById("status-select")?.value || "";
    const condVal = document.getElementById("condition-select")?.value || "";

    const filters = {
      Status: statusVal || null,
      Condition: condVal || null,
    };

    fetchCables(filters).then((geojson) => {
      if (geojson && geojson.features) {
        updateCheckboxes(geojson.features);
        updateMapWithSelectedCheckboxes(geojson.features);
      }
    });
  }

  document.getElementById("status-select")?.addEventListener("change", applyFilters);
  document.getElementById("condition-select")?.addEventListener("change", applyFilters);

  document.getElementById("reset-filters")?.addEventListener("click", () => {
    document.getElementById("status-select").value = "";
    document.getElementById("condition-select").value = "";
    fetchCables().then((geojson) => {
      if (geojson && geojson.features) {
        updateCheckboxes(geojson.features);
        updateMapWithSelectedCheckboxes(geojson.features);
      }
    });
  });

  // Initial fetch all cables
  fetchCables().then((geojson) => {
    if (geojson && geojson.features) {
      updateCheckboxes(geojson.features);
      updateMapWithSelectedCheckboxes(geojson.features);
    }
  });

  /*************************************************************
   * 6) ZONE CROSSINGS TOGGLES
   *************************************************************/
  const territorialGroup = L.featureGroup().addTo(map);
  const contiguousGroup  = L.featureGroup().addTo(map);
  const eezGroup         = L.featureGroup().addTo(map);
  const ecsGroup         = L.featureGroup().addTo(map);
  const highSeasGroup    = L.featureGroup().addTo(map);

  zoneCrossingsByCable.territorial = {};
  zoneCrossingsByCable.contiguous  = {};
  zoneCrossingsByCable.eez         = {};
  zoneCrossingsByCable.ecs         = {};
  zoneCrossingsByCable.highseas    = {};

  let territorialVisible = false;
  let contiguousVisible  = false;
  let eezVisible         = false;
  let ecsVisible         = false;
  let highSeasVisible    = false;

  // Helper for cable checkboxes
  function getSelectedCables() {
    return Array.from(
      document.querySelectorAll('#checkbox-list input[type="checkbox"]:checked')
    ).map((cb) => cb.value);
  }

  // fetch zone crossing
  function fetchZoneCrossings(zone, cableName = "") {
    let endpoint, color, group, zoneRef;
    switch (zone) {
      case "territorial":
        endpoint = "/api/cable-crossings/territorial";
        color = "red";
        group = territorialGroup;
        zoneRef = zoneCrossingsByCable.territorial;
        break;
      case "contiguous":
        endpoint = "/api/cable-crossings/contiguous";
        color = "orange";
        group = contiguousGroup;
        zoneRef = zoneCrossingsByCable.contiguous;
        break;
      case "eez":
        endpoint = "/api/cable-crossings/eez";
        color = "blue";
        group = eezGroup;
        zoneRef = zoneCrossingsByCable.eez;
        break;
      case "ecs":
        endpoint = "/api/cable-crossings/ecs";
        color = "purple";
        group = ecsGroup;
        zoneRef = zoneCrossingsByCable.ecs;
        break;
      case "highseas":
        endpoint = "/api/cable-crossings/highseas";
        color = "green";
        group = highSeasGroup;
        zoneRef = zoneCrossingsByCable.highseas;
        break;
      default:
        console.warn(`Unknown zone: ${zone}`);
        return;
    }

    const url = new URL(endpoint, window.location.origin);
    if (cableName) url.searchParams.append("cable", cableName);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const { intersections } = data;
        if (!zoneRef[cableName]) {
          zoneRef[cableName] = L.featureGroup();
        }
        const cableFG = zoneRef[cableName];
        intersections.forEach((inter) => {
          const cName = inter.cable_name || "Unknown";
          const zLabel = inter.zone_label || zone;
          const ctry   = inter.country_name || "Unknown";
          const lenKm  = inter.intersection_km || 0;
          const geometry = inter.geometry;

          const lyr = L.geoJSON(geometry, {
            style: { color, weight: 8, opacity: 0.7 },
            onEachFeature: (feat, layer) => {
              layer.bindPopup(`
                <div style="display:flex; align-items:center;">
                  <i class="fa-solid fa-triangle-exclamation" style="color:${color}; margin-right:5px;"></i>
                  <div>
                    <strong>Cable:</strong> ${cName}<br/>
                    <strong>Zone:</strong> ${zLabel} (${ctry})<br/>
                    <strong>Approx. Length:</strong> ${lenKm} km
                  </div>
                </div>
              `);
            }
          });
          lyr.addTo(cableFG);
        });
        cableFG.addTo(group);
      })
      .catch((err) => console.error(`Error fetching ${zone} crossings:`, err));
  }

  // Territorial button
  const terrBtn = document.getElementById("show-territorial-btn");
  terrBtn?.addEventListener("click", () => {
    territorialVisible = !territorialVisible;
    if (territorialVisible) {
      const selectedCables = getSelectedCables();
      if (selectedCables.length === 0) {
        // if no cables, fetch all or partial logic
        fetchZoneCrossings("territorial");
      } else {
        selectedCables.forEach((cName) => fetchZoneCrossings("territorial", cName));
      }
      terrBtn.classList.add("active");
    } else {
      territorialGroup.clearLayers();
      zoneCrossingsByCable.territorial = {};
      terrBtn.classList.remove("active");
    }
  });

  // Repeat similarly for contiguous, eez, ecs, highseas
  const contigBtn = document.getElementById("show-contiguous-btn");
  contigBtn?.addEventListener("click", () => {
    contiguousVisible = !contiguousVisible;
    if (contiguousVisible) {
      const selCables = getSelectedCables();
      if (selCables.length === 0) {
        fetchZoneCrossings("contiguous");
      } else {
        selCables.forEach((c) => fetchZoneCrossings("contiguous", c));
      }
      contigBtn.classList.add("active");
    } else {
      contiguousGroup.clearLayers();
      zoneCrossingsByCable.contiguous = {};
      contigBtn.classList.remove("active");
    }
  });

  const eezBtn = document.getElementById("show-eez-btn");
  eezBtn?.addEventListener("click", () => {
    eezVisible = !eezVisible;
    if (eezVisible) {
      const selCables = getSelectedCables();
      if (selCables.length === 0) {
        fetchZoneCrossings("eez");
      } else {
        selCables.forEach((c) => fetchZoneCrossings("eez", c));
      }
      eezBtn.classList.add("active");
    } else {
      eezGroup.clearLayers();
      zoneCrossingsByCable.eez = {};
      eezBtn.classList.remove("active");
    }
  });

  const ecsBtn = document.getElementById("show-ecs-btn");
  ecsBtn?.addEventListener("click", () => {
    ecsVisible = !ecsVisible;
    if (ecsVisible) {
      const selCables = getSelectedCables();
      if (selCables.length === 0) {
        fetchZoneCrossings("ecs");
      } else {
        selCables.forEach((c) => fetchZoneCrossings("ecs", c));
      }
      ecsBtn.classList.add("active");
    } else {
      ecsGroup.clearLayers();
      zoneCrossingsByCable.ecs = {};
      ecsBtn.classList.remove("active");
    }
  });

  const hsBtn = document.getElementById("show-highseas-btn");
  hsBtn?.addEventListener("click", () => {
    highSeasVisible = !highSeasVisible;
    if (highSeasVisible) {
      const selCables = getSelectedCables();
      if (selCables.length === 0) {
        fetchZoneCrossings("highseas");
      } else {
        selCables.forEach((c) => fetchZoneCrossings("highseas", c));
      }
      hsBtn.classList.add("active");
    } else {
      highSeasGroup.clearLayers();
      zoneCrossingsByCable.highseas = {};
      hsBtn.classList.remove("active");
    }
  });

  /*************************************************************
   * 7) CABLE-TO-CABLE CROSSINGS
   *************************************************************/
  const cableCrossingsGroup = L.featureGroup().addTo(map);
  let cableCrossingsVisible = false;

  const toggleCrossingsBtn = document.getElementById("toggle-crossings");
  toggleCrossingsBtn?.addEventListener("click", () => {
    cableCrossingsVisible = !cableCrossingsVisible;
    if (cableCrossingsVisible) {
      const selectedCables = getSelectedCables();
      if (selectedCables.length === 1) {
        fetchCableCrossings(selectedCables[0]);
        toggleCrossingsBtn.classList.add("active");
      } else if (selectedCables.length > 1) {
        alert("Please select only one cable to see its crossings with others!");
        cableCrossingsVisible = false;
      } else {
        alert("No cable selected.");
        cableCrossingsVisible = false;
      }
    } else {
      cableCrossingsGroup.clearLayers();
      // also clear references
      Object.keys(cableCrossingsByCable).forEach((cN) => {
        map.removeLayer(cableCrossingsByCable[cN]);
      });
      toggleCrossingsBtn.classList.remove("active");
    }
  });

  function fetchCableCrossings(cableName) {
    const url = new URL("/api/cable-crossings/cables", window.location.origin);
    url.searchParams.append("cable", cableName);

    // create a featureGroup for that cable's intersections
    const fg = L.featureGroup();
    cableCrossingsByCable[cableName] = fg;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP error! ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const { crossings } = data; // array of { cableA, cableB, geometry }
        crossings.forEach((cx) => {
          const geometry = cx.geometry;
          const cA = cx.cableA;
          const cB = cx.cableB;

          const layer = L.geoJSON(geometry, {
            pointToLayer: (pt, latlng) =>
              L.circleMarker(latlng, {
                radius: 10,
                color: "red",
                weight: 2,
                fillColor: "red",
                fillOpacity: 1,
              }),
            onEachFeature: (feat, lyr) => {
              lyr.bindPopup(`
                <strong>Cable A:</strong> ${cA}<br/>
                <strong>Cable B:</strong> ${cB}
              `);
            },
          });
          layer.addTo(fg);
        });
        fg.addTo(cableCrossingsGroup);
      })
      .catch((err) => console.error("Error fetching cable-to-cable crossings:", err));
  }

  /*************************************************************
   * 8) RESET ALL button (optional)
   *************************************************************/
  const resetAllBtn = document.getElementById("reset-all-filters");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", () => {
      // 1) Uncheck all cable checkboxes
      document
        .querySelectorAll('#checkbox-list input[type="checkbox"]')
        .forEach((cb) => {
          cb.checked = false;
        });
      cablesGroup.clearLayers();

      // 2) Clear zone crossing lines
      Object.values(zoneCrossingsByCable).forEach((zoneObj) => {
        Object.values(zoneObj).forEach((fg) => map.removeLayer(fg));
      });
      zoneCrossingsByCable.territorial = {};
      zoneCrossingsByCable.contiguous  = {};
      zoneCrossingsByCable.eez         = {};
      zoneCrossingsByCable.ecs         = {};
      zoneCrossingsByCable.highseas    = {};

      // Also clear the zone group layers
      territorialGroup.clearLayers();
      contiguousGroup.clearLayers();
      eezGroup.clearLayers();
      ecsGroup.clearLayers();
      highSeasGroup.clearLayers();

      // 3) Clear cable-cable lines
      cableCrossingsGroup.clearLayers();
      Object.keys(cableCrossingsByCable).forEach((cN) => {
        map.removeLayer(cableCrossingsByCable[cN]);
      });

      // reset the dictionary
      for (const cName in cableCrossingsByCable) {
        delete cableCrossingsByCable[cName];
      }

      // 4) Un-toggle zone button states
      territorialVisible = false;
      contiguousVisible  = false;
      eezVisible         = false;
      ecsVisible         = false;
      highSeasVisible    = false;
      document.getElementById("show-territorial-btn")?.classList.remove("active");
      document.getElementById("show-contiguous-btn")?.classList.remove("active");
      document.getElementById("show-eez-btn")?.classList.remove("active");
      document.getElementById("show-ecs-btn")?.classList.remove("active");
      document.getElementById("show-highseas-btn")?.classList.remove("active");

      // 5) If "Cable Crossings" is active, revert that too
      cableCrossingsVisible = false;
      document.getElementById("toggle-crossings")?.classList.remove("active");

      // 6) Optionally, reset cable filters
      const statusSel = document.getElementById("status-select");
      const condSel   = document.getElementById("condition-select");
      if (statusSel) statusSel.value = "";
      if (condSel)   condSel.value   = "";

      // Hide all popups if open
      document.querySelectorAll(".popup").forEach((p) => (p.style.display = "none"));
    });
  }
});

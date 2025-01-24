// converter.js
document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const converterButton = document.getElementById("converter-button");
  const converterPopup = document.getElementById("converter-popup");
  const overlay = document.getElementById("overlay");
  const closePopupButton = document.getElementById("close-converter-popup");

  const fileInput = document.getElementById("file-input");
  const fileNameDisplay = document.getElementById("file-name");
  const fileError = document.getElementById("file-error");

  const metadataForm = document.getElementById("metadata-form");
  const metadataContainer = document.getElementById("metadata-container");

  const saveMetadataBtn = document.getElementById("save-metadata");
  const confirmButton = document.getElementById("confirm-button");
  const downloadButton = document.getElementById("download-button");

  // Store the current FeatureCollection in JS memory
  let currentGeoJSON = null;

  // Basic popup open/close
  function openPopup() {
    converterPopup.style.display = "block";
    overlay.style.display = "block";
  }
  function closePopup() {
    converterPopup.style.display = "none";
    overlay.style.display = "none";
    resetPopup();
  }

  // Attach events
  converterButton.addEventListener("click", openPopup);
  closePopupButton.addEventListener("click", closePopup);
  overlay.addEventListener("click", closePopup);

  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape") {
      closePopup();
    }
  });

  function resetPopup() {
    fileInput.value = "";
    fileNameDisplay.textContent = "No file chosen";
    fileError.textContent = "";
    metadataContainer.innerHTML = "";
    currentGeoJSON = null;
  }

  // 1) File selection + immediate upload
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileNameDisplay.textContent = file.name;
    fileError.textContent = "";

    const formData = new FormData();
    formData.append("file", file);

    fetch("/upload_and_convert", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          fileError.textContent = data.error || "An error occurred.";
          return;
        }
        // We got a real FeatureCollection from the server
        currentGeoJSON = data.geojson;
        fileError.textContent = data.message || "File parsed successfully.";

        // Build the metadata form for each Feature
        buildMetadataForm(currentGeoJSON);
      })
      .catch((err) => {
        console.error("Error uploading file:", err);
        fileError.textContent = "Error uploading file.";
      });
  });

  // 2) Build a simple UI for editing the metadata
  function buildMetadataForm(featureCollection) {
    if (!featureCollection || !featureCollection.features) {
      metadataContainer.innerHTML = "<p>No features to show.</p>";
      return;
    }

  let html = "";
  featureCollection.features.forEach((feat, idx) => {
    const props = feat.properties || {};
  
    // Define category explanations
    const explanations = {
      "Category of Cable": "1 : power line, 6 : mooring cable, 7 : ferry, 9: junction cable, 10 : telecommunications cable, Unknown: Not classified",
      "Condition": "1: under construction, 5: planned construction, Unknown: Condition not classified",
      "Status": "1: permanent, 4: not in use, 13: historic, 18: existence doubtful, Unknown: Status not classified"
    };
  
    // Build dropdown options
    const buildOptions = (categories, value) => {
      return categories.map(category => 
        `<option value="${category}" ${category === value ? "selected" : ""}>${category}</option>`
      ).join('');
    };
  
    // Helper function to generate warning message if needed
    const missingOrInvalidMessage = (value, categories, fieldName) => {
      if (!value) {
        // Red message for missing data
        return `<span style="color: red;">Please fill the data for "${fieldName}"</span>`;
      }
      if (!categories.includes(value)) {
        // Orange message for invalid data
        return `<span style="color: orange;">${value} (Data not standard)</span>`;
      }
      return '';
    };
  
    html += `<div class="form-row">
          <h4>Feature #${idx + 1}</h4>
          <label title="Enter the name of the feature">[Feature Name]: Name: </label>
          <input type="text" data-fidx="${idx}" data-key="[Feature Name]: Name" 
                  value="${props["[Feature Name]: Name"] || ""}">
        </div>
        <div class="form-row">
          <label title="${explanations["Category of Cable"]}">Category of Cable:</label>
          <select data-fidx="${idx}" data-key="Category of Cable">
            ${buildOptions(["1", "6", "7", "9", "10", "Unknown"], props["Category of Cable"])}
          </select>
          ${missingOrInvalidMessage(props["Category of Cable"], ["1", "6", "7", "9", "10", "Unknown"], "Category of Cable")}
        </div>
        <div class="form-row">
          <label title="${explanations["Condition"]}">Condition (Required): <span style="color: red;">*</span></label>
          <select data-fidx="${idx}" data-key="Condition">
            ${buildOptions(["1", "5", "Unknown"], props["Condition"])}
          </select>
          ${missingOrInvalidMessage(props["Condition"], ["1", "5", "Unknown"], "Condition")}
        </div>
        <div class="form-row">
          <label title="${explanations["Status"]}">Status:</label>
          <select data-fidx="${idx}" data-key="Status">
            ${buildOptions(["1", "4", "13", "18", "Unknown"], props["Status"])}
          </select>
          ${missingOrInvalidMessage(props["Status"], ["1", "4", "13", "18", "Unknown"], "Status")}
        </div>`;
  });
  
  metadataContainer.innerHTML = html;
    
  }

  function buildOptions(optionsArray, currentVal) {
    return optionsArray
      .map((opt) => {
        const selected = (opt === currentVal) ? "selected" : "";
        return `<option value="${opt}" ${selected}>${opt}</option>`;
      })
      .join("");
  }

  // 3) "Save Metadata" merges UI inputs -> `currentGeoJSON`
  saveMetadataBtn.addEventListener("click", () => {
    if (!currentGeoJSON || !currentGeoJSON.features) return;

    // Collect all input/select fields in metadataContainer
    const inputs = metadataContainer.querySelectorAll("[data-fidx]");
    inputs.forEach((el) => {
      const fidx = parseInt(el.getAttribute("data-fidx"));
      const key = el.getAttribute("data-key");
      const value = el.value;
      // Update the properties in memory
      currentGeoJSON.features[fidx].properties[key] = value;
    });

    alert("Metadata saved to JSON in memory!");
  });

  // 4) Confirm & Insert to DB
  confirmButton.addEventListener("click", () => {
    if (!currentGeoJSON) {
      alert("No GeoJSON to confirm.");
      return;
    }
    fetch("/confirm_insertion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson: currentGeoJSON })
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          alert("DB Error: " + (data.error || "unknown"));
          return;
        }
        alert("Inserted to DB. Cable ID: " + data.cable_id);
      })
      .catch(err => {
        console.error(err);
        alert("Error inserting to DB.");
      });
  });

  // 5) Download final GeoJSON
  downloadButton.addEventListener("click", (evt) => {
    evt.preventDefault();
    if (!currentGeoJSON) {
      alert("No GeoJSON to download.");
      return;
    }
    fetch("/download_geojson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson: currentGeoJSON })
    })
      .then(res => {
        if (!res.ok) throw new Error("Download request failed");
        return res.blob();
      })
      .then(blob => {
        // Create a temporary link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "converted.geojson";
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => {
        console.error(err);
        alert("Error downloading file.");
      });
  });
});

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
  const requiredFields = [
    "Category of Cable",
    "Condition",
    "[Feature Name]: Name",
    "Status"
  ];
  
  const metadataForm = document.getElementById("metadata-form");
  const metadataContainer = document.getElementById("metadata-container");
  const addToMapButton = document.getElementById("add-to-map-button");
  const saveMetadataBtn = document.getElementById("save-metadata");
  const confirmButton = document.getElementById("confirm-button");
  const downloadButton = document.getElementById("download-button");
  const progressScreen = document.getElementById("progress-screen");
  const progressMessage = document.getElementById("progress-message");
  const propertiesForm = document.getElementById("properties-form");
  const saveButton = document.getElementById("save-button");
  const progressBar = document.getElementById("progress-bar");
  const propertiesEditor = document.getElementById("properties-editor");
  const propertiesFields = document.getElementById("properties-fields");
  const savePropertiesButton = document.getElementById("save-properties-button");
  const propertyEditScreen = document.getElementById("property-edit-screen");

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

    const fileExtension = file.name.split(".").pop().toLowerCase();

    if (fileExtension === "kml") {
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
          metadataForm.style.display = "block";
          propertyEditScreen.style.display = "none";
          progressScreen.style.display = "none";
        })
        .catch((err) => {
          console.error("Error uploading file:", err);
          fileError.textContent = "Error uploading file.";
        });
    }
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
      body: JSON.stringify({ geojson: currentGeoJSON }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          alert("DB Error: " + (data.error || "unknown"));
          return;
        }
        alert("Inserted to DB. Cable ID: " + data.cable_id);
      })
      .catch((err) => {
        console.error(err);
        alert("Error inserting to DB.");
      });
  });

  // 5) Download final GeoJSON
  downloadButton.addEventListener("click", (evt) => {
    evt.preventDefault();
    if (!currentGeoJSON) {
      alert("No GeoJSON found.");
      return; // Exit early if no GeoJSON
    }
    fetch("/download_geojson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson: currentGeoJSON }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Download request failed");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "converted.geojson";
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((err) => {
        console.error(err);
        alert("Error downloading file.");
      });
  });























  addToMapButton.addEventListener("click", () => {
    addToMapButton.style.display = "none";
    const file = fileInput.files[0];
    console.log("wat")
    if (!file) {
      fileError.textContent = "No file selected!";
      fileError.className = "message-error";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    progressScreen.style.display = "block";
    progressMessage.textContent = "Converting...";
    progressBar.style.width = "0%";

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + 10, 90); 
      progressBar.style.width = `${progress}%`;
    }, 300);

    fetch("/upload_xlsx", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        clearInterval(progressInterval);
        if (data.success) {
          progressMessage.textContent = "Conversion succeeded!";
          progressBar.style.width = "100%";
          currentGeoJSON = data.files;

          setTimeout(() => {
            progressScreen.style.display = "none";
            propertyEditScreen.style.display = "block";
            populatePropertiesForm(data.files);
          }, 1000);
        } else {
          progressMessage.textContent = "Conversion failed!";
          progressScreen.style.backgroundColor = "#f8d7da";
        }
      })
      .catch((err) => {
        clearInterval(progressInterval);
        progressMessage.textContent = "An error occurred during conversion.";
        progressScreen.style.backgroundColor = "#f8d7da";
      });
  });


  // KML Processing
  function processKMLFile() {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    fetch("/upload_and_convert", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          currentGeoJSON = data.geojson;
          buildMetadataForm(currentGeoJSON);
          metadataForm.style.display = "block";
        } else {
          fileError.textContent = data.error || "An error occurred.";
        }
      })
      .catch((err) => {
        console.error("Error uploading KML file:", err);
        fileError.textContent = "Error uploading file.";
      });
  }





  fileInput.addEventListener("change", () => {
    const allowedExtensions = ["xlsx", "kml"];
    const file = fileInput.files[0];
    if (!file) return;
  
    const fileName = file.name || "No file chosen";
    const fileExtension = fileName.split(".").pop().toLowerCase();
  
    fileNameDisplay.textContent = fileName;
  
    if (!allowedExtensions.includes(fileExtension)) {
      fileError.textContent = "Invalid file type. Please upload a .xlsx or .kml file.";
      fileError.className = "message-error";
      addToMapButton.style.display = "none"; 

      return;
    }
  
    fileError.textContent = `Successfully selected "${fileName}"`;
    fileError.className = "message-success";
  
    if (fileExtension === "xlsx") {
      addToMapButton.style.display = "inline-block"; 
      saveMetadataBtn.style.display ="none";
      confirmButton.style.display = "none"; 
      downloadButton.style.display = "none";
    } else if (fileExtension === "kml") {
      addToMapButton.style.display = "none"; 
      processKMLFile(file); 
    }
  });




  let currentCableIndex = 0;
  let cablesData = {};

  function populatePropertiesForm(files) {
      cablesData = files;
      currentCableIndex = 0;
      showNextCableForm();
  }

  function showNextCableForm() {
      const propertiesForm = document.getElementById("properties-form");
      propertiesForm.innerHTML = ""; 

      const fileKeys = Object.keys(cablesData);
      if (currentCableIndex >= fileKeys.length) {
        document.getElementById("property-edit-screen").style.display = "none";
        propertiesForm.innerHTML = "<p>All cables have been edited and saved!</p>";
        return;
      }

      const sheetName = fileKeys[currentCableIndex];
      const fileData = cablesData[sheetName];
      let currentCoordinates = fileData.coordinates || [];

      const defaultProperties = {
        "[Feature Name]: Name": {
            type: "text",
            required: true,
        },
        "Category of Cable": {
          type: "dropdown",
          options: ["1: power line", "6: mooring cable", "7: ferry", "9: junction cable", "10: telecom cable", "Unknown: Not Classified"],
          required: true,
        },
        "Condition": {
          type: "dropdown",
          options: ["1: under construction", "5: planned construction", "Unknown: Not Classified"],
          required: true,
        },
        "Status": {
          type: "dropdown",
          options: ["1: permanent", "4: not in use", "13: historic", "18: existence doubtful", "Unknown: Not Classified"],
          required: true,
        },
        "Buried Depth": "-",
        "[Feature Name]: Language": "-",
        "[Feature Name]: Name Usage": "-",
        "[Fixed Date Range]: Date End": "-",
        "[Fixed Date Range]: Date Start": "-",
        "Scale Minimum": "-",
        "[Information]: File Locator": "-",
        "[Information]: File Reference": "-",
        "[Information]: Headline": "-",
        "[Information]: Language": "-",
        "[Information]: Text": "-",
        "Feature Association: Component of": "-",
        "Feature Association: Updates": "-",
        "Feature Association: Positions": "-",
        "Feature Association: Provides Information": "-",
      };

      for (const [key, value] of Object.entries(defaultProperties)) {
        const formGroup = document.createElement("div");
        formGroup.className = "form-group";
      
        const label = document.createElement("label");
        label.textContent = key;
      
        if (requiredFields.includes(key)) {
          const requiredText = document.createElement("span");
          requiredText.textContent = " * Required";
          requiredText.style.color = "red";
          label.appendChild(requiredText);
        }
      
        if (typeof value === "object" && value.type === "dropdown") {
          // Dropdown field
          const select = document.createElement("select");
          select.name = key;
          select.required = requiredFields.includes(key);
          value.options.forEach((option) => {
            const optionElement = document.createElement("option");
            optionElement.value = option;
            optionElement.textContent = option;
            select.appendChild(optionElement);
          });
          formGroup.appendChild(label);
          formGroup.appendChild(select);
        } else {
          // Input field
          const input = document.createElement("input");
          input.name = key;
      
          if (value === "-") {
            input.value = ""; // Set the value to empty
            input.placeholder = key === "[Feature Name]: Name"
              ? "Enter feature name..."
              : `Enter ${key}...`;
          } else {
            input.value = value;
            input.placeholder = `Enter ${key}...`;
          }
      
          input.required = requiredFields.includes(key);
          formGroup.appendChild(label);
          formGroup.appendChild(input);
        }
      
        // Apply spacing between fields
        formGroup.style.marginBottom = "20px"; // Increase margin for better spacing
      
        // Append the form group to the form
        propertiesForm.appendChild(formGroup);
      }
      
      

      // add save button
      const saveButton = document.createElement("button");
      saveButton.textContent = `Save Properties for ${sheetName}`;
      saveButton.className = "btn btn-save";
      saveButton.addEventListener("click", (event) => {
          event.preventDefault();
          saveGeoJSON(sheetName, currentCoordinates);
      });

      propertiesForm.appendChild(saveButton);
      document.getElementById("confirm-button").style.display = "none";
      document.getElementById("download-button").style.display = "none";

    }

  let updatedCables =[];

  function saveGeoJSON(sheetName, coordinates) {
    const propertiesForm = document.getElementById("properties-form");
    const formData = new FormData(propertiesForm);
    const editedProperties = Object.fromEntries(formData.entries());
  
    // Update currentGeoJSON with edited properties for the current cable
    const featureIndex = currentCableIndex; // Match the current feature index
    if (currentGeoJSON && currentGeoJSON.features && currentGeoJSON.features[featureIndex]) {
      currentGeoJSON.features[featureIndex].properties = editedProperties;
    }
  
    fetch("/save_geojson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: editedProperties,
        coordinates: coordinates,
        filename: `${sheetName}.geojson`,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          alert(`Properties saved for ${sheetName}`);
          currentCableIndex++; // Move to the next cable
          if (currentCableIndex < Object.keys(cablesData).length) {
            showNextCableForm(); // Show the next cable form
          } else {
            alert("All cables have been processed!");
  
            // Hide the property form and display the summary
            document.getElementById("property-edit-screen").style.display = "none";
            displayCablesSummary(); // Display the summary of cables for final download/DB actions
          }
        } else {
          alert(`Error saving properties for ${sheetName}: ${data.error}`);
        }
      })
      .catch((err) => {
        console.error(`Error saving properties for ${sheetName}:`, err);
        alert("An error occurred while saving the file.");
      });
  }
  

  function updateButtonsForCurrentCable(cable) {
    const confirmButton = document.getElementById("confirm-button");
    const downloadButton = document.getElementById("download-button");
  
    confirmButton.onclick = () => {
      addCableToDB(cable);
    };
  
    downloadButton.onclick = (evt) => {
      evt.preventDefault();
      downloadCableGeoJSON(cable);
    };
  }
  
  function downloadCableGeoJSON(cable) {
    const blob = new Blob([JSON.stringify(cable.geojson, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
  
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cable.sheetName}.geojson`;
    a.click();
    a.remove();
  }
  
  function addCableToDB(cable) {
    fetch("/confirm_insertion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson: cable.geojson }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          alert(`Cable "${cable.sheetName}" added to the database.`);
          // Move to the next cable if it exists
          if (currentCableIndex + 1 < Object.keys(cablesData).length) {
            currentCableIndex++;
            showNextCableForm();
          } else {
            propertiesForm.innerHTML = "<p>All cables processed!</p>";
          }
        } else {
          alert(`Error adding "${cable.sheetName}": ${data.error}`);
        }
      })
      .catch((err) => {
        console.error("Error adding to DB:", err);
        alert("An error occurred while adding to the database.");
      });
  }
  
  function displayCablesSummary() {
    const propertyEditScreen = document.getElementById("property-edit-screen");
    const summaryContainer = document.getElementById("metadata-container");
    const confirmButton = document.getElementById("confirm-button");
  
    // hide the form screen
    propertyEditScreen.style.display = "none";
  
    // clear metadata container and display the summary
    summaryContainer.innerHTML = "<h3>Cable Summary</h3>";
  
    Object.entries(cablesData).forEach(([sheetName, data], idx) => {
      const cableDiv = document.createElement("div");
      cableDiv.style.marginBottom = "15px"; 
  
      const cableTitle = document.createElement("h4");
      cableTitle.textContent = `Cable #${idx + 1}: ${sheetName}`;
      cableTitle.style.marginBottom = "8px"; 
      cableDiv.appendChild(cableTitle);
  
      // Create Download GeoJSON button
      const downloadButton = document.createElement("button");
      downloadButton.textContent = "Download GeoJSON";
      downloadButton.style.marginRight = "10px"; 
      downloadButton.className = "btn";
      downloadButton.addEventListener("click", () => {
        fetch("/download_geojson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geojson: currentGeoJSON }),
        })
          .then((res) => res.blob())
          .then((blob) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${sheetName}.geojson`;
            document.body.appendChild(a);
            a.click();
            a.remove();
          });
      });
      cableDiv.appendChild(downloadButton);
  
      summaryContainer.appendChild(cableDiv);
    });
  
    confirmButton.style.display = "inline-block";
  }
  
  

});
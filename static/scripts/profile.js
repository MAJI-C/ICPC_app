document.addEventListener("DOMContentLoaded", () => {
  // User Initials and Dropdown Menu Logic
  const userInitialsEl = document.getElementById("user-initials");
  const dropdownMenuEl = document.getElementById("dropdown-menu");

  if (!userInitialsEl || !dropdownMenuEl) {
    console.error("User initials or dropdown menu is missing.");
  } else {
    // Toggle dropdown menu
    userInitialsEl.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent the click from bubbling to the document
      const isDropdownVisible = dropdownMenuEl.style.display === "block";
      dropdownMenuEl.style.display = isDropdownVisible ? "none" : "block";
    });

    // Close dropdown menu when clicking outside
    document.addEventListener("click", () => {
      dropdownMenuEl.style.display = "none";
    });
  }

  // Profile Popup Logic
  const profilePopup = document.getElementById("profile-popup");
  const profileOverlay = document.getElementById("profile-overlay");
  const profileClose = document.getElementById("close-profile-popup");
  const profileLink = document.getElementById("profile-link");

  // Forms inside the popup
  const updateProfileForm = document.getElementById("update-profile-form");
  const changePasswordForm = document.getElementById("change-password-form");

  // Check if all required elements are present
  if (
    !profilePopup ||
    !profileOverlay ||
    !profileClose ||
    !profileLink ||
    !updateProfileForm ||
    !changePasswordForm
  ) {
    console.error("One or more required elements are missing from the DOM.");
    return;
  }

  // Open Profile Popup
  profileLink.addEventListener("click", (event) => {
    event.preventDefault();
    profilePopup.style.display = "block";
    profileOverlay.style.display = "block";

    // Fetch and populate user data when the popup is opened
    fetch("/profile_info")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch profile info");
        }
        return response.json();
      })
      .then((data) => {
        document.getElementById("name").value = data.name;
        document.getElementById("email").value = data.email;
      })
      .catch((error) => console.error("Error fetching profile info:", error));
  });

  // Close Profile Popup
  function closeProfilePopup() {
    profilePopup.style.display = "none";
    profileOverlay.style.display = "none";
  }

  profileClose.addEventListener("click", closeProfilePopup);
  profileOverlay.addEventListener("click", closeProfilePopup);

  // Change Password Form Submission Logic
  changePasswordForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = {
      current_password: document.getElementById("current-password").value,
      new_password: document.getElementById("new-password").value,
      confirm_password: document.getElementById("confirm-password").value,
    };

    fetch("/update_profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    })
      .then((response) => {
        if (!response.ok) {
          // If an error, parse JSON error message
          return response.json().then((data) => {
            throw new Error(data.error || "Failed to update password");
          });
        }
        return response.json();
      })
      .then((data) => {
        alert(data.success || "Password updated successfully");
        changePasswordForm.reset();
        closeProfilePopup(); // Close the popup after success
      })
      .catch((error) => {
        console.error("Error:", error.message);
        alert(error.message);
      });
  });
});

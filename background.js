// Background service worker - handles API calls to bypass CORS
const API_BASE_URL = "https://sopeko.com";

const LOG_PREFIX = "[Sopeko BG]";

console.log(LOG_PREFIX, "Background service worker loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "fetchUserMentions") {
    const username = request.username;
    const url = `${API_BASE_URL}/mentions/${username}`;

    console.log(LOG_PREFIX, "Fetching:", url);

    fetch(url)
      .then((response) => {
        console.log(LOG_PREFIX, "Response status:", response.status);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log(LOG_PREFIX, "Data received for", username, ":", data);
        sendResponse({ success: true, data: data });
      })
      .catch((error) => {
        console.error(
          LOG_PREFIX,
          "Error fetching",
          username,
          ":",
          error.message,
        );
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }

  if (request.type === "fetchExcludedUsernames") {
    const url = `${API_BASE_URL}/excluded-usernames`;

    console.log(LOG_PREFIX, "Fetching excluded usernames:", url);

    fetch(url)
      .then((response) => {
        console.log(
          LOG_PREFIX,
          "Excluded usernames response status:",
          response.status,
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log(LOG_PREFIX, "Excluded usernames received:", data);
        sendResponse({ success: true, data: data });
      })
      .catch((error) => {
        console.error(
          LOG_PREFIX,
          "Error fetching excluded usernames:",
          error.message,
        );
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }
});

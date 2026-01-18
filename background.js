// Background service worker - handles API calls to bypass CORS
const API_BASE_URL = "http://127.0.0.1:8080";

console.log("[Sopeko BG] Background service worker loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "fetchUserMentions") {
    const username = request.username;
    const url = `${API_BASE_URL}/mentions/${username}`;

    console.log("[Sopeko BG] Fetching:", url);

    fetch(url)
      .then((response) => {
        console.log("[Sopeko BG] Response status:", response.status);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("[Sopeko BG] Data received for", username, ":", data);
        sendResponse({ success: true, data: data });
      })
      .catch((error) => {
        console.error(
          "[Sopeko BG] Error fetching",
          username,
          ":",
          error.message,
        );
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }
});

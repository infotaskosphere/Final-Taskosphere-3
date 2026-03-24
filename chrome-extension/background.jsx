// background.js
// Service worker — runs in background, tracks websites

let authToken = "";

// ── Load saved token when extension starts or wakes ──
chrome.storage.local.get("token", (data) => {
  if (data.token) {
    authToken = data.token;
  }
});

// ── Receive messages from content.js ──
chrome.runtime.onMessage.addListener((msg) => {

  if (msg.type === "SET_TOKEN") {
    authToken = msg.token;
    chrome.storage.local.set({ token: authToken });
  }

  if (msg.type === "CLEAR_TOKEN") {
    authToken = "";
    chrome.storage.local.remove("token");
  }

});

// ── Track website visits when tab URL changes ──
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

  // Only fire when URL actually changes and token exists
  if (!changeInfo.url || !authToken) return;

  try {
    const urlObj = new URL(changeInfo.url);

    // Skip all browser internal pages
    const skipProtocols = [
      "chrome:",
      "chrome-extension:",
      "about:",
      "data:",
      "file:",
      "edge:",
      "moz-extension:"
    ];
    if (skipProtocols.includes(urlObj.protocol)) return;

    // Skip localhost — dont track developer machines
    if (
      urlObj.hostname === "localhost" ||
      urlObj.hostname === "127.0.0.1"
    ) return;

    // Skip the TaskoSphere app itself
    if (urlObj.hostname === "final-taskosphere-frontend.onrender.com") return;

    // Send to backend
    fetch("https://final-taskosphere-backend.onrender.com/api/activity/track-website", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: changeInfo.url,
        domain: urlObj.hostname,
        title: tab.title || "",
        duration: 0
      })
    }).catch(() => {
      // Silently ignore network errors
      // Backend may be sleeping on free Render tier
    });

  } catch (err) {
    // Silently ignore invalid URLs
  }

});

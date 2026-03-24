let authToken = "";

// Load saved token when extension starts
chrome.storage.local.get("token", (data) => {
  if (data.token) authToken = data.token;
});

// Receive token from web app after login
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SET_TOKEN") {
    authToken = msg.token;
    chrome.storage.local.set({ token: authToken });
  }

  // Clear token on logout
  if (msg.type === "CLEAR_TOKEN") {
    authToken = "";
    chrome.storage.local.remove("token");
  }
});

// Track website visits when tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url || !authToken) return;

  try {
    const urlObj = new URL(changeInfo.url);

    // Skip all browser internal pages
    const skipProtocols = ["chrome:", "chrome-extension:", "about:", "data:", "file:", "edge:", "moz-extension:"];
    if (skipProtocols.includes(urlObj.protocol)) return;

    // Skip localhost during development tracking
    if (urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1") return;

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
      // Silently ignore — backend may be sleeping on free Render tier
    });

  } catch (err) {
    // Silently ignore invalid URLs
  }
});

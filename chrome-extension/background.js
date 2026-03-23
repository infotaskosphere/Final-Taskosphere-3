let authToken = "";

// Load token on startup
chrome.storage.local.get("token", (data) => {
  if (data.token) authToken = data.token;
});

// Receive token from app
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SET_TOKEN") {
    authToken = msg.token;
    chrome.storage.local.set({ token: authToken });
  }
});

// Track websites
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url || !authToken) return;

  try {
    const urlObj = new URL(changeInfo.url);

    fetch("https://your-backend.com/api/activity/track-website", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: changeInfo.url,
        domain: urlObj.hostname,
        title: tab.title
      })
    });

  } catch (err) {
    console.log("Tracking error", err);
  }
});

// content.js
// Injected by Chrome into the TaskoSphere frontend page.
// Bridges postMessage() calls from the webpage to the background service worker.

window.addEventListener("message", (event) => {

  // Only accept messages from known TaskoSphere origins
  const allowedOrigins = [
    "https://final-taskosphere-frontend.onrender.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173"
  ];

  if (!allowedOrigins.includes(event.origin)) return;
  if (!event.data || !event.data.type) return;

  // sendMessage returns a promise in MV3. If the service worker is asleep or
  // the extension was reloaded, that promise rejects — swallow it so the page
  // console stays clean instead of showing an uncaught channel-closed error.
  const send = (payload) => {
    try {
      const result = chrome.runtime.sendMessage(payload, () => {
        // Reading lastError marks the failure as handled.
        void chrome.runtime.lastError;
      });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (err) {
      // Extension context invalidated — nothing to do.
    }
  };

  if (event.data.type === "SET_TOKEN") {
    send({ type: "SET_TOKEN", token: event.data.token });
  }

  if (event.data.type === "CLEAR_TOKEN") {
    send({ type: "CLEAR_TOKEN" });
  }

});

"use strict";

(() => {
  const key = "pp_session_id";
  let sessionId;
  try {
    sessionId = localStorage.getItem(key);
  } catch {
    sessionId = null;
  }
  if (!sessionId) {
    sessionId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
            const random = Math.floor(Math.random() * 16);
            return (char === "x" ? random : (random & 3) | 8).toString(16);
          });
    try {
      localStorage.setItem(key, sessionId);
    } catch {
      // Session history remains available for the current page when storage is disabled.
    }
  }

  window.PP_CONFIG = Object.freeze({
    apiBaseUrl: "",
    sessionId,
    requestTimeoutMs: 45000,
  });
})();

"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/popup/popup.ts
  var require_popup = __commonJS({
    "src/popup/popup.ts"() {
      document.addEventListener("DOMContentLoaded", () => {
        const statusEl = document.getElementById("status");
        if (!statusEl) return;
        statusEl.textContent = "Status: Checking...";
        statusEl.className = "status disconnected";
        try {
          chrome.runtime.sendMessage({ type: "get_status" }, (response) => {
            if (chrome.runtime.lastError) {
              statusEl.textContent = "Status: Disconnected";
              statusEl.className = "status disconnected";
              return;
            }
            if (response && response.connected) {
              statusEl.textContent = "Status: Connected";
              statusEl.className = "status connected";
            } else {
              statusEl.textContent = "Status: Disconnected";
              statusEl.className = "status disconnected";
            }
          });
        } catch (e) {
          statusEl.textContent = "Status: Disconnected";
          statusEl.className = "status disconnected";
        }
      });
    }
  });
  require_popup();
})();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./globals.css";

// Apply saved theme immediately (before React renders) so login page etc. stay themed
const savedTheme = localStorage.getItem("theme");
if (savedTheme && savedTheme !== "light") {
  document.documentElement.classList.add(`theme-${savedTheme}`);
}

// Register service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Check for updates every 15 minutes
      setInterval(() => {
        registration.update();
      }, 15 * 60 * 1000);
    }
  },
  onNeedRefresh() {
    // Show update toast
    const toast = document.createElement("div");
    toast.id = "sw-update-toast";
    toast.innerHTML = `
      <div style="position:fixed;bottom:1rem;right:1rem;z-index:9999;background:#0f172a;color:#fff;padding:0.75rem 1rem;border-radius:0.75rem;display:flex;align-items:center;gap:0.75rem;font-size:0.875rem;box-shadow:0 4px 12px rgba(0,0,0,0.3)">
        <span>Nouvelle version disponible</span>
        <button id="sw-update-btn" style="background:#3b82f6;color:#fff;border:none;padding:0.375rem 0.75rem;border-radius:0.5rem;cursor:pointer;font-size:0.875rem;font-weight:500">
          Rafraîchir
        </button>
      </div>
    `;
    document.body.appendChild(toast);
    document.getElementById("sw-update-btn")?.addEventListener("click", () => {
      updateSW(true);
    });
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

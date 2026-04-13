import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Initialize API base URL from environment variable or auto-detect
let apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

// If no explicit API URL set, auto-detect from current URL
if (!apiBaseUrl) {
  const currentUrl = window.location.href;
  
  // Check if accessed through ngrok
  if (currentUrl.includes("ngrok")) {
    // Extract protocol and host from current URL
    const url = new URL(currentUrl);
    const protocol = url.protocol;
    const host = url.host;
    
    // Use same ngrok URL for API - API client will add /api prefix
    apiBaseUrl = `${protocol}//${host}`;
  }
  // If still no URL, leave empty for relative paths (same origin)
}

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById("root")!).render(<App />);

import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Resolve API base URL with safe fallbacks:
// 1) explicit env vars
// 2) ngrok same host
// 3) local dev default to API server port
const envApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "";

let apiBaseUrl = envApiBaseUrl;

if (!apiBaseUrl) {
  const currentUrl = window.location.href;
  const current = new URL(currentUrl);

  if (currentUrl.includes("ngrok")) {
    apiBaseUrl = `${current.protocol}//${current.host}`;
  } else if (current.hostname === "localhost" || current.hostname === "127.0.0.1") {
    apiBaseUrl = `${current.protocol}//${current.hostname}:3000`;
  }
}

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById("root")!).render(<App />);

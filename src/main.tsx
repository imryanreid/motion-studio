// ==============================================
// ENTRY POINT
// Mounts the app into #root, pulls in the global
// stylesheet, and attaches Vercel's analytics and
// Core Web Vitals beacons (both no-op outside a
// Vercel deploy).
// ==============================================
import React from "react"
import ReactDOM from "react-dom/client"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/react"
import App from "./App"
import "./index.css"

// The readable block that api/render injects for JavaScript-less clients.
// It ships unstyled on purpose — hiding it with CSS would make
// readability-style extractors skip it — so the app removes it here, the
// moment we know JavaScript is running and a human is looking.
document.getElementById("agent-motion")?.remove()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>,
)

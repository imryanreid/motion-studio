// ==============================================
// VITE CONFIG
// Build and dev-server setup. Kept deliberately
// small, matching the rest of the family: the React
// and Tailwind plugins, and React deduping.
//
// `base: "./"` emits relative asset paths, so the
// built site also works opened straight off disk.
// ==============================================
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    // Ensure a single React instance so libraries like `motion` don't resolve
    // their own nested copy (which breaks hooks: "Cannot read ... useContext").
    dedupe: ["react", "react-dom"],
  },
})

/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      manifest: {
        name: "Maze Racer",
        short_name: "Maze Racer",
        description: "Race a FAGS heuristic AI through a maze — free forever",
        start_url: "/",
        display: "standalone",
        background_color: "#0f0f0f",
        theme_color: "#7c3aed",
        orientation: "any",
        min_viewport_width: 360,
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      } as Record<string, unknown>,
    }),
  ],
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "food/*", "demo/*.json", "data/*.json"],
      manifest: {
        name: "OneDish",
        short_name: "OneDish",
        description: "Stop browsing. Eat this.",
        display: "standalone",
        theme_color: "#100d0b",
        background_color: "#100d0b",
        start_url: basePath,
        icons: [
          { src: `${basePath}icons/icon-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${basePath}icons/icon-512.png`, sizes: "512x512", type: "image/png" },
          { src: `${basePath}icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: `${basePath}index.html`,
        globPatterns: ["**/*.{js,css,html,png,svg,json,webp,avif}"],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: "./tests/setup.ts",
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client lives in client/; the production bundle lands in dist/ at the
// repo root, where server/index.ts serves it.
export default defineConfig({
  root: "client",
  plugins: [react()],
  envDir: "..",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // In dev the Express server (npm run dev:server) handles the OAuth token
    // exchange. Discord's production proxy exposes our routes both at the
    // root mapping and under /.proxy/, so mirror both here.
    proxy: {
      "/api": "http://localhost:3000",
      "/.proxy/api": "http://localhost:3000",
    },
    // Allow access through a cloudflared quick tunnel during development.
    allowedHosts: [".trycloudflare.com"],
  },
});

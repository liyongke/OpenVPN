import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  base: "/static/frontend/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8088",
      "/status-file": "http://127.0.0.1:8088",
      "/static/openvpn-icon.svg": "http://127.0.0.1:8088",
    },
  },
  build: {
    outDir: "../app/static/frontend",
    emptyOutDir: true,
  },
});

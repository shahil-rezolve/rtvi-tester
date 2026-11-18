import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { curlProxyPlugin } from "./vite/curlProxy";

export default defineConfig({
  plugins: [react(), tailwindcss(), curlProxyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@daily-co/daily-js": path.resolve(import.meta.dirname, "vite/daily-stub.ts"),
    },
  },
  build: { chunkSizeWarningLimit: 1000 }, // livekit-client + protocol; fine for a local dev tool
  test: { environment: "node" },
});

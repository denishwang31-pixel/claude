import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: "client",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/trpc": "http://localhost:3001",
      "/auth": "http://localhost:3001",
      "/api": "http://localhost:3001",
    },
  },
});

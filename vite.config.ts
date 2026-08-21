import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/ui",
    emptyOutDir: false,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7341",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

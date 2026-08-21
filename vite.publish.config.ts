import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/publish",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/publish-embed",
    emptyOutDir: true,
  },
});

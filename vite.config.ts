/** Bundles the script every standalone diagram page carries inline: `dist/runtime.js`. */

import { defineConfig } from "vite";


export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: "src/runtime/main.ts", name: "mndmap", formats: ["iife"], fileName: () => "runtime.js" },
  },
});

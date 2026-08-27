import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @mnd/kit is linked from a sibling checkout that carries its own React.
    // Force a single React instance so hooks resolve against this app's copy.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
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

import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** The sample workspaces, served in dev only.
 *
 *  They sit in `samples/` rather than `public/` so the built bundle never
 *  carries them: what ships is the page, and a real run drops a folder on
 *  it. `npm run sample` regenerates them from this repo's own corpora. */
function samples(): Plugin {
  const dir = resolve("samples");
  return {
    name: "mndmap-samples",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const at = (request.url ?? "").split("?")[0] ?? "";
        if (!at.startsWith("/samples/")) return next();
        const file = resolve(at.slice(1));
        if (!file.startsWith(dir + sep)) return next();
        readFile(file)
          .then((text) => {
            response.setHeader("content-type", "application/json");
            response.end(text);
          })
          .catch(() => next());
      });
    },
  };
}

/** The browser is the product: one page, no server, and no proxy — translate
 *  and emit both run here, from a folder dropped on it. */
export default defineConfig({
  plugins: [react(), samples()],
  resolve: {
    // The kit is vendored and carries its own React. One instance, so hooks
    // resolve against this app's copy.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: { outDir: "dist/ui", emptyOutDir: true },
  preview: { port: 7342 },
});

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** The sample folder, served in dev only.
 *
 *  `samples/docs` is markdown on disk like any other folder — this just reads
 *  it so the dev server opens on something. The built page serves nothing:
 *  there, an empty tab is the truth, and a run starts with a folder. */
function sample(): Plugin {
  const root = resolve("samples/docs");
  return {
    name: "mndmap-sample",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? "").split("?")[0] !== "/sample.json") return next();
        walk(root)
          .then((files) => {
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ name: "docs", files }));
          })
          .catch(() => next());
      });
    },
  };
}

/** Every file under the sample folder, by its path from the root. */
async function walk(dir: string): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(at));
    else out.push({ path: relative(resolve("samples/docs"), at).split(/[\\/]/).join("/"), text: await readFile(at, "utf8") });
  }
  return out;
}

/** The browser is the product: one page, no server. A run starts with a
 *  folder picked or dropped on the page, read where it is. */
export default defineConfig({
  plugins: [react(), sample()],
  resolve: {
    // The kit is vendored and carries its own React. One instance, so hooks
    // resolve against this app's copy.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: { outDir: "dist/ui", emptyOutDir: true },
  preview: { port: 7342 },
});

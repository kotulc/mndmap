import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** The sample, served in dev only.
 *
 *  `samples/sample.md` is the document being designed against, so the dev
 *  server opens on it. `?folder` serves `samples/docs` instead, for when the
 *  folder case needs looking at. The built page serves neither: there, an
 *  empty tab is the truth, and a run starts with a file or a folder. */
function sample(): Plugin {
  return {
    name: "mndmap-sample",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [at, query] = (request.url ?? "").split("?");
        if (at !== "/sample.json") return next();
        const folder = new URLSearchParams(query ?? "").has("folder");
        const held = folder
          ? walk(resolve("samples/docs")).then((files) => ({ name: "docs", files }))
          : readFile(resolve("samples/sample.md"), "utf8")
            .then((text) => ({ name: "sample.md", files: [{ path: "sample.md", text }] }));
        held
          .then((body) => {
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify(body));
          })
          .catch(() => next());
      });
    },
  };
}

/** Every file under a sample folder, by its path from it. */
async function walk(dir: string, root = dir): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(at, root));
    else out.push({ path: relative(root, at).split(/[\\/]/).join("/"), text: await readFile(at, "utf8") });
  }
  return out;
}

/** The kit, read from a neighbouring mndflow checkout instead of the vendored
 *  tarball.
 *
 *  A build there writes `dist/`, this points at it, and the page reloads —
 *  so a kit change costs a save rather than a release. Dev only, and only
 *  where mndflow is actually there: `package.json` still names the tarball,
 *  so a build and a fresh clone are unaffected. `MNDMAP_KIT=pin` opts out. */
const KIT = resolve("..", "mndflow", "packages", "kit");
const linked = process.env.MNDMAP_KIT !== "pin" && existsSync(join(KIT, "dist", "index.js"));

const kit_alias = linked ? [
  { find: /^@mnd\/kit$/, replacement: join(KIT, "dist/index.js") },
  { find: /^@mnd\/kit\/react$/, replacement: join(KIT, "dist/react.js") },
  { find: /^@mnd\/kit\/react\.css$/, replacement: join(KIT, "dist/react.css") },
  { find: /^@mnd\/kit\/shell$/, replacement: join(KIT, "dist/shell.js") },
  { find: /^@mnd\/kit\/shell\.css$/, replacement: join(KIT, "dist/shell.css") },
] : [];

/** The browser is the product: one page, no server. A run starts with a
 *  folder picked or dropped on the page, read where it is. */
export default defineConfig({
  plugins: [react(), sample()],
  resolve: {
    alias: kit_alias,
    // The kit carries its own React, and a linked one resolves against
    // mndflow's. One instance, so hooks resolve against this app's copy.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  // A linked kit is outside the project, and its rebuilds must reach the page.
  optimizeDeps: { exclude: linked ? ["@mnd/kit"] : [] },
  server: {
    port: 7342,
    fs: { allow: [process.cwd(), ...(linked ? [KIT] : [])] },
  },
  build: { outDir: "dist/ui", emptyOutDir: true },
  preview: { port: 7342 },
});

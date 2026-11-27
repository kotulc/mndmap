/** Serve `npm run try`'s output, rebuild it on every edit, and reload the browser.
 *
 *  Usage: npm run dev [-- ../mndsite]
 *  Watches src/, samples/ and the site's docs; opens the gallery at http://localhost:7342. */

import { execFileSync } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";


const site = resolve(process.argv[2] ?? "../mndsite");
const gallery = "/build/_assets/mndmap/index.html";
let timer = null;


/** Bundle and compile mndmap, then build the site's docs with the samples. */
function rebuild() {
  try {
    execFileSync("npm", ["run", "build", "--silent"], { stdio: "inherit", shell: true });
    execFileSync(process.execPath, ["scripts/try.mjs", site], { stdio: "inherit" });
    return true;
  } catch {
    console.log("[dev] build failed; waiting for the next edit");
    return false;
  }
}

rebuild();

// Serve dist/try (not build/, which each build replaces); reloads come from the rebuilds below
const server = await createServer({
  configFile: false,
  root: resolve("dist/try"),
  server: { port: 7342, open: gallery, watch: null },
});
await server.listen();
server.printUrls();

// Any edit: rebuild once things settle, then reload every open page
for (const dir of ["src", "samples", resolve(site, "docs")]) {
  watch(dir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (rebuild()) server.ws.send({ type: "full-reload" });
    }, 200);
  });
}

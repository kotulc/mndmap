/** Rebuild the linked kit's type declarations, and put them where tsc looks.
 *
 *  `npm run dev` aliases the kit to `../mndflow` for the browser, but that is
 *  vite's doing and tsc knows nothing of it — it reads `node_modules/@mnd/kit`,
 *  which is the vendored tarball. So this regenerates the declarations there
 *  and copies only those across: the shipped JS stays the pinned release, and
 *  `npm install` puts the types back.
 *
 *  Usage: npm run kit:types   (after changing a kit signature) */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const FLOW = resolve("..", "mndflow");
const from = join(FLOW, "packages", "kit", "dist");
const into = resolve("node_modules", "@mnd", "kit", "dist");

if (!existsSync(join(FLOW, "package.json"))) {
  console.error("no mndflow beside this repo — nothing to sync");
  process.exit(1);
}

execFileSync("npm", ["run", "build", "-w", "@mnd/kit"], { cwd: FLOW, stdio: "inherit", shell: true });

const types = readdirSync(from).filter((name) => name.endsWith(".d.ts"));
for (const name of types) copyFileSync(join(from, name), join(into, name));
console.log(`synced ${types.join(", ")} into node_modules/@mnd/kit/dist`);

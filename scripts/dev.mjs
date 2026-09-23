/** Start the app, and the kit it draws with.
 *
 *  Where `../mndflow` is checked out, the kit is rebuilt from its source as
 *  you edit it and the page reloads — no pack, no copy, no install. Where it
 *  is not, this is just `vite`, and the app draws with the vendored tarball.
 *
 *  Usage: npm run dev            (both)
 *         MNDMAP_KIT=pin npm run dev   (vendored tarball only) */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const KIT = resolve("..", "mndflow", "packages", "kit");
const linked = process.env.MNDMAP_KIT !== "pin" && existsSync(resolve(KIT, "package.json"));
const held = [];

// The kit's own build also writes types, which the browser never reads. Watch
// mode runs the fast half only; `npm run typecheck` regenerates the rest.
//
// It watches every package, not just the kit's own source: the stylesheets are
// concatenated in tsup's `onSuccess`, so no `.css` is in the module graph and
// editing one would otherwise rebuild nothing. `dist` is excluded, or the
// build's own output would retrigger it forever.
if (linked) {
  say("kit", `watching ${resolve(KIT, "..")}`);
  held.push(run("npx", [
    "tsup", "--silent",
    "--watch", "..",
    "--ignore-watch", "../kit/dist",
    "--ignore-watch", "../**/node_modules",
  ], KIT, "kit"));
} else {
  say("kit", "vendored tarball");
}

held.push(run("npx", ["vite", "--port", "7342", ...process.argv.slice(2)], process.cwd(), "app"));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { for (const child of held) child.kill(); process.exit(0); });
}


/** One child, its output prefixed so two streams stay readable. */
function run(command, args, cwd, tag) {
  const child = spawn(command, args, { cwd, shell: true, stdio: ["inherit", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (text) => {
      for (const line of text.split("\n")) if (line.trim()) say(tag, line);
    });
  }
  child.on("exit", (code) => {
    if (code) { say(tag, `exited ${code}`); process.exit(code); }
  });
  return child;
}

function say(tag, line) {
  console.log(`[${tag}] ${line}`);
}

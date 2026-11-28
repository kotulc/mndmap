/** Try mndmap on mndsite's own docs: copy them, lay `samples/mndsite/` over the copy, and build.
 *
 *  Usage: npm run try [-- ../mndsite]       (run `npm run build` first)
 *  Writes dist/try/content (the docs with the samples) and dist/try/build (mndmap's output).
 *  Open dist/try/build/_assets/mndmap/index.html, or build mndsite with --content dist/try/build. */

import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";


const site = resolve(process.argv[2] ?? "../mndsite");
const content = resolve("dist/try/content");
const exclude = ["updates/plans.md", "updates/roadmap.md"];

rmSync(content, { recursive: true, force: true });
cpSync(join(site, "docs"), content, { recursive: true });
cpSync(resolve("samples/mndsite"), content, { recursive: true });
execFileSync(process.execPath, ["dist/cli.js", "build", content, "--out", "dist/try/build", "--title", "MndSite", "--cards",
  ...exclude.flatMap((path) => ["--exclude", path])], { stdio: "inherit" });

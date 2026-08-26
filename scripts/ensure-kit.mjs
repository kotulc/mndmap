#!/usr/bin/env node
/**
 * Ensures @mnd/kit is available from the pinned mndflow commit.
 * Used on clean checkouts where no sibling mndflow repository exists.
 */
import { access, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor", "mndflow");
const KIT_DIR = join(VENDOR, "packages", "kit");
const KIT_DIST = join(KIT_DIR, "dist", "index.js");
const KIT_PACK = join(ROOT, "vendor", "mnd-kit-0.0.0.tgz");
const PIN = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(join(ROOT, "mndflow-pin.json"), "utf8")));
const COMMIT = PIN.mndflowCommit;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
  }
}

if (await exists(KIT_PACK) && await exists(KIT_DIST)) {
  process.exit(0);
}

await mkdir(join(ROOT, "vendor"), { recursive: true });
if (!(await exists(join(VENDOR, ".git")))) {
  run("git", ["clone", "--depth", "1", "https://github.com/kotulc/mndflow.git", VENDOR], ROOT);
  run("git", ["fetch", "--depth", "1", "origin", COMMIT], VENDOR);
  run("git", ["checkout", COMMIT], VENDOR);
}

run("npm", ["ci"], VENDOR);
run("npm", ["run", "build", "-w", "@mnd/kit"], VENDOR);

run("npm", ["pack", "--pack-destination", join(ROOT, "vendor")], KIT_DIR);

if (!(await exists(KIT_PACK)) || !(await exists(KIT_DIST))) {
  throw new Error(`@mnd/kit pack did not produce ${KIT_PACK}`);
}

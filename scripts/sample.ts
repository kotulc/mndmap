/** The sample workspaces the dev server opens on.
 *
 *  Regenerated from the corpora in this repo rather than migrated, so there
 *  is never a stale graph to bring forward: the reader changes, the sample
 *  changes with it, and what the dashboard shows is what the code does now.
 *
 *  Usage: tsx scripts/sample.ts   (npm run sample, and `predev` runs it) */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { read, read_config } from "../src/index.js";
import type { Config, SourceFile, Suggestions } from "../src/types.js";

/** Each corpus, and what it is there to show. */
const CORPORA = [
  { at: ".", as: "workspace.json", shows: "the repo's own docs: sets, pages, sections, grids, links" },
  { at: "fixtures/map", as: "map.json", shows: "every construct the map can move" },
  { at: "fixtures/req", as: "req.json", shows: "requirements as typed rows, with satisfies and verifies" },
];

const out = resolve("samples");
await mkdir(out, { recursive: true });

for (const corpus of CORPORA) {
  const root = resolve(corpus.at);
  const config = read_config(await maybe(join(root, "mndmap.yaml")));
  const { file, report } = read(await collect(root, config), config);
  await writeFile(join(out, corpus.as), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`samples/${corpus.as}  ${report.pages} pages, ${report.sections} sections, `
    + `${report.holders} holders, ${report.relations} relations  — ${corpus.shows}`);
  if (report.faults.length) for (const fault of report.faults) console.log(`  fault: ${fault}`);

  if (corpus.as !== "workspace.json") continue;
  const sidecar = offered(file.graph.blocks, file.graph.edges);
  await writeFile(join(out, "suggestions.json"), `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
  console.log(`samples/suggestions.json  ${Object.keys(sidecar).length} entries`);
}


/** A sidecar without Taggly: the same shape, made from the graph, so the
 *  chips in the tray can be looked at with nothing running. */
function offered(blocks: Record<string, { type?: string; name?: string }>,
                 edges: Record<string, unknown>): Suggestions {
  const sidecar: Suggestions = {};
  const tags = ["draft", "reviewed", "stale"];

  for (const [id, block] of Object.entries(blocks)) {
    if (block.type !== "doc.page" && block.type !== "doc.section") continue;
    if (Object.keys(sidecar).length >= 12) break;
    sidecar[id] = { name: [`${block.name ?? id} (tidied)`], tags };
  }
  for (const id of Object.keys(edges).slice(0, 6)) {
    sidecar[id] = { type: ["req.satisfy", "req.verify"] };
  }
  return sidecar;
}

/** Every document under a corpus's source root. */
async function collect(root: string, config: Config): Promise<SourceFile[]> {
  const base = resolve(root, config.source.root);
  const files: SourceFile[] = [];
  const walk = async (at: string): Promise<void> => {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!/\.(md|mdx)$/i.test(entry.name)) continue;
      files.push({ path: relative(base, path).replaceAll("\\", "/"), text: await readFile(path, "utf8") });
    }
  };
  await walk(base);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function maybe(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); } catch { return undefined; }
}

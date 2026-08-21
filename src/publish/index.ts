import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Graph, GraphCollection } from "../mndflow/adapter.js";
import { toMndflowGraph } from "../mndflow/adapter.js";
import type { RecordView } from "../types.js";
import { renderGraphSvg } from "./layout.js";

export interface PublicationCollection {
  id: string;
  name: string;
  path: string;
  records: number;
}

export interface PublicationManifest {
  version: 1;
  collections: PublicationCollection[];
}

export function serializeGraph(graph: Graph): string {
  return `${JSON.stringify(sortJson(graph), null, 2)}\n`;
}

export async function writePublication(
  outputDirectory: string,
  collections: readonly GraphCollection[],
  recordsFor: (collectionId: string) => readonly RecordView[],
  embedDirectory: string,
): Promise<PublicationManifest> {
  await mkdir(outputDirectory, { recursive: true });
  const published: PublicationCollection[] = [];
  for (const collection of [...collections].sort((left, right) => left.id.localeCompare(right.id))) {
    const records = recordsFor(collection.id);
    const graph = toMndflowGraph(collection, records);
    const directoryName = publicationPath(collection.id);
    const directory = join(outputDirectory, directoryName);
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(join(directory, "graph.json"), serializeGraph(graph)),
      writeFile(join(directory, "graph.svg"), renderGraphSvg(graph)),
      cp(embedDirectory, directory, { recursive: true }),
    ]);
    published.push({ id: collection.id, name: collection.name, path: directoryName, records: records.length });
  }
  const manifest: PublicationManifest = { version: 1, collections: published };
  await writeFile(join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outputDirectory, "index.html"), renderIndex(manifest));
  return manifest;
}

export async function verifyPublication(directory: string): Promise<PublicationManifest> {
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as PublicationManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.collections)) throw new Error("Invalid publication manifest");
  for (const collection of manifest.collections) {
    const graph = JSON.parse(await readFile(join(directory, collection.path, "graph.json"), "utf8")) as Graph;
    if (graph.id !== collection.id || graph.elements.length !== collection.records) {
      throw new Error(`Publication graph does not match manifest: ${collection.id}`);
    }
    await Promise.all([
      readFile(join(directory, collection.path, "graph.svg")),
      readFile(join(directory, collection.path, "index.html")),
    ]);
  }
  return manifest;
}

function publicationPath(id: string): string {
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "collection";
  return `${slug}-${createHash("sha256").update(id).digest("hex").slice(0, 8)}`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

function renderIndex(manifest: PublicationManifest): string {
  const links = manifest.collections.map((collection) =>
    `<li><a href="./${collection.path}/">${escapeHtml(collection.name)}</a> <small>${collection.records} records</small></li>`,
  ).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>mndmap publications</title><style>body{max-width:52rem;margin:3rem auto;padding:0 1rem;background:#10141b;color:#d8dee9;font:16px/1.5 system-ui}a{color:#78a9ff}small{color:#8994a4}</style><h1>mndmap publications</h1><ul>${links}</ul></html>\n`;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&#39;",
  })[character]!);
}

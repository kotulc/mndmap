/** How a collection gets into the page, and how it leaves.
 *
 *  A folder dropped on the page is translated there; a `workspace.json` is
 *  opened as is, with its sidecar if one sits beside it. Nothing is uploaded
 *  and nothing is kept — the tab is the whole of the run. */

import JSZip from "jszip";
import { open, type Graph } from "@mnd/kit";
import { read_config } from "../config.js";
import { emit } from "../emit.js";
import { read } from "../read.js";
import { read_mdsite } from "../mdsite.js";
import { trim } from "../suggest.js";
import type { Config, Report, SourceFile, Suggestions } from "../types.js";

export interface Loaded {
  graph: Graph;
  config: Config;
  suggestions: Suggestions;
  report: Report | null;
  name: string;
  /** The mdsite template found beside the source, if there was one. */
  template?: Record<string, unknown>;
}


/** Whatever was dropped: a folder to translate, or a file to open. */
export async function from_drop(transfer: DataTransfer): Promise<Loaded> {
  const folder = await first_directory(transfer);
  if (folder) return from_folder(folder);

  const files = [...transfer.files];
  const workspace = files.find((file) => file.name.endsWith(".json") && !file.name.startsWith("suggestions"));
  if (!workspace) throw new Error("Drop a folder of markdown, or a workspace.json");
  const sidecar = files.find((file) => file.name.startsWith("suggestions"));
  return from_workspace(await workspace.text(), sidecar ? await sidecar.text() : undefined, workspace.name);
}

/** A folder, read and translated in the page. */
export async function from_folder(handle: FileSystemDirectoryHandle): Promise<Loaded> {
  const found = await gather(handle, "");
  const config_text = found.find((entry) => entry.path === "mndmap.yaml")?.text;
  const config = read_config(config_text);
  const template_text = found.find((entry) => entry.path === (config.publish?.mdsite ?? "mdsite.yaml"))?.text;

  const root = `${config.source.root}/`;
  const files: SourceFile[] = found
    .filter((entry) => entry.path.startsWith(root) && /\.(md|mdx)$/i.test(entry.path))
    .map((entry) => ({ path: entry.path.slice(root.length), text: entry.text }));
  if (files.length === 0) throw new Error(`No markdown under ${config.source.root}`);

  const { file, report } = read(files, config);
  return {
    graph: file.graph,
    config,
    suggestions: {},
    report,
    name: handle.name,
    ...(template_text ? { template: read_mdsite(template_text) } : {}),
  };
}

/** A file mndflow wrote, opened as it is. */
export function from_workspace(text: string, sidecar?: string, name = "workspace.json"): Loaded {
  const opened = open(text);
  return {
    graph: opened.graph,
    config: read_config(),
    suggestions: sidecar ? trim(JSON.parse(sidecar) as Suggestions, 3) : {},
    report: opened.faults.length ? { sets: 0, pages: 0, sections: 0, holders: 0, relations: 0,
      faults: opened.faults.map((fault) => fault.what) } : null,
    name,
  };
}

/** The workspace the dev server opens on when a link names none. Regenerated
 *  by `npm run sample`, served only while developing, and never in the built
 *  page — there, an empty tab is the truth: a run starts with a folder. */
const SAMPLE = "/samples/workspace.json";
const SAMPLE_CHIPS = "/samples/suggestions.json";

/** `?file=` — one fetch, so a link can open a workspace. `?suggestions=`
 *  names its sidecar, the way dropping one beside it would. */
export async function from_query(search: string): Promise<Loaded | null> {
  const query = new URLSearchParams(search);
  const where = query.get("file") ?? (import.meta.env.DEV ? SAMPLE : null);
  if (!where) return null;
  const beside = query.get("suggestions")
    ?? (where === SAMPLE ? SAMPLE_CHIPS : null);
  return from_workspace(await fetched(where), beside ? await maybe(beside) : undefined, where);
}

/** A sidecar is optional, so one that is not there is not an error. */
async function maybe(where: string): Promise<string | undefined> {
  try {
    return await fetched(where);
  } catch {
    return undefined;
  }
}

async function fetched(where: string): Promise<string> {
  const response = await fetch(where);
  if (!response.ok) throw new Error(`${where} answered ${response.status}`);
  return response.text();
}


/** The collection as a zip: the files, the assets, and `mdsite.yaml`. */
export async function to_zip(loaded: Loaded, assets: Map<string, Blob>): Promise<Blob> {
  const result = emit(loaded.graph, loaded.config, loaded.template);
  if (result.faults.length) throw new Error(result.faults.join("\n"));

  const zip = new JSZip();
  for (const file of result.files) zip.file(file.path, file.text);
  for (const asset of result.assets) {
    const held = assets.get(asset.from);
    if (held) zip.file(asset.path, held);
  }
  return zip.generateAsync({ type: "blob" });
}

/** Hand the browser a file to save. */
export function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}


/** Every text file under a directory handle, by its path from the root. */
async function gather(handle: FileSystemDirectoryHandle, prefix: string): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for await (const [name, entry] of handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === "directory") {
      if (name.startsWith(".") || name === "node_modules") continue;
      out.push(...await gather(entry as FileSystemDirectoryHandle, path));
      continue;
    }
    if (!/\.(md|mdx|ya?ml|json)$/i.test(name)) continue;
    out.push({ path, text: await (await (entry as FileSystemFileHandle).getFile()).text() });
  }
  return out;
}

/** The first directory in a drop, where the browser will hand one over. */
async function first_directory(transfer: DataTransfer): Promise<FileSystemDirectoryHandle | null> {
  for (const item of [...transfer.items]) {
    const get = (item as unknown as { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
      .getAsFileSystemHandle;
    if (!get) continue;
    const handle = await get.call(item);
    if (handle?.kind === "directory") return handle as FileSystemDirectoryHandle;
  }
  return null;
}

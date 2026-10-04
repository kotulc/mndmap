/** A folder or a file on disk, listed into a collection: the workspace's domain, a folder per
 *  folder and a definition per file.
 *
 *  **Nothing is read here.** A file is listed by its path (`source`); its text is read from disk
 *  when its document is first opened (`read.ts`), through the reader each file keeps. A markdown
 *  file is a `document` definition, any other a plain block definition, and folders are holders
 *  organizing them. The workspace's root is the folder; one file picked on its own sits in a root
 *  named after it. */

import { children, FLOOR, ROOT, type Block, type Graph, type Id } from "@mnd/kit";
import { DOCUMENT, MARKDOWN } from "./packages/markdown.js";

/** One file as it was listed: its path from the picked folder, and how to read its text. */
export interface SourceFile {
  path: string;
  read: () => Promise<string>;
}

/** The packages every collection reads over: the kit's base and markdown. */
export const PACKAGES = [...FLOOR, ...MARKDOWN];

/** Extensions read as text; everything else is listed but left empty. */
const TEXT = /\.(md|mdx|txt)$/i;


/** A collection: the picked folder, its subfolders and its files — or one document. */
export function scan(name: string, files: SourceFile[]): Graph {
  const root = ROOT;
  const graph: Graph = { root, edges: {}, blocks: {
    ...Object.fromEntries(PACKAGES.map((block) => [block.id, block])),
    [root]: { id: root, parent: null, name: name.replace(/\.(md|mdx)$/i, "") },
  } };
  const orders = new Map<Id, number>();

  // Each path segment becomes a folder block; the last becomes the file.
  for (const file of files.sort((left, right) => left.path.localeCompare(right.path))) {
    const parts = file.path.split("/").filter(Boolean);
    const leaf = parts.pop();
    if (!leaf) continue;

    let parent = root;
    let at = "";
    for (const part of parts) {
      at = at ? `${at}/${part}` : part;
      const id = `dir:${at}`;
      if (!graph.blocks[id]) {
        graph.blocks[id] = {
          id, parent, type: "folder", name: part, source: at, order: next(parent),
        };
      }
      parent = id;
    }

    const id = `file:${file.path}`;
    graph.blocks[id] = {
      id, parent, type: is_markdown(file.path) ? DOCUMENT : "block", def: {}, name: leaf,
      source: file.path, order: next(parent),
    };
  }

  return graph;

  function next(parent: Id): number {
    const order = (orders.get(parent) ?? 0) + 1;
    orders.set(parent, order);
    return order;
  }
}

/** Whether a block is a document: a root structure its contents are read under. */
export function is_document(graph: Graph, id: Id): boolean {
  return graph.blocks[id]?.type === DOCUMENT;
}

/** The first document in a collection, in reading order: what it opens on. */
export function first_document(graph: Graph, at: Id = graph.root): Id | null {
  if (is_document(graph, at)) return at;
  for (const kid of children(graph, at).filter((block: Block) => !block.of)) {
    const found = first_document(graph, kid.id);
    if (found) return found;
  }
  return null;
}

/** Whether a block's content is markdown the tray can show. */
export function is_markdown(source: string | undefined): boolean {
  return Boolean(source && /\.(md|mdx)$/i.test(source));
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

/** The document the dev server reads for us, so a run opens on something.
 *  Dev only — the built page starts empty and waits for a real folder. */
export async function dev_sample(): Promise<{ name: string; files: SourceFile[] } | null> {
  if (!import.meta.env.DEV) return null;
  const response = await fetch(`/sample.json${window.location.search}`);
  if (!response.ok) return null;
  const said = await response.json() as { name: string; files: { path: string; text: string }[] };
  return { name: said.name,
           files: said.files.map((f) => ({ path: f.path, read: async () => f.text })) };
}

/** Ask for one markdown file. The single-document case, which is the one
 *  being designed against: its content becomes the blocks, not the file. */
export async function pick_file(): Promise<{ name: string; files: SourceFile[] } | null> {
  const picker = window as Window & {
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: { description?: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle[]>;
  };
  if (typeof picker.showOpenFilePicker !== "function") return pick_via_input(false);
  try {
    const [handle] = await picker.showOpenFilePicker({
      multiple: false,
      types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".mdx"] } }],
    });
    if (!handle) return null;
    return { name: handle.name,
             files: [{ path: handle.name, read: async () => (await handle.getFile()).text() }] };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

/** Ask for a folder, and read everything under it. */
export async function pick_folder(): Promise<{ name: string; files: SourceFile[] } | null> {
  const picker = window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof picker.showDirectoryPicker !== "function") return pick_via_input();
  try {
    const handle = await picker.showDirectoryPicker();
    return { name: handle.name, files: await gather(handle, "") };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

/** A folder dragged onto the page, where the browser hands one over. */
export async function drop_folder(transfer: DataTransfer): Promise<{ name: string; files: SourceFile[] } | null> {
  for (const item of [...transfer.items]) {
    const get = (item as unknown as { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
      .getAsFileSystemHandle;
    if (!get) continue;
    const handle = await get.call(item);
    if (handle?.kind !== "directory") continue;
    const folder = handle as FileSystemDirectoryHandle;
    return { name: folder.name, files: await gather(folder, "") };
  }
  return null;
}


/** Every file under a directory handle, by its path from the root. */
async function gather(handle: FileSystemDirectoryHandle, prefix: string): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for await (const [name, entry] of handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.startsWith(".")) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === "directory") {
      if (name === "node_modules") continue;
      out.push(...await gather(entry as FileSystemDirectoryHandle, path));
      continue;
    }
    const file = entry as FileSystemFileHandle;
    out.push({ path, read: async () => (TEXT.test(name) ? (await file.getFile()).text() : "") });
  }
  return out;
}

/** Last resort where the File System Access API is missing. */
function pick_via_input(folder = true): Promise<{ name: string; files: SourceFile[] } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = folder;
    if (folder) input.setAttribute("webkitdirectory", "");
    else input.accept = ".md,.mdx,text/markdown";
    input.addEventListener("change", async () => {
      const list = [...(input.files ?? [])];
      const files: SourceFile[] = [];
      let name = folder ? "folder" : list[0]?.name ?? "file";
      for (const file of list) {
        const full = file.webkitRelativePath || file.name;
        const parts = full.split("/");
        if (parts.length > 1) name = parts[0]!;
        const path = parts.length > 1 ? parts.slice(1).join("/") : full;
        files.push({ path, read: async () => (TEXT.test(path) ? file.text() : "") });
      }
      resolve({ name, files });
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

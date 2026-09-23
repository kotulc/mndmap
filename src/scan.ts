/** A directory on disk, read into a graph of one block per file and folder.
 *
 *  Nothing is parsed: a markdown file's text is carried on the block's `body`
 *  and its path on `source`. Folders are `folder` blocks, files are `block`
 *  blocks, and the kit lays both out on its own. */

import { base_graph, type Graph, type Id } from "@mnd/kit";

/** One file as it was read: its path from the picked folder, and its text. */
export interface SourceFile {
  path: string;
  text: string;
}

/** Extensions read as text; everything else is listed but left empty. */
const TEXT = /\.(md|mdx|txt)$/i;


/** A graph holding the picked folder, its subfolders, and its files. */
export function scan(name: string, files: SourceFile[]): Graph {
  const graph = base_graph();
  const root = graph.root;
  graph.blocks[root] = { ...graph.blocks[root]!, name };
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
      id, parent, type: "block", name: leaf, source: file.path, order: next(parent),
      ...(file.text ? { body: file.text } : {}),
    };
  }

  return graph;

  function next(parent: Id): number {
    const order = (orders.get(parent) ?? 0) + 1;
    orders.set(parent, order);
    return order;
  }
}

/** Whether a block's content is markdown the tray can show. */
export function is_markdown(source: string | undefined): boolean {
  return Boolean(source && /\.(md|mdx)$/i.test(source));
}


/** The folder the dev server reads for us, so a run opens on something.
 *  Dev only — the built page starts empty and waits for a real folder. */
export async function dev_sample(): Promise<{ name: string; files: SourceFile[] } | null> {
  if (!import.meta.env.DEV) return null;
  const response = await fetch("/sample.json");
  if (!response.ok) return null;
  return response.json() as Promise<{ name: string; files: SourceFile[] }>;
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
    const file = await (entry as FileSystemFileHandle).getFile();
    out.push({ path, text: TEXT.test(name) ? await file.text() : "" });
  }
  return out;
}

/** Last resort where the File System Access API is missing. */
function pick_via_input(): Promise<{ name: string; files: SourceFile[] } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.addEventListener("change", async () => {
      const list = [...(input.files ?? [])];
      const files: SourceFile[] = [];
      let name = "folder";
      for (const file of list) {
        const full = file.webkitRelativePath || file.name;
        const parts = full.split("/");
        if (parts.length > 1) name = parts[0]!;
        const path = parts.length > 1 ? parts.slice(1).join("/") : full;
        files.push({ path, text: TEXT.test(path) ? await file.text() : "" });
      }
      resolve({ name, files });
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

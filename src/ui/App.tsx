/** The shell over one held graph.
 *
 *  A folder picked or dropped on the page is read into a graph of file and
 *  folder blocks. The explorer and the canvas both draw it; the tray shows
 *  the picked file's text. Edits apply to the held graph, and undo is the
 *  stack of graphs behind it. */

import { Explorer, Icon, TrayFrame, Viewer, WorkspaceHeader } from "@mnd/kit/react";
import { children, type Graph, type Id } from "@mnd/kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { apply, Stack, type Edit } from "../edits.js";
import { dev_sample, drop_folder, pick_folder, scan } from "../scan.js";
import { Tray } from "./Tray.js";

type ThemeName = "retro" | "modern" | "light";

/** The three looks, each with the mark it wears. */
const THEMES = [
  { name: "retro", icon: "theme_retro" },
  { name: "modern", icon: "theme_modern" },
  { name: "light", icon: "theme_light" },
] as const;

const BLANK = "Drop a folder, or use the bar to pick one.";


export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [layer, setLayer] = useState<Id | null>(null);
  const [picked, setPicked] = useState<Id[]>([]);
  const [folded, setFolded] = useState<Id[]>([]);
  const [note, setNote] = useState(BLANK);
  const [theme, setTheme] = useState<ThemeName>(() => stored_theme());
  const [over, setOver] = useState(false);
  const [trayOpen, setTrayOpen] = useState(true);
  const [trayBig, setTrayBig] = useState(false);
  const stack = useRef(new Stack());
  const look = THEMES.find((item) => item.name === theme) ?? THEMES[0]!;
  const nextLook = THEMES[(THEMES.indexOf(look) + 1) % THEMES.length]!;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("mnd.theme", theme); } catch { /* a private window */ }
  }, [theme]);

  const settle = (next: Graph, name: string, files: number) => {
    stack.current = new Stack();
    setGraph(next);
    setLayer(next.root);
    setPicked([]);
    setFolded([]);
    setNote(`${name}: ${files} files.`);
  };

  const edit = useCallback((change: Edit) => {
    setGraph((held) => {
      if (!held) return held;
      const result = apply(held, change);
      if (result.faults.length) { setNote(result.faults.join("\n")); return held; }
      stack.current.push(held);
      setNote("");
      return result.graph;
    });
  }, []);

  const step = useCallback((back: boolean) => {
    setGraph((held) => {
      if (!held) return held;
      const next = back ? stack.current.undo(held) : stack.current.redo(held);
      if (!next) { setNote(back ? "Nothing to undo." : "Nothing to redo."); return held; }
      setNote("");
      return next;
    });
  }, []);

  const open_folder = async (found: { name: string; files: { path: string; text: string }[] } | null) => {
    if (!found) return;
    if (!found.files.length) { setNote("That folder holds nothing."); return; }
    settle(scan(found.name, found.files), found.name, found.files.length);
  };

  /** A notification, not a status line: it says its piece and goes. The blank
   *  page keeps its instruction, since there is nothing else to read there. */
  const loaded = Boolean(graph);
  useEffect(() => {
    if (!note || !loaded) return;
    const timer = setTimeout(() => setNote(""), 4000);
    return () => clearTimeout(timer);
  }, [note, loaded]);

  /** Open on the dev server's sample folder, where it serves one. */
  useEffect(() => {
    void dev_sample()
      .then((found) => { if (found) void open_folder(found); })
      .catch(() => setNote(BLANK));
  }, []);

  const drop = async (event: React.DragEvent) => {
    event.preventDefault();
    setOver(false);
    setNote("Reading…");
    try {
      const found = await drop_folder(event.dataTransfer);
      if (!found) { setNote("Drop a folder."); return; }
      await open_folder(found);
    } catch (error: unknown) { setNote(say(error)); }
  };

  const add = async () => {
    setNote("Reading…");
    try { await open_folder(await pick_folder()); }
    catch (error: unknown) { setNote(say(error)); }
  };

  /** Explorer intents: reveal / rename / move / create / delete. */
  const act = useCallback((name: string, args?: Record<string, unknown>) => {
    if (!graph) return;
    const id = args?.id === undefined ? null : String(args.id) as Id;

    if (name === "reveal" && id) {
      /** A row that holds children opens as the layer; a leaf lights on its parent. */
      if (children(graph, id).length) { setLayer(id); setPicked([]); return; }
      setLayer(graph.blocks[id]?.parent ?? graph.root);
      setPicked([id]);
      return;
    }
    if (name === "rename" && id && typeof args?.name === "string") {
      edit({ do: "rename", id, name: args.name });
      return;
    }
    if (name === "create" && args?.parent && typeof args?.name === "string") {
      edit({
        do: "create",
        parent: String(args.parent),
        name: args.name,
        ...(args.type === "folder" ? { type: "folder" as const } : {}),
      });
      return;
    }
    if (name === "delete" && id) {
      edit({ do: "delete", id });
      setPicked((held) => held.filter((each) => each !== id));
      return;
    }
    if (name === "move" && args?.parent && Array.isArray(args.ids)) {
      const parent = String(args.parent) as Id;
      if (!graph.blocks[parent]) return;
      const before = typeof args.before === "string" ? args.before : null;
      const kin = children(graph, parent).map((block) => block.id);
      for (const moveId of args.ids as Id[]) {
        const siblings = kin.filter((each) => each !== moveId && !(args.ids as Id[]).includes(each));
        const at = before ? siblings.indexOf(before) : -1;
        edit({ do: "move", id: moveId, parent, ...(at >= 0 ? { at } : {}) });
      }
    }
  }, [edit, graph]);

  if (!graph) {
    return (
      <main className={`app blank${over ? " over" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={drop}>
        <p className="mm-status">{note}</p>
        <button type="button" className="mm-pick" onClick={() => void add()}>Pick a folder</button>
      </main>
    );
  }

  const focus = picked[0] ?? null;
  const block = focus ? graph.blocks[focus] : undefined;
  const blocks = Math.max(0, Object.keys(graph.blocks).length - 1);

  return (
    <div className={`app${over ? " over" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={drop}>
      <WorkspaceHeader brand="mndmap" where={<span className="where">{blocks} blocks</span>}>
        <button type="button" title="undo" aria-label="Undo" onClick={() => step(true)}
          disabled={stack.current.depth === 0}><Icon name="undo" /></button>
        <button type="button" title="redo" aria-label="Redo" onClick={() => step(false)}
          disabled={stack.current.forward === 0}><Icon name="redo" /></button>
        <button type="button" title="open a folder" aria-label="Open a folder"
          onClick={() => void add()}><Icon name="add_folder" /></button>
        <button type="button" title={`theme: ${theme} — click for ${nextLook.name}`}
          aria-label={`theme: ${theme}`} onClick={() => setTheme(nextLook.name)}>
          <Icon name={look.icon} />
        </button>
      </WorkspaceHeader>

      <Explorer graph={graph} open={layer} picked={picked} folded={folded} menu
        onAct={act}
        onFold={(id, shut) => setFolded((held) =>
          shut ? [...new Set([...held, id])] : held.filter((each) => each !== id))}
        onPick={setPicked} />

      <main>
        <div className="mm-canvas">
          <Viewer graph={graph} layer={layer} picked={picked} chrome={{ crumbs: true }}
            onLook={setLayer} onPick={setPicked} />
          {note ? (
            <p className="strip mm-strip" onClick={() => setNote("")}>{note}</p>
          ) : null}
        </div>
        <TrayFrame open={trayOpen} onOpen={setTrayOpen} big={trayBig} onBig={setTrayBig}
          word={block?.type === "folder" ? "folder" : "file"}
          name={block?.name ?? "nothing picked"}
          tabs={["Content"]} tab="Content" onTab={() => undefined}>
          <Tray graph={graph} picked={focus} />
        </TrayFrame>
      </main>
    </div>
  );
}


function stored_theme(): ThemeName {
  try {
    const saved = localStorage.getItem("mnd.theme");
    if (saved === "retro" || saved === "modern" || saved === "light") return saved;
  } catch { /* a private window may refuse the read */ }
  return "retro";
}

function say(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The shell over one held graph.
 *
 *  One markdown document is read into a graph of content blocks — a block per
 *  heading, paragraph, list, fence, quote, image and table row. A folder
 *  is filed by path instead, one block per file. The explorer, the canvas and
 *  the tray are the kit's, and so is what they share: the tray's state and how
 *  the drawing looks. What is mndmap's is reading, the document laid out as it
 *  reads, read row by row down a scrolled canvas, the markdown tab, and
 *  reorganizing — edits apply to the held graph, and undo is the stack of graphs
 *  behind it. */

import { Explorer, Icon, TrayFrame, Viewer, WorkspaceHeader, useDisplay,
         useTray } from "@mnd/kit/react";
import { CARD, children, is_container, open, write, type Graph, type Id } from "@mnd/kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apply, Stack, type Edit } from "../edits.js";
import { laid, read } from "../read.js";
import { dev_sample, drop_folder, pick_file, pick_folder, save, scan, type SourceFile } from "../scan.js";
import { MD } from "../packages/markdown.js";
import { rows } from "../series.js";
import { Document, Preview } from "./Preview.js";

type ThemeName = "retro" | "modern" | "light";

/** The three looks, each with the mark it wears. */
const THEMES = [
  { name: "retro", icon: "theme_retro" },
  { name: "modern", icon: "theme_modern" },
  { name: "light", icon: "theme_light" },
] as const;

/** Content is the point of a block here, so a card is wide enough to read a line of it and tall
 *  enough for two. */
const CONTENT_CARD = { w: 10, h: 3 };

const BLANK = "Drop a markdown document or a folder, or pick one below.";

/** The explorer's library sections, by the ids it folds them under. The kit keeps these to
 *  itself, so they are named again here. */
const LIBRARY = ["@packs", "@defs"];

/** The tray's one tab. */
const TABS = ["markdown"] as const;

/** Keys that read like a tree: down and up the rows, across a row and back, in and out. */
const FORWARD = "ArrowDown";
const BACK = "ArrowUp";
const ACROSS = "ArrowRight";
const OUT = "ArrowLeft";
const ENTER = "Enter";
const LEAVE = ["Escape", "Backspace"];


export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  /** The open layer; `null` is the root, as the kit names it. */
  const [layer, setLayer] = useState<Id | null>(null);
  const [picked, setPicked] = useState<Id[]>([]);
  /** Whose fields the canvas draws as a diagram, in place of the layer. */
  const [fields, setFields] = useState<Id | null>(null);
  const [folded, setFolded] = useState<Id[]>([]);
  const [note, setNote] = useState(BLANK);
  const [theme, setTheme] = useState<ThemeName>(() => stored_theme());
  const [over, setOver] = useState(false);
  /** The card the reading is centred on; moved by the keys, not by a click. */
  const [focus, setFocus] = useState<Id | null>(null);
  const tray = useTray();
  const [big, setBig] = useState(false);
  const { display } = useDisplay({ card: CONTENT_CARD, range: CARD, full: false });
  /** The document laid out as it reads: a backbone down the page, content across. */
  const full = display.full ?? false;
  const view = useMemo(() => graph && laid(graph, display.card, full),
    [graph, display.card, full]);
  /** The open layer's rows, and the one the pick sits in. */
  const series = useMemo(() => (graph ? rows(graph, layer ?? graph.root) : []), [graph, layer]);
  const row = series.find((each) => picked.some((id) => each.covers.has(id))) ?? null;
  const stack = useRef(new Stack());
  const file = useRef<HTMLInputElement>(null);
  const look = THEMES.find((item) => item.name === theme) ?? THEMES[0]!;
  const nextLook = THEMES[(THEMES.indexOf(look) + 1) % THEMES.length]!;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("mnd.theme", theme); } catch { /* a private window */ }
  }, [theme]);

  const settle = (next: Graph, name: string, said: string) => {
    stack.current = new Stack();
    setGraph(next);
    setLayer(null);
    setPicked([]);
    setFocus(null);
    setFields(null);
    tray.release();
    // The library shut, and the document open one level: every block below its root folded.
    setFolded([...LIBRARY, ...Object.keys(next.blocks).filter((id) => id !== next.root)]);
    setNote(`${name}: ${said}.`);
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

  /** One markdown file is read into content blocks — the case being designed
   *  against. Anything else is filed by path, one block per file and folder. */
  const open_source = (found: { name: string; files: SourceFile[] } | null) => {
    if (!found) return;
    const [only] = found.files;
    if (!only) { setNote("Nothing to read there."); return; }
    if (found.files.length === 1 && /\.(md|mdx)$/i.test(only.path)) {
      const graph = read(found.name, only.text);
      settle(graph, found.name, `${Object.keys(graph.blocks).length - 1} blocks`);
      return;
    }
    settle(scan(found.name, found.files), found.name, `${found.files.length} files`);
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
      .then((found) => { if (found) open_source(found); })
      .catch(() => setNote(BLANK));
  }, []);

  const drop = async (event: React.DragEvent) => {
    event.preventDefault();
    setOver(false);
    setNote("Reading…");
    try {
      const found = await drop_folder(event.dataTransfer);
      if (!found) { setNote("Drop a folder, or a markdown file."); return; }
      open_source(found);
    } catch (error: unknown) { setNote(say(error)); }
  };

  /** A document by default; a folder when the shift key is down. */
  const add = async (folder: boolean) => {
    setNote("Reading…");
    try { open_source(await (folder ? pick_folder() : pick_file())); }
    catch (error: unknown) { setNote(say(error)); }
  };

  /** The graph as a file, and back. Import replaces the session. */
  const to_file = () => {
    if (!graph) return;
    const name = (graph.blocks[graph.root]?.name ?? "workspace").replace(/\.[^.]+$/, "");
    try {
      save(new Blob([write(graph, name)], { type: "application/json" }), `${name}.json`);
      setNote("Exported.");
    } catch (error: unknown) { setNote(say(error)); }
  };

  const from_file = async (file: File) => {
    try {
      const opened = open(await file.text());
      if (opened.faults.length) { setNote(opened.faults.map((f) => f.what).join("\n")); return; }
      settle(opened.graph, file.name, `${Object.keys(opened.graph.blocks).length - 1} blocks`);
    } catch (error: unknown) { setNote(say(error)); }
  };

  /** A pick anywhere but the tray gives the tray back to the canvas. */
  const pick = (ids: Id[]) => { setPicked(ids); tray.release(); };

  /** Read the row `by` rows on from the one being read, staying on the open layer. */
  const turn = (by: number) => {
    const at = row ? series.indexOf(row) + by : 0;
    const next = series[Math.max(0, Math.min(series.length - 1, at))];
    if (!next) return;
    land(next.anchor);
  };

  /** Pick a card by key: centre it, and open the explorer's branches down to it. */
  const land = (id: Id) => {
    pick([id]);
    setFocus(id);
    if (!graph) return;
    const up = new Set<Id>();
    for (let at = graph.blocks[id]?.parent; at; at = graph.blocks[at]?.parent) up.add(at);
    setFolded((held) => held.filter((each) => !up.has(each)));
  };

  /** Across the row: the next card, opened in the explorer. */
  const across = () => {
    const at = row && picked[0] ? row.cards.indexOf(picked[0]) : -1;
    const next = row?.cards[at + 1];
    if (!row || at < 0 || !next) return;
    land(next);
    setFolded((held) => held.filter((each) => each !== next));
  };

  /** Back along the row: the card before, the one left shut; from the heading, out of the layer. */
  const back = () => {
    const at = row && picked[0] ? row.cards.indexOf(picked[0]) : -1;
    if (!row || at <= 0) { leave(); return; }
    const left = picked[0]!;
    land(row.cards[at - 1]!);
    setFolded((held) => [...new Set([...held, left])]);
  };

  /** Open the row being read, where it holds anything, and read its first row. */
  const enter = () => {
    const [id] = picked;
    if (!graph || !id || picked.length > 1 || !is_container(graph, id)) return;
    const first = rows(graph, id)[0]?.anchor ?? null;
    setLayer(id);
    setFields(null);
    if (first) land(first);
    else { pick([]); setFocus(null); }
  };

  /** Leave the open layer, reading on from the row that opened it, its branch shut again. */
  const leave = () => {
    if (!graph || !layer) return;
    const up = graph.blocks[layer]?.parent ?? graph.root;
    setLayer(up === graph.root ? null : up);
    setFields(null);
    land(layer);
    setFolded((held) => [...new Set([...held, layer])]);
  };

  /** The arrows read the page, enter opens a card and escape leaves — unless something is typed. */
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement
        && event.target.closest("input, textarea, select, button, [contenteditable='true']");
      const does: Record<string, () => void> = {
        [FORWARD]: () => turn(1), [BACK]: () => turn(-1), [ACROSS]: across, [OUT]: back,
        [ENTER]: enter, ...Object.fromEntries(LEAVE.map((name) => [name, leave])),
      };
      const act = does[event.key];
      if (typing || event.defaultPrevented || !act) return;
      event.preventDefault();
      act();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  /** Explorer intents: reveal / rename / move / create / delete. */
  const act = useCallback((name: string, args?: Record<string, unknown>) => {
    if (!graph) return;
    const id = args?.id === undefined ? null : String(args.id) as Id;
    /** The root layer is `null`, whatever id the graph gives it. */
    const layer_of = (at: Id | null | undefined) => (!at || at === graph.root ? null : at);

    if (name === "reveal" && id) {
      /** A row that holds anything opens as the layer; a leaf lights on its parent. */
      if (is_container(graph, id)) { setLayer(layer_of(id)); setPicked([]); return; }
      setLayer(layer_of(graph.blocks[id]?.parent));
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
        <span className="mm-picks">
          <button type="button" className="mm-pick" onClick={() => void add(false)}>
            Pick a document
          </button>
          <button type="button" className="mm-pick" onClick={() => void add(true)}>
            Pick a folder
          </button>
        </span>
      </main>
    );
  }

  const blocks = Math.max(0, Object.keys(graph.blocks).length - 1);
  /** What the tray is about: the pick, or else the open layer. */
  const about = graph.blocks[picked[0] ?? layer ?? graph.root];
  const kind = about?.type ? graph.defs[about.type]?.name ?? about.type : "block";

  return (
    <div className={`app${over ? " over" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={drop}>
      <WorkspaceHeader brand="mndmap" where={<span className="where">{blocks} blocks</span>}>
        <button type="button" title="undo" aria-label="Undo" onClick={() => step(true)}
          disabled={stack.current.depth === 0}><Icon name="undo" /></button>
        <button type="button" title="redo" aria-label="Redo" onClick={() => step(false)}
          disabled={stack.current.forward === 0}><Icon name="redo" /></button>
        <button type="button" title="export this workspace" aria-label="Export"
          onClick={to_file}><Icon name="export_workspace" /></button>
        <button type="button" title="import a workspace" aria-label="Import"
          onClick={() => file.current?.click()}><Icon name="import_file" /></button>
        <button type="button" title={`theme: ${theme} — click for ${nextLook.name}`}
          aria-label={`theme: ${theme}`} onClick={() => setTheme(nextLook.name)}>
          <Icon name={look.icon} />
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (chosen) void from_file(chosen);
          }} />
      </WorkspaceHeader>

      <Explorer graph={graph} open={layer} picked={picked} folded={folded} menu
        tools={{ block: false }}
        extra={
          <button type="button" aria-label="Open a document"
            title="open a markdown document — shift+click for a folder"
            onClick={(event) => void add(event.shiftKey)}><Icon name="add_document" /></button>
        }
        section={tray.section(graph.root)}
        onSection={(at) => { setPicked([]); tray.onSection(at); }}
        onAct={act}
        onFold={(id, shut) => setFolded((held) =>
          shut ? [...new Set([...held, id])] : held.filter((each) => each !== id))}
        onPick={pick} />

      <main>
        <div className="mm-canvas">
          <Viewer graph={view ?? graph} layer={layer} picked={picked} card={display.card}
            full={full} scroll focus={focus}
            chrome={{ crumbs: true, lattice: display.lattice ?? true, legend: display.legend,
                      corner: display.corner }}
            fields={fields} onFields={setFields}
            onLook={(at) => { setLayer(at); setFocus(null); }} onPick={pick} />
          {note ? (
            <p className="strip mm-strip" onClick={() => setNote("")}>{note}</p>
          ) : null}
        </div>
        <TrayFrame open={tray.open} onOpen={tray.onOpen} big={big} onBig={setBig}
          word={kind} name={about?.name ?? ""} tabs={TABS} tab="markdown" onTab={() => {}}>
          {graph.packages[MD]
            ? <Document graph={graph} row={row} />
            : <Preview graph={graph} picked={about?.id ?? null} />}
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

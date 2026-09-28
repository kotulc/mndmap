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

import { Explorer, Icon, TrayFrame, Viewer, WorkspaceHeader, tree_of, useDisplay,
         useTray, type Pointed } from "@mnd/kit/react";
import { CARD, children, is_container, open, write, type Graph, type Id } from "@mnd/kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apply, Stack, type Edit } from "../edits.js";
import { charted, DEFINED, holder_of, listed, type Chart } from "../library.js";
import { laid, pitch, read, seen_as, span } from "../read.js";
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

/** How many cards of a row the page reads at once, zoomed in on a pick, and how many a chart's
 *  group sets across. An opened block reads alone, fitted to itself. */
const READ = 3;

/** The fewest cards across a definition's context reads at, so it is seen whole. */
const CONTEXT = 4;

const BLANK = "Drop a markdown document or a folder, or pick one below.";

/** The explorer's usages section, by the id it folds it under. The kit keeps this to itself, so
 *  it is named again here. */
const USAGES = "@uses";

/** The tray's one tab. */
const TABS = ["markdown"] as const;

/** Keys beside the explorer's arrows: open what is picked, clear it, and leave the layer. */
const ENTER = "Enter";
const CLEAR = "Escape";
const LEAVE = "Backspace";


export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  /** The open layer; `null` is the root, as the kit names it. */
  const [layer, setLayer] = useState<Id | null>(null);
  const [picked, setPicked] = useState<Id[]>([]);
  const [folded, setFolded] = useState<Id[]>([]);
  const [note, setNote] = useState(BLANK);
  const [theme, setTheme] = useState<ThemeName>(() => stored_theme());
  const [over, setOver] = useState(false);
  const tray = useTray();
  const [big, setBig] = useState(false);
  const { display } = useDisplay({ card: CONTENT_CARD, range: CARD, full: false });
  /** The document laid out as it reads: a backbone down the page, content across. */
  const full = display.full ?? false;
  const page = useMemo(() => graph && laid(graph, display.card, full),
    [graph, display.card, full]);
  /** The definitions charted in the page's place, while a library section is picked. */
  const [charting, setCharting] = useState<Chart | null>(null);
  const view = useMemo(() => graph && charting ? charted(graph, charting, display.card, full, READ)
    : page, [graph, charting, page, display.card, full]);
  /** The open layer's rows as drawn, the one the pick sits in, and how wide the view reads. */
  const series = useMemo(() => (view ? rows(view, layer ?? view.root) : []), [view, layer]);
  const row = series.find((each) => picked.some((id) => each.covers.has(id))) ?? null;
  /** What of the pick the canvas draws: the open layer's own block is the whole of it, no card. */
  const cards = picked.filter((id) => id !== (layer ?? view?.root));
  /** What the pick stands for: a preview card picks the block it previews. */
  const real = picked.map((id) => view?.blocks[id]?.of ?? id);
  /** One card's column on the page: what the reader's widths are counted in. */
  const column = page ? pitch(page, page.root) : null;
  /** The opened focus block, where the open layer is one: its preview on the page. */
  const opened = layer && view?.blocks[layer]?.of ? layer : null;
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
    setCharting(null);
    tray.release();
    // Every branch of the tree shut but the usages and the document's root, open one level.
    setFolded(tree_of(next, [], true).filter((row) => row.kids)
      .map((row) => row.id).filter((id) => id !== USAGES && id !== next.root));
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

  /** Where a block is drawn: itself inside the focus opened on it, else its card on the page. */
  const shown = (id: Id) => (!page || view?.blocks[opened ?? ""]?.of === id ? id : seen_as(page, id));

  /** Project a row of the library in the page's place, as the explorer files it. A definition is
   *  picked on the projection holding it, or on its own folder's where this one does not. */
  const chart = (at: Pointed) => {
    if (!graph) return;
    setLayer(null);
    if (at.of === "defs") { setCharting({ at }); setPicked([]); return; }
    const drawn = charting && listed(graph, charting.at).includes(at.id);
    const home = drawn && !charting?.local ? null : holder_of(graph, at.id);
    if (home) setCharting({ at: home });
    setPicked([`${DEFINED}${at.id}`]);
  };

  /** A pick from the tree, lit where it is drawn. Nothing picked there is the workspace: the page,
   *  whole. */
  const pick_shown = (ids: Id[]) => {
    if (!ids.length) { setCharting(null); setLayer(null); }
    pick(ids.map(shown));
  };

  /** Open a card, what is picked by default: on a chart, a definition in its own context and a block on the page; a
   *  card that holds anything — a focus block, a folder — as the layer, its first row picked. */
  const enter = (id = picked.length === 1 ? picked[0] : undefined) => {
    const held = id && (view?.blocks[id]?.of ?? id);
    if (!view || !id || !held) return;
    if (charting && graph?.defs[held]) {
      setCharting({ ...charting, local: held });
      pick([`${DEFINED}${held}`]);
      return;
    }
    if (charting && graph?.blocks[held] && page) {
      setCharting(null);
      pick([seen_as(page, held)]);
      return;
    }
    if (!is_container(view, id)) return;
    const first = rows(view, id)[0]?.anchor;
    setLayer(id === view.root ? null : id);
    pick(first ? [first] : []);
  };

  /** Leave the open layer, its card picked; leave a definition's context for its chart, and a
   *  chart for the page. */
  const leave = () => {
    const local = charting?.local;
    if (charting && local) {
      setCharting({ at: charting.at });
      pick([`${DEFINED}${local}`]);
      return;
    }
    if (charting) { setCharting(null); pick([]); return; }
    if (!view || !layer) return;
    const up = view.blocks[layer]?.parent ?? view.root;
    setLayer(up === view.root ? null : up);
    pick([layer]);
  };

  /** Clear the pick; with nothing picked, leave the layer. */
  const clear = () => (picked.length ? pick([]) : leave());

  /** Enter opens, escape clears and backspace leaves — unless something is typed. The arrows are
   *  the explorer's. */
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement
        && event.target.closest("input, textarea, select, button, [contenteditable='true']");
      const does: Record<string, () => void> = { [ENTER]: () => enter(), [CLEAR]: clear, [LEAVE]: leave };
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

    if (name === "reveal" && id && page) {
      setCharting(null);
      /** Lit where it is drawn: inside the focus opened on it, else on its card's layer — the page,
       *  leaving any focus. A folder opens as the layer. */
      const at = shown(id);
      if (at === id && is_container(page, id)) { setLayer(layer_of(id)); setPicked([]); return; }
      const home = page.blocks[at]?.parent;
      if (home !== (layer ?? page.root)) setLayer(layer_of(home));
      setPicked([at]);
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
  }, [edit, graph, page, view, layer, opened]);

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
  const about = graph.blocks[real[0] ?? ""] ?? graph.blocks[layer ?? graph.root];
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

      <Explorer graph={graph} open={layer} picked={real} folded={folded} menu keys
        tools={{ block: false }}
        extra={
          <button type="button" aria-label="Open a document"
            title="open a markdown document — shift+click for a folder"
            onClick={(event) => void add(event.shiftKey)}><Icon name="add_document" /></button>
        }
        section={tray.section(graph.root) ?? (charting && !charting.local
          && !real.some((id) => graph.defs[id]) ? charting.at : null)}
        onSection={(at) => { tray.onSection(at); chart(at); }}
        onAct={act}
        onFold={(id, shut) => setFolded((held) =>
          shut ? [...new Set([...held, id])] : held.filter((each) => each !== id))}
        onPick={pick_shown} />

      <main>
        <div className="mm-canvas">
          {/* One per drawing — the page, a chart, a definition's context — so each is framed
              afresh. */}
          <Viewer key={charting ? charting.local ?? JSON.stringify(charting.at) : "page"}
            graph={view ?? graph}
            layer={layer} picked={cards} card={display.card} full={full || !!opened} scroll
            focus={opened || charting?.local ? null : cards[0] ?? null}
            reach={opened ? span(view!, opened)
              : charting?.local ? Math.max(span(view!, view!.root), CONTEXT * (column ?? 0))
              : column && READ * column}
            chrome={{ crumbs: true, lattice: display.lattice ?? true, legend: display.legend,
                      corner: display.corner }}
            onLook={setLayer} onPick={pick} onOpen={enter} />
          {note ? (
            <p className="strip mm-strip" onClick={() => setNote("")}>{note}</p>
          ) : null}
        </div>
        <TrayFrame open={tray.open} onOpen={tray.onOpen} big={big} onBig={setBig}
          word={kind} name={about?.name ?? ""} tabs={TABS} tab="markdown" onTab={() => {}}>
          {graph.packages[MD]
            ? <Document graph={graph} view={view ?? graph} row={row} picked={real} />
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

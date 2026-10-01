/** The shell over one held graph.
 *
 *  One markdown document is read into a graph of content blocks — a section group per heading,
 *  and a block per run of prose, list, fence, table and image. A folder is filed by path instead,
 *  one block per file. The explorer, the canvas and the tray are the kit's, and so is what they
 *  share: the tray's state and how the drawing looks. What is mndmap's is reading, the document
 *  laid out as it reads, the library's projections, the markdown tab, and reorganizing — edits
 *  apply to the held graph, and undo is the stack of graphs behind it. */

import { Explorer, Icon, TrayFrame, Viewer, WorkspaceHeader, tree_of, useDisplay,
         useTray, type Pointed } from "@mnd/kit/react";
import { CARD, UNITS, children, is_container, open, write, type Graph, type Id }
  from "@mnd/kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apply, Stack, type Edit } from "../edits.js";
import { boxed_pack, charted, chart_width, DEFINED, home_of, label_of, up_of,
         type Chart } from "../library.js";
import { laid, read, tagged } from "../read.js";
import { dev_sample, drop_folder, pick_file, pick_folder, save, scan, type SourceFile } from "../scan.js";
import { MD } from "../packages/markdown.js";
import { covered, section_of } from "../series.js";
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

/** How many cards a row reads at once: as many as the canvas holds at their own size, but never
 *  fewer than a portrait canvas holds, nor more than a row reads at a glance. */
const ACROSS = { least: 3, most: 8 };

/** The most a drawing magnifies: its cards at their own size. */
const ACTUAL = 1;

const BLANK = "Drop a markdown document or a folder, or pick one below.";

/** The crumbs' two steps: the layer drawn, and a definition or folder opened on it. */
const TOP = "top";
const OPENED = "opened";

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
  /** The block the tray's pointer is over, lit on the canvas. */
  const [pointed, setPointed] = useState<Id | null>(null);
  const tray = useTray();
  const [big, setBig] = useState(false);
  const { display } = useDisplay({ card: CONTENT_CARD, range: CARD, full: false });
  const full = display.full ?? false;
  /** The definitions charted in the page's place, while a library section is picked. */
  const [charting, setCharting] = useState<Chart | null>(null);
  /** How wide the canvas is, and how many of a step it holds across at their own size. */
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const room = useWidth(canvas);
  /** How many cards a row sets across: a card and the air after it are its step. */
  const across = Math.min(ACROSS.most, Math.max(ACROSS.least,
    Math.floor(room / Math.max(1, (display.card.w + UNITS.gap) * UNITS.unit))));
  /** The document laid out as it reads: its sections boxed, `across` cards to a row. */
  const page = useMemo(() => graph && laid(graph, display.card, full, across),
    [graph, display.card, full, across]);
  const view = useMemo(() => graph && charting
    ? charted(graph, charting, display.card, full, across) : page,
    [graph, charting, page, display.card, full, across]);
  /** What of the pick the canvas draws: the open layer's own block is the whole of it, no card. */
  const cards = picked.filter((id) => id !== (layer ?? view?.root));
  /** What the pick stands for: a chart's card picks what it stands for. */
  const real = picked.map((id) => view?.blocks[id]?.of ?? id);
  /** What the tray lights: the section the pick sits in, whole. */
  const lit = useMemo(() => (graph && !charting ? covered(graph, [section_of(graph, real[0])
    ?? real[0] ?? ""]) : new Set<Id>()), [graph, charting, real[0]]);
  const stack = useRef(new Stack());
  /** A block just made or moved, revealed once the page is laid out with it. */
  const follow = useRef<Id | null>(null);
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
    // Every branch inside a section shut but the document's root; the sections stay open, so a
    // section of plain rows, which offers no fold of its own, still shows them.
    setFolded(tree_of(next, [], true).filter((row) => row.kids && row.depth)
      .map((row) => row.id).filter((id) => id !== next.root));
    setNote(`${name}: ${said}.`);
  };

  const edit = useCallback((change: Edit) => {
    setGraph((held) => {
      if (!held) return held;
      const result = apply(held, change);
      if (result.faults.length) { setNote(result.faults.join("\n")); return held; }
      stack.current.push(held);
      follow.current = result.made ?? follow.current;
      setNote("");
      return tagged(result.graph);
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

  /** Project a library row in the page's place: a section of it whole, or a definition's card
   *  picked on the section it is drawn on. */
  const chart = (at: Pointed) => {
    if (!graph) return;
    setLayer(null);
    if (at.of === "defs") { setCharting({ at }); pick([]); return; }
    setCharting({ at: home_of(graph, at.id) });
    pick([`${DEFINED}${at.id}`]);
  };

  /** A pick from the tree, lit where it is drawn. Nothing picked there is the workspace: the page,
   *  whole. */
  const pick_shown = (ids: Id[]) => {
    if (!ids.length) { setCharting(null); setLayer(null); }
    pick(ids);
  };

  /** Open a card, what is picked by default: on a chart, a package's box as its own chart, a
   *  definition opened, and a usage on the page; on the page, a card that holds anything — a
   *  folder — as the layer, its first block picked. */
  const enter = (id = picked.length === 1 ? picked[0] : undefined) => {
    const held = id && (view?.blocks[id]?.of ?? id);
    if (!view || !graph || !id || !held) return;
    const pack = charting ? boxed_pack(graph, id) : null;
    if (pack) { setCharting({ at: pack }); pick([]); return; }
    if (charting && graph.defs[held]) {
      setCharting({ ...charting, local: held });
      pick([`${DEFINED}${held}`]);
      return;
    }
    if (charting && graph.blocks[held]) {
      setCharting(null);
      pick([held]);
      return;
    }
    if (charting || !is_container(view, id)) return;
    const first = children(view, id)[0]?.id;
    setLayer(id === view.root ? null : id);
    pick(first ? [first] : []);
  };

  /** Leave the open layer, its card picked; on a chart, leave a definition opened for its card, a
   *  package for `packages`, and a section for the page. */
  const leave = () => {
    const local = charting?.local;
    if (charting && local) {
      setCharting({ at: charting.at });
      pick([`${DEFINED}${local}`]);
      return;
    }
    if (charting) {
      const up = up_of(charting.at);
      setCharting(up ? { at: up } : null);
      pick([]);
      return;
    }
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
      /** Lit on its layer, the page or a folder; a folder opens as the layer. */
      if (is_container(page, id)) { setLayer(layer_of(id)); setPicked([]); return; }
      const home = page.blocks[id]?.parent;
      if (home !== (layer ?? page.root)) setLayer(layer_of(home));
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
        // It joins the group of the block it lands before, or of the last where it lands last.
        const group = graph.blocks[before ?? siblings.at(-1) ?? ""]?.group ?? null;
        edit({ do: "move", id: moveId, parent, group, ...(at >= 0 ? { at } : {}) });
      }
    }
  }, [edit, graph, page, layer]);

  /** What was made or moved becomes the context: revealed, so the camera centers on it. */
  useEffect(() => {
    const id = follow.current;
    if (!id || !page?.blocks[id]) return;
    follow.current = null;
    act("reveal", { id });
  }, [page, act]);

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
  /** The crumbs: one per layer, from the section drawn — a library section and a definition
   *  opened on it, or the page and a folder opened on it. Picking one goes there; going up one is
   *  leaving. */
  const opened = charting ? graph.defs[charting.local ?? ""]?.name : graph.blocks[layer ?? ""]?.name;
  const trail = [
    { id: TOP, label: charting ? label_of(charting.at) : "usages" },
    ...(opened ? [{ id: OPENED, label: opened }] : []),
  ];
  const walk = (id: string | null) => {
    if (id === null) { leave(); return; }
    if (id !== TOP) return;
    if (charting) setCharting({ at: charting.at });
    else setLayer(null);
    pick([]);
  };

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
            onClick={(event) => void add(event.shiftKey)}><Icon name="add" /></button>
        }
        section={tray.section(graph.root) ?? (charting && !charting.local
          && !real.some((id) => graph.defs[id]) ? charting.at : null)}
        onSection={(at) => { tray.onSection(at); chart(at); }}
        onAct={act}
        onFold={(id, shut) => setFolded((held) =>
          shut ? [...new Set([...held, id])] : held.filter((each) => each !== id))}
        onPick={pick_shown} />

      <main>
        <div className="mm-canvas" ref={setCanvas}>
          {/* One per drawing — the page, a chart, a definition opened — so each is framed afresh.
              Each reads as many cards across as the canvas holds, at their own size at most. */}
          <Viewer key={charting ? charting.local ?? JSON.stringify(charting.at) : "page"}
            graph={view ?? graph}
            layer={layer} picked={cards} lit={pointed ? [pointed] : []}
            card={display.card} full={full} scroll
            focus={charting?.local ? null : cards[0] ?? null}
            reach={charting ? chart_width(across) : null} most={ACTUAL}
            chrome={{ crumbs: true, lattice: display.lattice ?? true, legend: display.legend,
                      corner: display.corner, frame: false }}
            trail={trail} onTrail={walk}
            onLook={setLayer} onPick={pick} onOpen={enter} />
          {note ? (
            <p className="strip mm-strip" onClick={() => setNote("")}>{note}</p>
          ) : null}
        </div>
        <TrayFrame open={tray.open} onOpen={tray.onOpen} big={big} onBig={setBig}
          word={kind} name={about?.name ?? ""} tabs={TABS} tab="markdown" onTab={() => {}}>
          {graph.packages[MD]
            ? <Document graph={graph} lit={lit} picked={real}
                onPick={(id) => act("reveal", { id })} onPoint={setPointed} />
            : <Preview graph={graph} picked={about?.id ?? null} />}
        </TrayFrame>
      </main>
    </div>
  );
}


/** How wide an element is, in pixels, as it is resized; nothing until there is one. */
function useWidth(element: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const watch = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    watch.observe(element);
    return () => watch.disconnect();
  }, [element]);
  return width;
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

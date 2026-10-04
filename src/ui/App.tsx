/** The shell over one held collection.
 *
 *  A folder is listed into a collection — a holder per folder, a definition per file — and each
 *  markdown file is a document, read from disk into content blocks the first time it is reached: a
 *  section group per heading, and a block per run of prose, list, fence, table and image. The
 *  explorer's two sections are a chain: `collection` holds a folder or document, and `document`
 *  lists what it holds. **The explorer browses; the canvas draws what was opened** — a folder's
 *  cards, a document as its page. The explorer, canvas and tray are the kit's; reading, the page,
 *  the markdown tab and reorganizing are mndmap's — edits apply to the held graph, and undo is the
 *  stack of graphs behind it. */

import { Explorer, Icon, TrayFrame, Viewer, WorkspaceHeader, domain_listing, structure_listing,
         useChain, useDisplay, useTray, type Slice } from "@mnd/kit/react";
import { CARD, UNITS, children, headed_group, layer_of, open, path, write, type Graph,
         type Id } from "@mnd/kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apply, Stack, type Edit } from "../edits.js";
import { laid, read } from "../read.js";
import { dev_sample, drop_folder, first_document, is_document, pick_file, pick_folder, save, scan,
         PACKAGES, type SourceFile } from "../scan.js";
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

/** The tray's one tab. */
const TABS = ["markdown"] as const;

/** The key beside the explorer's own: clear the pick, and with nothing picked, leave. */
const CLEAR = "Escape";

/** The sections: the collection — the workspace's domain, its folders and documents — then the
 *  document held, its own row with its content under it. */
const AT_COLLECTION = 0;
const AT_DOCUMENT = 1;
const SLICES: Slice[] = [
  { id: "collection", label: "collection", mark: "folder",
    list: (graph) => domain_listing(graph, graph.root),
    first: (graph) => first_document(graph) },
  { id: "document", label: "document", mark: "usages",
    list: (_, [held]) => structure_listing(held ?? null),
    first: (_, [held]) => held ?? null },
];


export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
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
  const chain = useChain(graph, SLICES);
  /** How wide the canvas is, and how many of a step it holds across at their own size. */
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const room = useWidth(canvas);
  /** How many cards a row sets across: a card and the air after it are its step. */
  const across = Math.min(ACROSS.most, Math.max(ACROSS.least,
    Math.floor(room / Math.max(1, (display.card.w + UNITS.gap) * UNITS.unit))));
  /** What the collection holds, and the layer the canvas draws: **what was last opened**, never
   *  what is browsed — a folder's cards, or a document as its page. */
  const home = graph ? chain.held[AT_COLLECTION] ?? graph.root : null;
  const [opened_at, setOpened] = useState<Id | null>(null);
  const layer = graph ? (opened_at && graph.blocks[opened_at] ? opened_at : graph.root) : null;
  /** Each file's reader, by its path, for the session: a document is read when it is reached. */
  const sources = useRef(new Map<string, () => Promise<string>>());
  /** Which documents were read this session. Session state, never in the graph. */
  const reading = useRef(new Set<Id>());
  /** The document drawn as a page, where the layer is one. */
  const doc = graph && layer && is_document(graph, layer) ? layer : null;
  const page = useMemo(() => (graph && doc ? laid(graph, doc, display.card, full, across) : null),
    [graph, doc, display.card, full, across]);
  const view = page ?? graph;
  /** What the canvas lights: the pick, where it is drawn. */
  const cards = picked.filter((id) => id !== layer);
  /** What the tray lights: the section the pick sits in, whole. */
  const lit = useMemo(() => (graph && doc ? covered(graph, [section_of(graph, picked[0])
    ?? picked[0] ?? ""]) : new Set<Id>()), [graph, doc, picked[0]]);
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

  /** A document reached for the first time is read from its file — the text it has on disk now —
   *  and its sections fold under their headings. Reading is not an edit: it says what was always
   *  there. A document that came in a workspace file already holds what it read. */
  const reach = (held: Graph, id: Id) => {
    if (!is_document(held, id) || reading.current.has(id) || children(held, id).length) return;
    const get = sources.current.get(held.blocks[id]?.source ?? "");
    if (!get) return;
    reading.current.add(id);
    void get().then((text) => setGraph((was) => {
      if (!was?.blocks[id]) return was;
      const next = read(was, id, text);
      const heads = Object.values(next.blocks).filter((block) => headed_group(next, block.id))
        .map((block) => `${SLICES[AT_DOCUMENT]!.id}/${route(next, id, block.id)}`);
      setFolded((folds) => [...new Set([...folds, ...heads])]);
      return next;
    }));
  };

  /** Whatever the sections hold, or the canvas has open, is read as it is reached. */
  useEffect(() => {
    if (!graph) return;
    for (const id of [...chain.held, layer]) if (id) reach(graph, id);
  }, [graph, chain.held.join("|"), layer]);

  const settle = (found: Graph, name: string, said: string) => {
    stack.current = new Stack();
    reading.current = new Set();
    const first = first_document(found);
    setFolded([]);
    setGraph(found);
    setPicked([]);
    setOpened(first);
    tray.release();
    chain.onTrace(first ? [first, null] : [null]);
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

  /** A folder, or one markdown document, read into a collection. */
  const open_source = (found: { name: string; files: SourceFile[] } | null) => {
    if (!found) return;
    if (!found.files.length) { setNote("Nothing to read there."); return; }
    const collection = scan(found.name, found.files);
    sources.current = new Map(found.files.map((f) => [f.path, f.read]));
    const docs = Object.keys(collection.blocks).filter((id) => is_document(collection, id));
    settle(collection, found.name, `${found.files.length} files, ${docs.length} documents`);
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
      const imported = open(await file.text(), PACKAGES);
      if (imported.faults.length) { setNote(imported.faults.map((f) => f.what).join("\n")); return; }
      settle(imported.graph, file.name, `${Object.keys(imported.graph.blocks).length - 1} blocks`);
    } catch (error: unknown) { setNote(say(error)); }
  };

  /** Where a block sits in the sections: a folder or document is the collection's to hold; any
   *  other block is held in the document it sits in. */
  const trail_of = (held: Graph, id: Id): (Id | null)[] => {
    const up = path(held, id).map((block) => block.id).reverse();
    const at = up.find((each) => is_document(held, each));
    return !at || at === id ? [id] : [at, id];
  };

  /** Hold this block where it sits, and pick it; the tray goes back to the canvas. A pick inside
   *  the open document may move the canvas to the layer it is drawn on. */
  const reveal = (id: Id) => {
    if (!graph) return;
    const at = trail_of(graph, id);
    chain.onTrace(at);
    setPicked(id === graph.root ? [] : [id]);
    const doc = at.length > 1 ? at[0] : null;
    if (doc && layer && (layer === doc || path(graph, layer).some((b) => b.id === doc))) {
      setOpened(layer_of(graph, id) ?? doc);
    }
    tray.release();
  };

  /** **A row chosen in the explorer is browsed**: held in its section and picked, so the tray
   *  shows it, while the canvas stays where it was opened. */
  const choose = (at: number, id: Id | null) => {
    chain.onChoose(at, id);
    tray.release();
    setPicked(id && !(at === AT_DOCUMENT && id === home) ? [id] : []);
  };

  /** A pick on the canvas holds what it picked; picking nothing keeps the focus. */
  const pick = (ids: Id[]) => {
    tray.release();
    if (ids.length === 1) { reveal(ids[0]!); return; }
    setPicked(ids);
  };

  /** Open a folder or document — what is picked, by default — for the canvas to draw: a folder's
   *  cards, a document as its page, or a block holding content as its own layer. */
  const enter = (id = picked.length === 1 ? picked[0] : chain.at === AT_COLLECTION ? home : null) => {
    if (!graph || !id || !graph.blocks[id]) return;
    if (!is_document(graph, id) && !children(graph, id).length) return;
    const doc = path(graph, id).map((b) => b.id).find((each) => is_document(graph, each));
    chain.onTrace(doc && doc !== id ? [doc, id] : [id, null]);
    setOpened(id);
    setPicked([]);
  };

  /** Leave for the layer the open one is drawn on, what was open picked there. */
  const leave = () => {
    if (!graph || !layer || layer === graph.root) return;
    const up = layer_of(graph, layer) ?? graph.root;
    const doc = path(graph, up).map((b) => b.id).find((each) => is_document(graph, each));
    chain.onTrace(doc ? [doc, up] : [up]);
    setOpened(up);
    setPicked([layer]);
  };

  /** Clear the pick; with nothing picked, leave. */
  const clear = () => {
    if (!picked.length) { leave(); return; }
    if (chain.at === AT_DOCUMENT) chain.onChoose(AT_DOCUMENT, null);
    setPicked([]);
  };

  /** Enter opens, escape clears and backspace leaves — unless something is typed. The arrows are
   *  the explorer's. */
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement
        && event.target.closest("input, textarea, select, button, [contenteditable='true']");
      const does: Record<string, () => void> = { [CLEAR]: clear };
      const act = does[event.key];
      if (typing || event.defaultPrevented || !act) return;
      event.preventDefault();
      act();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  /** Explorer intents: reveal / rename / move / create / delete. */
  const act = (name: string, args?: Record<string, unknown>) => {
    if (!graph) return;
    const id = args?.id === undefined ? null : String(args.id) as Id;

    if (name === "reveal" && id && graph.blocks[id]) { reveal(id); return; }
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
      const ids = args.ids as Id[];
      // Landing before a head is landing before the group it heads.
      const said = typeof args.before === "string" ? args.before : null;
      const before = said && (headed_group(graph, said) ?? said);
      const kin = children(graph, parent).map((block) => block.id).filter((id) => !ids.includes(id));
      const at = before && kin.includes(before) ? kin.indexOf(before) : kin.length;
      // Under a row that heads a section, they land in that section, after its head.
      const above = kin[at - 1];
      const into = above ? headed_group(graph, above) : null;
      if (into) edit({ do: "move", ids, parent: into, at: children(graph, into).length });
      else edit({ do: "move", ids, parent, at });
    }
  };

  /** What was made or moved becomes the context: revealed, so the camera centers on it. */
  useEffect(() => {
    const id = follow.current;
    if (!id || !graph?.blocks[id]) return;
    follow.current = null;
    reveal(id);
  }, [graph]);

  if (!graph || !home) {
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

  /** What the collection holds and what its documents read into, never a package's. */
  const blocks = Object.values(graph.blocks).filter((block) => path(graph, block.id)[0]?.id === graph.root)
    .length - 1;
  /** What the tray is about: the pick, or else what the collection holds. */
  const about = graph.blocks[picked[0] ?? ""] ?? graph.blocks[home];
  const kind = about?.type ? graph.blocks[about.type]?.name ?? about.type : "block";
  /** The document the tray reads whole: the one drawn, or a read one picked in the collection. */
  const shown = doc ?? (about && is_document(graph, about.id) && children(graph, about.id).length
    ? about.id : null);
  /** The crumbs: the collection's folders down to the layer drawn. Picking one opens it. */
  const trail = path(graph, layer ?? graph.root)
    .map((block) => ({ id: block.id, label: block.name ?? "" }));
  const walk = (id: string | null) => (id === null ? leave() : enter(id));

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

      <Explorer graph={graph} open={layer} picked={picked} folded={folded} menu keys
        tools={{ block: false }}
        extra={
          <button type="button" aria-label="Open a document"
            title="open a markdown document — shift+click for a folder"
            onClick={(event) => void add(event.shiftKey)}><Icon name="add" /></button>
        }
        chain={{ ...chain, onChoose: choose }}
        onOpen={({ id }) => enter(id)}
        onLeave={leave}
        onAct={act}
        onFold={(id, shut) => setFolded((held) =>
          shut ? [...new Set([...held, id])] : held.filter((each) => each !== id))}
        onPick={pick} />

      <main>
        <div className="mm-canvas" ref={setCanvas}>
          {/* One per drawing, so each is framed afresh. Each reads as many cards across as the
              canvas holds, at their own size at most. */}
          <Viewer key={layer ?? ""}
            graph={view ?? graph}
            layer={layer} picked={cards}
            lit={pointed ? [pointed] : []}
            card={display.card} full={full} scroll
            focus={cards[0] ?? null}
            most={ACTUAL}
            chrome={{ crumbs: true, lattice: display.lattice ?? true, legend: display.legend,
                      corner: display.corner, frame: false }}
            trail={trail} onTrail={walk}
            onLook={() => leave()} onPick={pick} onOpen={enter} />
          {note ? (
            <p className="strip mm-strip" onClick={() => setNote("")}>{note}</p>
          ) : null}
        </div>
        <TrayFrame open={tray.open} onOpen={tray.onOpen} big={big} onBig={setBig}
          word={kind} name={about?.name ?? ""} tabs={TABS} tab="markdown" onTab={() => {}}>
          {shown
            ? <Document graph={graph} doc={shown} lit={lit} picked={picked}
                onPick={(id) => act("reveal", { id })} onPoint={setPointed} />
            : <Preview graph={graph} picked={about?.id ?? null} />}
        </TrayFrame>
      </main>
    </div>
  );
}


/** How wide an element is, in pixels, as it is resized; nothing until there is one. */
/** A block's route under a tree, as the explorer keys its rows: the tree, then each block down. */
function route(graph: Graph, tree: Id, id: Id): string {
  const ids = path(graph, id).map((b) => b.id);
  return ids.slice(Math.max(0, ids.indexOf(tree))).join("/");
}

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

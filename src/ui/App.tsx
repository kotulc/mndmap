/** Three panels over one held graph.
 *
 *  Explorer draws the organization projection (sets + pages only). The Viewer
 *  draws {@link viewingGraph}: organization plus each page's document as
 *  nested, vertically stacked canvas blocks. The tray reads the full graph.
 *  Edits always apply to the full graph; undo is the stack of graphs behind it. */

import { Explorer, Icon, Viewer, WorkspaceHeader, TrayFrame } from "@mnd/kit/react";
import { children, project, write, type Id } from "@mnd/kit";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { PAGE, SECTION, SET, TIER_ROOT } from "../doc.js";
import { apply, Stack, type Edit } from "../edits.js";
import {
  add_sources, from_drop, from_query, from_workspace, pick_sources, save, to_zip, type Loaded,
} from "./load.js";
import { organizationGraph, viewingGraph, pageOf } from "./project.js";
import { Tray, type TrayTab } from "./Tray.js";
import { file_name, WorkspacePanel, type Display } from "./Workspace.js";

type ThemeName = "retro" | "modern" | "light";

/** The three looks, each with the mark it wears. */
const THEMES = [
  { name: "retro", icon: "theme_retro" },
  { name: "modern", icon: "theme_modern" },
  { name: "light", icon: "theme_light" },
] as const;

const CARD: Display["card"] = { w: 5, h: 2 };


export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [layer, setLayer] = useState<Id | null>(TIER_ROOT);
  const [picked, setPicked] = useState<Id[]>([]);
  const [folded, setFolded] = useState<Id[]>([]);
  const [note, setNote] = useState("Drop a folder of markdown, or a workspace.json.");
  const [theme, setTheme] = useState<ThemeName>(() => stored_theme());
  const [over, setOver] = useState(false);
  const [trayOpen, setTrayOpen] = useState(true);
  const [trayBig, setTrayBig] = useState(false);
  const [tab, setTab] = useState<TrayTab>("Content");
  const [display, setDisplay] = useState<Display>({
    card: { ...CARD }, legend: false, corner: "top", lattice: true,
  });
  const [importMount, setImportMount] = useState<HTMLElement | null>(null);
  const stack = useRef(new Stack());
  const file = useRef<HTMLInputElement>(null);
  const seen = useRef<Id | null>(null);
  const look = THEMES.find((item) => item.name === theme) ?? THEMES[0]!;
  const nextLook = THEMES[(THEMES.indexOf(look) + 1) % THEMES.length]!;
  const focus = picked[0] ?? null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mnd.theme", theme);
  }, [theme]);

  const org = useMemo(
    () => (loaded?.graph ? organizationGraph(loaded.graph) : null),
    [loaded?.graph],
  );

  /** Sets/pages for the tree; pages carry their content so the stage can descend. */
  const view = useMemo(
    () => (loaded?.graph ? viewingGraph(loaded.graph) : null),
    [loaded?.graph],
  );

  /** Explorer stays on organization ids; the stage may be a section under a page. */
  const explorerLayer = useMemo(() => {
    if (!org || !loaded?.graph || !layer) return layer;
    if (org.blocks[layer]) return layer;
    return pageOf(loaded.graph, layer) ?? org.root;
  }, [org, loaded?.graph, layer]);

  /** Selection may name org ids or content ids visible on the stage. */
  useEffect(() => {
    if (!org || !view || !loaded?.graph) return;
    if (layer && !view.blocks[layer]) setLayer(TIER_ROOT);
    setPicked((held) => {
      const next = held.filter((id) => view.blocks[id]);
      return next.length === held.length ? held : next;
    });
  }, [org, view, layer, loaded?.graph]);

  useEffect(() => {
    if (!org) return;
    const atWorkspace = focus === org.root || (focus === null && layer === org.root);
    const key = atWorkspace ? org.root : focus;
    if (seen.current === key) return;
    const was = seen.current;
    seen.current = key;
    if (atWorkspace) setTab("Workspace");
    else if (was === org.root) setTab("Content");
  }, [focus, org, layer]);

  useEffect(() => {
    void from_query(window.location.search)
      .then((found) => { if (found) settle(found); })
      .catch((error: unknown) => setNote(say(error)));
  }, []);

  /** Seat file add/emit with the kit tools so the bar gap stays even. */
  useEffect(() => {
    if (!loaded) {
      setImportMount(null);
      return;
    }
    const bar = document.querySelector(".app > .explorer > .bar");
    if (!bar) return;

    let tools = bar.querySelector(":scope > .tools") as HTMLElement | null;
    let owned = false;
    if (!tools) {
      tools = document.createElement("span");
      tools.className = "tools mm-add-tools";
      bar.insertBefore(tools, bar.firstChild);
      owned = true;
    }
    const host = document.createElement("span");
    host.className = "mm-add-slot";
    tools.insertBefore(host, tools.firstChild);

    setImportMount(host);
    return () => {
      host.remove();
      if (owned) tools.remove();
      setImportMount(null);
    };
  }, [loaded]);

  /** The kit Viewer does not expose lattice; draw one into the viewport. */
  useEffect(() => {
    if (!loaded || !display.lattice) return;
    const root = document.querySelector(".mm-canvas .react-flow__viewport");
    if (!root) return;
    const held = document.createElement("div");
    held.className = "mm-lattice";
    held.setAttribute("aria-hidden", "true");
    root.insertBefore(held, root.firstChild);
    return () => held.remove();
  }, [loaded, display.lattice, layer, org]);

  const settle = (next: Loaded) => {
    stack.current = new Stack();
    setLoaded(next);
    setLayer(TIER_ROOT);
    setPicked([]);
    setNote(next.report?.faults.length ? next.report.faults.join("\n") : summary(next));
  };

  const edit = useCallback((change: Edit) => {
    if (!loaded) return;
    const result = apply(loaded.graph, change);
    if (result.faults.length) { setNote(result.faults.join("\n")); return; }
    stack.current.push(loaded.graph);
    setNote("");
    setLoaded({ ...loaded, graph: result.graph });
  }, [loaded]);

  const undo = useCallback(() => {
    setLoaded((held) => {
      if (!held) return held;
      const back = stack.current.undo(held.graph);
      if (!back) { setNote("Nothing to undo."); return held; }
      setNote("");
      return { ...held, graph: back };
    });
  }, []);

  const redo = useCallback(() => {
    setLoaded((held) => {
      if (!held) return held;
      const next = stack.current.redo(held.graph);
      if (!next) { setNote("Nothing to redo."); return held; }
      setNote("");
      return { ...held, graph: next };
    });
  }, []);

  const drop = async (event: React.DragEvent) => {
    event.preventDefault();
    setOver(false);
    setNote("Reading…");
    try { settle(await from_drop(event.dataTransfer)); }
    catch (error: unknown) { setNote(say(error)); }
  };

  const zip = async () => {
    if (!loaded) return;
    setNote("Emitting…");
    try {
      save(await to_zip(loaded, new Map()), `${named(loaded.name)}.zip`);
      setNote("Emitted.");
    } catch (error: unknown) { setNote(say(error)); }
  };

  /** Kit only descends on gesture kind "box", but a card's face is entirely
   *  label or brim — so capture here and open any node that still has kids. */
  const enter_card = useCallback((event: MouseEvent) => {
    if (!view) return;
    const node = (event.target as Element | null)?.closest?.(".react-flow__node");
    const id = node?.getAttribute("data-id") as Id | null;
    if (!id || id.startsWith("__")) return;
    if (!children(view, id).length) return;
    setLayer(id);
    setPicked([]);
  }, [view]);

  /** Explorer intents: reveal / rename / move / create / delete. */
  const act = useCallback((name: string, args?: Record<string, unknown>) => {
    const graph = loaded?.graph;
    if (!graph || !org) return;
    const id = args?.id === undefined ? null : String(args.id);

    if (name === "reveal" && id) {
      const parent = org.blocks[id]?.parent ?? TIER_ROOT;
      setLayer(parent);
      setPicked([id]);
      return;
    }
    if (name === "rename" && id && typeof args?.name === "string") {
      edit({ do: "rename", id, name: String(args.name) });
      return;
    }
    if (name === "create" && args?.parent && typeof args?.name === "string") {
      edit({
        do: "create",
        parent: String(args.parent),
        name: String(args.name),
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
      const parent = String(args.parent);
      const before = typeof args.before === "string" ? String(args.before) : null;
      const kin = children(graph, parent).map((block) => block.id);
      for (const moveId of args.ids as Id[]) {
        const siblings = kin.filter((each) => each !== moveId && !(args.ids as Id[]).includes(each));
        const at = before ? siblings.indexOf(before) : undefined;
        edit({
          do: "move",
          id: moveId,
          parent,
          ...(at !== undefined && at >= 0 ? { at } : {}),
        });
      }
    }
  }, [edit, loaded?.graph, org]);

  const snapshot = () => {
    if (!loaded) return;
    const name = file_name(loaded.graph.blocks[TIER_ROOT]?.name ?? loaded.graph.blocks[loaded.graph.root]?.name);
    try {
      save(new Blob([write(loaded.graph, name)], { type: "application/json" }), `${name}.json`);
      setNote("Exported.");
    } catch (error: unknown) { setNote(say(error)); }
  };

  const open_file = async (picked: File) => {
    try { settle(from_workspace(await picked.text(), undefined, picked.name)); }
    catch (error: unknown) { setNote(say(error)); }
  };

  const add_content = async (files: boolean) => {
    if (!loaded) return;
    try {
      const sources = await pick_sources(files);
      if (!sources.length) return;
      setNote("Adding…");
      const next = add_sources(loaded, sources);
      stack.current.push(loaded.graph);
      setLoaded(next);
      setNote(next.report?.faults.length ? next.report.faults.join("\n") : summary(next));
    } catch (error: unknown) { setNote(say(error)); }
  };

  const fresh = () => {
    if (!confirm("Start a new workspace? This session is replaced, and it cannot be undone. Export first to keep a copy.")) return;
    stack.current = new Stack();
    setLoaded(null);
    setPicked([]);
    setLayer(TIER_ROOT);
    setTab("Content");
    setNote("Drop a folder of markdown, or a workspace.json.");
  };

  if (!loaded || !org || !view) {
    return (
      <main className={`app blank${over ? " over" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={drop}>
        <p className="mm-status">{note}</p>
      </main>
    );
  }

  const graph = loaded.graph;
  const atRoot = focus === org.root || (focus === null && layer === org.root);
  const focusId = focus
    ?? (atRoot ? org.root : (layer && graph.blocks[layer] ? layer : null));
  const focusBlock = focusId ? graph.blocks[focusId] : undefined;
  const word = atRoot ? "workspace"
    : focusBlock?.type === PAGE ? "page"
    : focusBlock?.type === SET ? "folder"
    : focusBlock?.type === SECTION ? "section"
    : "collection";
  const trayName = focusBlock?.name ?? loaded.name;
  const tabs: TrayTab[] = atRoot
    ? ["Workspace", "Content", "Metadata", "Links"]
    : ["Content", "Metadata", "Links"];
  const blocks = Math.max(0, Object.keys(graph.blocks).length - 1);
  const steps = stack.current.depth + stack.current.forward;

  return (
    <div className={`app${over ? " over" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={drop}>
      <WorkspaceHeader brand="mndmap"
        where={
          <button type="button" className="where" title="Export a snapshot of this workspace."
            onClick={snapshot}>
            {blocks} blocks · {steps} steps
          </button>
        }>
        <button type="button" title="undo" aria-label="Undo" onClick={undo}
          disabled={stack.current.depth === 0}><Icon name="undo" /></button>
        <button type="button" title="redo" aria-label="Redo" onClick={redo}
          disabled={stack.current.forward === 0}><Icon name="redo" /></button>
        <button type="button" title="export the workspace" aria-label="Export"
          onClick={snapshot}><Icon name="export_workspace" /></button>
        <button type="button" title="import a workspace" aria-label="Import"
          onClick={() => file.current?.click()}><Icon name="import_file" /></button>
        <button type="button" title="start a new workspace" aria-label="New workspace"
          onClick={fresh}><Icon name="remove" /></button>
        <button type="button" title={`theme: ${theme} — click for ${nextLook.name}`}
          aria-label={`theme: ${theme}`}
          onClick={() => setTheme(nextLook.name)}>
          <Icon name={look.icon} />
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden
          onChange={(event) => {
            const pickedFile = event.target.files?.[0];
            event.target.value = "";
            if (pickedFile) void open_file(pickedFile);
          }} />
      </WorkspaceHeader>

      {note ? <p className="mm-status chat">{note}</p> : null}

      <Explorer
        graph={org}
        open={explorerLayer}
        picked={picked.filter((id) => org.blocks[id])}
        folded={folded}
        menu={false}
        tools={{ filter: false, fold: false }}
        onAct={act}
        onFold={(id, shut) => setFolded((held) =>
          shut ? [...new Set([...held, id])] : held.filter((each) => each !== id))}
        onPick={setPicked}
      />

      {importMount ? createPortal(
        <>
          <button type="button"
            title="Add a folder of markdown to this project. Shift+click to pick files."
            aria-label="Import files"
            onClick={(event) => void add_content(event.shiftKey)}>
            <FilesIcon />
          </button>
          <button type="button"
            title="emit the collection as a zip"
            aria-label="Emit"
            onClick={() => void zip()}>
            <DownArrowIcon />
          </button>
        </>,
        importMount,
      ) : null}

      <main>
        <div className="mm-canvas" onDoubleClickCapture={enter_card}>
          <Viewer graph={view} layer={layer} picked={picked} chrome={{ crumbs: true }}
            onLook={setLayer} onPick={setPicked} />
          {display.legend ? <Legend graph={view} layer={layer} at={display.corner} /> : null}
        </div>
        <TrayFrame
          open={trayOpen}
          onOpen={setTrayOpen}
          big={trayBig}
          onBig={setTrayBig}
          word={word}
          name={trayName}
          tabs={tabs}
          tab={tabs.includes(tab) ? tab : "Content"}
          onTab={setTab}
        >
          {tab === "Workspace" && atRoot ? (
            <WorkspacePanel graph={graph} root={org.root} display={display}
              onEdit={edit} onDisplay={setDisplay} />
          ) : (
            <Tray graph={graph} org={org} picked={focusId} suggestions={loaded.suggestions}
              tab={tab === "Workspace" ? "Content" : tab} onEdit={edit} />
          )}
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

/** The key to the open layer: one row per kind the drawing actually shows. */
function Legend({ graph, layer, at }: {
  graph: import("@mnd/kit").Graph;
  layer: Id | null;
  at: Display["corner"];
}) {
  const scene = useMemo(() => project(graph, layer), [graph, layer]);
  const kinds = useMemo(() => {
    const counts = new Map<string, { word: string; role?: string; count: number }>();
    for (const node of scene.nodes) {
      if (node.data.marks.includes("cell")) continue;
      const word = node.data.look?.kind ?? node.data.role ?? "block";
      const row = counts.get(word) ?? {
        word,
        ...(node.data.role ? { role: node.data.role } : {}),
        count: 0,
      };
      row.count += 1;
      counts.set(word, row);
    }
    return [...counts.values()].sort((left, right) => left.word.localeCompare(right.word));
  }, [scene]);
  if (!kinds.length) return null;
  return (
    <aside className={`mm-legend ${at}`} aria-label="legend">
      <ul>
        {kinds.map((row) => (
          <li key={row.word} title={`${row.count} on this layer`}>
            <Icon name={icon_for(row.role)} size={12} />
            <span>{row.word}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function icon_for(role: string | undefined): "role_folder" | "role_container" | "role_leaf" {
  if (role === "folder") return "role_folder";
  if (role === "container") return "role_container";
  return "role_leaf";
}

/** Stack of files — offset documents with a dog-ear. */
function FilesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="icon-svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 4h7.5L18 6.5V14H8z" />
      <path d="M15.5 4v2.5H18" />
      <path d="M5 7.5h7.5L15 10v9.5H5z" />
      <path d="M12.5 7.5V10H15" />
    </svg>
  );
}

/** Outline down arrow — emit as files. */
function DownArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="icon-svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 4.5v13" />
      <path d="M7 13l5 5 5-5" />
    </svg>
  );
}

function named(where: string): string {
  return where.split("/").pop()?.replace(/\.json$/i, "") || "collection";
}

function summary(loaded: Loaded): string {
  const report = loaded.report;
  if (!report) return "";
  return `${report.pages} pages, ${report.sections} sections, ${report.relations} relations.`;
}

function say(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

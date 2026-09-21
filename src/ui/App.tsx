/** Three panels over one held graph.
 *
 *  The explorer on the left, the canvas top right, the content tray bottom
 *  right. Every gesture is a data edit on the graph this component holds,
 *  and the stack behind it is the whole of undo. There is no store, no
 *  session and no server. */

import { Explorer, Viewer } from "@mnd/kit/react";
import { children, type Graph, type Id } from "@mnd/kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAGE, SECTION, SET, TIER_ROOT } from "../doc.js";
import { apply, Stack, type Edit } from "../edits.js";
import { suggest } from "../suggest.js";
import { from_drop, from_query, save, to_zip, type Loaded } from "./load.js";
import { Tray } from "./Tray.js";

type ThemeName = "retro" | "modern" | "light";


export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [layer, setLayer] = useState<Id | null>(TIER_ROOT);
  const [picked, setPicked] = useState<Id[]>([]);
  const [folded, setFolded] = useState<Id[]>([]);
  const [note, setNote] = useState("Drop a folder of markdown, or a workspace.json.");
  const [theme, setTheme] = useState<ThemeName>("retro");
  const [over, setOver] = useState(false);
  const stack = useRef(new Stack());

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  /** What the tree lists: sets, pages and sections. A cell, an item and a
   *  fence are content, and content is the tray's. The drawing reads the
   *  same graph whole, so the two never disagree about what is there. */
  const tree = useMemo(() => {
    const graph = loaded?.graph;
    if (!graph) return null;
    const keep = (id: string): boolean => {
      const block = graph.blocks[id];
      if (!block) return false;
      if (block.parent === null) return true;
      return [SET, PAGE, SECTION].includes(block.type ?? "") && keep(block.parent);
    };
    return { ...graph, blocks: Object.fromEntries(Object.entries(graph.blocks).filter(([id]) => keep(id))) };
  }, [loaded?.graph]);

  useEffect(() => {
    void from_query(window.location.search)
      .then((found) => { if (found) settle(found); })
      .catch((error: unknown) => setNote(say(error)));
  }, []);

  const settle = (next: Loaded) => {
    stack.current = new Stack();
    setLoaded(next);
    setLayer(TIER_ROOT);
    setPicked([]);
    setNote(next.report?.faults.length ? next.report.faults.join("\n") : summary(next));
  };

  /** One gesture: the graph it makes, or the fault that stopped it.
   *
   *  The stack is pushed **outside** any state updater. React calls an
   *  updater twice while developing to surface exactly this, and a push in
   *  there lands the same graph on the stack twice — so every second undo
   *  looks like it did nothing. */
  const edit = useCallback((change: Edit) => {
    if (!loaded) return;
    const result = apply(loaded.graph, change);
    if (result.faults.length) { setNote(result.faults.join("\n")); return; }
    stack.current.push(loaded.graph);
    setNote("");
    setLoaded({ ...loaded, graph: result.graph });
  }, [loaded]);

  const undo = useCallback(() => {
    const back = stack.current.pop();
    if (!back) { setNote("Nothing to undo."); return; }
    setLoaded((held) => held && { ...held, graph: back });
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

  const chips = async () => {
    if (!loaded) return;
    if (!loaded.config.suggest.taggly) { setNote("No suggestion endpoint is configured."); return; }
    setNote("Asking…");
    try {
      const found = await suggest(loaded.graph, loaded.config);
      setLoaded({ ...loaded, suggestions: found });
      setNote(`${Object.keys(found).length} things have suggestions.`);
    } catch (error: unknown) { setNote(say(error)); }
  };

  /** The tree's intent, meant as mndmap's own vocabulary: a click reveals,
   *  a double click renames, a drag re-parents. */
  const act = useCallback((name: string, args?: Record<string, unknown>) => {
    const id = args?.id === undefined ? null : String(args.id);
    if (!id) return;
    if (name === "reveal") { setPicked([id]); return; }
    if (name === "rename" && args?.label) { edit({ do: "rename", id, name: String(args.label) }); return; }
    if (name === "move" && args?.parent) {
      edit({ do: "move", id, parent: String(args.parent), ...(typeof args.at === "number" ? { at: args.at } : {}) });
    }
  }, [edit]);

  if (!loaded) {
    return (
      <main className={`app blank${over ? " over" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={drop}>
        <p className="status">{note}</p>
      </main>
    );
  }

  const graph = loaded.graph;
  return (
    <main className={`app${over ? " over" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={drop}>
      <header>
        <span className="brand">mndmap</span>
        <span className="where">{loaded.name}</span>
        <div className="tools">
          <button type="button" onClick={undo} disabled={stack.current.depth === 0}>Undo</button>
          <button type="button" onClick={() => void chips()}>Suggest</button>
          <button type="button" onClick={() => void zip()}>Emit</button>
          <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)} aria-label="Theme">
            <option value="retro">Retro</option>
            <option value="modern">Modern</option>
            <option value="light">Light</option>
          </select>
        </div>
      </header>
      {note ? <p className="status">{note}</p> : null}

      <section className="side">
        <Explorer
          graph={tree ?? graph}
          open={layer}
          picked={picked}
          folded={folded}
          menu={false}
          onAct={act}
          onFold={(id, shut) => setFolded((held) =>
            shut ? [...new Set([...held, id])] : held.filter((each) => each !== id))}
          onPick={setPicked}
        />
      </section>

      <section className="canvas">
        <Viewer graph={graph} layer={layer} picked={picked} onLook={setLayer} onPick={setPicked} />
      </section>

      <section className="content">
        <Tray graph={graph} picked={picked[0] ?? null} suggestions={loaded.suggestions}
          onEdit={edit} onLook={(id) => walk_to(graph, id, setLayer, setPicked)} />
      </section>
    </main>
  );
}


/** Looking at a child means opening it where it holds something, and lighting
 *  it where it does not. */
function walk_to(graph: Graph, id: Id, look: (layer: Id) => void, pick: (ids: Id[]) => void): void {
  if (children(graph, id).length) look(id);
  pick([id]);
}

/** What the zip is called: the workspace's own name, without the path it was
 *  fetched from or the extension it was written with. */
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

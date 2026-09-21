/** Three panels over one held graph.
 *
 *  Explorer and Viewer share the organization projection (sets + pages).
 *  The tray reads the full graph as a document outline. Edits always apply
 *  to the full graph; undo is the stack of graphs behind it. */

import { Explorer, Viewer, WorkspaceHeader, TrayFrame } from "@mnd/kit/react";
import { children, type Id } from "@mnd/kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAGE, SET, TIER_ROOT } from "../doc.js";
import { apply, Stack, type Edit } from "../edits.js";
import { suggest } from "../suggest.js";
import { from_drop, from_query, save, to_zip, type Loaded } from "./load.js";
import { organizationGraph } from "./project.js";
import { Tray, type TrayTab } from "./Tray.js";

type ThemeName = "retro" | "modern" | "light";


export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [layer, setLayer] = useState<Id | null>(TIER_ROOT);
  const [picked, setPicked] = useState<Id[]>([]);
  const [folded, setFolded] = useState<Id[]>([]);
  const [note, setNote] = useState("Drop a folder of markdown, or a workspace.json.");
  const [theme, setTheme] = useState<ThemeName>("retro");
  const [over, setOver] = useState(false);
  const [trayOpen, setTrayOpen] = useState(true);
  const [trayBig, setTrayBig] = useState(false);
  const [tab, setTab] = useState<TrayTab>("Content");
  const stack = useRef(new Stack());

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const org = useMemo(
    () => (loaded?.graph ? organizationGraph(loaded.graph) : null),
    [loaded?.graph],
  );

  /** Selection must name organization ids visible on the projection. */
  useEffect(() => {
    if (!org) return;
    if (layer && !org.blocks[layer]) setLayer(TIER_ROOT);
    setPicked((held) => {
      const next = held.filter((id) => org.blocks[id]);
      return next.length === held.length ? held : next;
    });
  }, [org, layer]);

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

  /** Explorer intents: reveal / rename.name / move.ids+before. */
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
    // create / delete / filter / shelve — ignored
  }, [edit, loaded?.graph, org]);

  if (!loaded || !org) {
    return (
      <main className={`app blank${over ? " over" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={drop}>
        <p className="mm-status">{note}</p>
      </main>
    );
  }

  const graph = loaded.graph;
  const focus = picked[0] ?? null;
  const focusBlock = focus ? graph.blocks[focus] : undefined;
  const word = focusBlock?.type === PAGE ? "page"
    : focusBlock?.type === SET ? "folder"
    : "collection";
  const trayName = focusBlock?.name ?? loaded.name;

  return (
    <div className={`app${over ? " over" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={drop}>
      <WorkspaceHeader brand="mndmap"
        where={<span className="where">{loaded.name}</span>}>
        <button type="button" onClick={undo} disabled={stack.current.depth === 0}>Undo</button>
        <button type="button" onClick={() => void chips()}>Suggest</button>
        <button type="button" onClick={() => void zip()}>Emit</button>
        <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)}
                aria-label="Theme">
          <option value="retro">Retro</option>
          <option value="modern">Modern</option>
          <option value="light">Light</option>
        </select>
      </WorkspaceHeader>

      {note ? <p className="mm-status chat">{note}</p> : null}

      <Explorer
        graph={org}
        open={layer}
        picked={picked}
        folded={folded}
        menu={false}
        tools={{ create: false, remove: false, filter: false }}
        onAct={act}
        onFold={(id, shut) => setFolded((held) =>
          shut ? [...new Set([...held, id])] : held.filter((each) => each !== id))}
        onPick={setPicked}
      />

      <main>
        <Viewer graph={org} layer={layer} picked={picked} chrome={{ crumbs: true }}
          onLook={setLayer} onPick={setPicked} />
        <TrayFrame
          open={trayOpen}
          onOpen={setTrayOpen}
          big={trayBig}
          onBig={setTrayBig}
          word={word}
          name={trayName}
          tabs={["Content", "Metadata", "Links"]}
          tab={tab}
          onTab={(next) => setTab(next as TrayTab)}
        >
          <Tray graph={graph} org={org} picked={focus} suggestions={loaded.suggestions}
            tab={tab} onEdit={edit} />
        </TrayFrame>
      </main>
    </div>
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

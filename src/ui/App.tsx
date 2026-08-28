import { Explorer, Viewer } from "@mnd/kit/react";
import type { Graph } from "@mnd/kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEditorApi, type EditorApi } from "./api.js";
import { ContentPanel } from "./ContentPanel.js";
import { DiagnosticsDialog } from "./DiagnosticsDialog.js";
import { formatDiagnosticsForDisplay } from "./format-diagnostics.js";
import type { Diagnostic, OrganizationSnapshot, SegmentView } from "../types.js";
import { TIER_ROOT_ID } from "../vocab/docs.js";

type PanelMode = "content" | "diagram";
type ThemeName = "retro" | "modern" | "light";

export function App({ api }: { api?: EditorApi } = {}) {
  /** Lazily, and once. A default parameter builds a new client on **every**
   *  render, which every hook below then treats as a new dependency — the
   *  effect re-imports, the state changes, and the render loops forever. */
  const held = useRef<EditorApi | null>(null);
  held.current ??= api ?? createEditorApi();
  const editor = held.current;

  const [graph, setGraph] = useState<Graph | null>(null);
  const [organization, setOrganization] = useState<OrganizationSnapshot | null>(null);
  const [layer, setLayer] = useState<string | null>(TIER_ROOT_ID);
  const [picked, setPicked] = useState<string[]>([]);
  const [folded, setFolded] = useState<string[]>([]);
  const [panel, setPanel] = useState<PanelMode>("content");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [segments, setSegments] = useState<SegmentView[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [feedback, setFeedback] = useState("Loading…");
  const [reloads, setReloads] = useState(0);
  const [theme, setTheme] = useState<ThemeName>("retro");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const refresh = useCallback(async () => {
    const nextGraph = await editor.graph() as Graph;
    const nextOrganization = await editor.organization();
    const nextDiagnostics = await editor.diagnostics();
    setGraph(nextGraph);
    setOrganization(nextOrganization);
    setDiagnostics(nextDiagnostics);
    setLayer((current) => current && nextGraph.blocks[current] ? current : TIER_ROOT_ID);
    setFeedback("");
    setReloads((n) => n + 1);
  }, [editor]);

  useEffect(() => {
    void (async () => {
      try {
        await editor.import();
        await refresh();
        const initialDiagnostics = await editor.diagnostics();
        if (initialDiagnostics.length > 0) setDiagnosticsOpen(true);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [editor, refresh]);

  /** The open page's content, reloaded when the page changes and again
   *  whenever the workspace has been rebuilt under it. */
  useEffect(() => {
    if (!selectedPageId) { setSegments([]); return; }
    let live = true;
    void (async () => {
      const next = await editor.pageSegments(selectedPageId);
      if (live) setSegments(next);
    })();
    return () => { live = false; };
  }, [editor, selectedPageId, reloads]);

  const onAct = useCallback(async (name: string, args?: Record<string, unknown>) => {
    /** A click reveals: the layer holding the block, with the block picked
     *  there. Selecting a page is what opens its content. */
    if (name === "reveal" && args?.id) {
      const id = String(args.id);
      setLayer(graph?.blocks[id]?.parent ?? TIER_ROOT_ID);
      setPicked([id]);
      const pageNode = organization?.nodes.find((node) => node.id === id && node.kind === "page");
      setSelectedPageId(pageNode?.id ?? null);
      return;
    }
    if (name === "rename" && args?.id && args?.label) {
      try {
        await editor.renameOrganization({ id: String(args.id), title: String(args.label) });
        await refresh();
        setFeedback("Renamed.");
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (name === "move" && args?.id && args?.parent) {
      try {
        await editor.moveOrganization({ id: String(args.id), parentId: String(args.parent) });
        await refresh();
        setFeedback("Organization updated.");
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : String(error));
      }
    }
  }, [editor, graph, organization?.nodes, refresh]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      await refresh();
      setFeedback(success);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    }
  };

  const diagnosticsText = useMemo(() => formatDiagnosticsForDisplay(diagnostics), [diagnostics]);

  /** What the Explorer lists: the document tree, and nothing below a page. The
   *  diagram draws the same graph whole, so the two never disagree about what
   *  is there — only about how far down they read. */
  const tree = useMemo(() => {
    if (!graph) return null;
    const blocks = Object.fromEntries(
      Object.entries(graph.blocks).filter(([, block]) => block.type !== "doc.section"));
    return { ...graph, blocks };
  }, [graph]);

  const moveSegment = async (sourceNodeId: string, position: number) => {
    if (!selectedPageId) return;
    await run(
      () => editor.moveSegment({ sourceNodeId, pageOrganizationId: selectedPageId, position }),
      "Segment order updated.",
    );
  };

  const removeSegment = async (sourceNodeId: string) => {
    if (!selectedPageId) return;
    await run(
      () => editor.removeSegment({ pageOrganizationId: selectedPageId, sourceNodeId }),
      "Segment removed from page.",
    );
  };

  if (!graph) return <main className="app"><p className="status">{feedback || "Loading graph…"}</p></main>;

  return (
    <main className="app">
      <header>
        <span className="brand">mndmap</span>
        <div className="tools">
          <button type="button" className={panel === "content" ? "active" : ""} onClick={() => setPanel("content")}>Content</button>
          <button type="button" className={panel === "diagram" ? "active" : ""} onClick={() => setPanel("diagram")}>Diagram</button>
          <button type="button" onClick={() => void run(() => editor.rescan(), "Rescan complete.")}>Rescan</button>
          <button type="button" onClick={() => void run(() => editor.exportPreview(), "Export preview ready.")}>Preview</button>
          <button type="button" onClick={() => void run(() => editor.export(), "Destination exported.")}>Export</button>
          <button type="button" onClick={() => setDiagnosticsOpen(true)}>Diagnostics</button>
          <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)} aria-label="Theme">
            <option value="retro">Retro</option>
            <option value="modern">Modern</option>
            <option value="light">Light</option>
          </select>
        </div>
      </header>
      {feedback ? <p className="status">{feedback}</p> : null}
      <DiagnosticsDialog open={diagnosticsOpen} text={diagnosticsText} onClose={() => setDiagnosticsOpen(false)} />
      <section className="explorer">
        <Explorer
          graph={tree ?? graph}
          open={layer}
          picked={picked}
          folded={folded}
          menu={false}
          onAct={onAct}
          onFold={(id, shut) => setFolded((current) => shut ? [...new Set([...current, id])] : current.filter((entry) => entry !== id))}
          onPick={setPicked}
        />
      </section>
      <section className="main">
        {panel === "content" ? (
          <ContentPanel segments={segments} onMove={moveSegment} onRemove={removeSegment} />
        ) : (
          <Viewer graph={graph} layer={layer} picked={picked} onLook={setLayer} onPick={setPicked} />
        )}
      </section>
    </main>
  );
}

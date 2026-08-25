import { Explorer, Viewer } from "@mnd/kit/react";
import type { Graph } from "@mnd/kit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createEditorApi, type EditorApi } from "./api.js";
import "@mnd/kit/react.css";
import "./styles.css";

export function App({ api = createEditorApi() }: { api?: EditorApi }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [layer, setLayer] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [folded, setFolded] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<string>("");
  const [feedback, setFeedback] = useState("Loading…");

  const refresh = useCallback(async () => {
    try {
      const nextGraph = await api.graph() as Graph;
      setGraph(nextGraph);
      setLayer((current) => current && nextGraph.blocks[current] ? current : "block_docs");
      const nextDiagnostics = await api.diagnostics();
      setDiagnostics(nextDiagnostics.filter((entry) => entry.severity === "error").map((entry) => entry.message).join("\n"));
      setFeedback("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    }
  }, [api]);

  useEffect(() => {
    void (async () => {
      try {
        await api.import();
        await refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [api, refresh]);

  const onAct = useCallback(async (name: string, args?: Record<string, unknown>) => {
    if (name !== "move" || !args?.id || !args?.parent) return;
    try {
      await api.moveOrganization({ id: String(args.id), parentId: String(args.parent) });
      await refresh();
      setFeedback("Organization updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    }
  }, [api, refresh]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      await refresh();
      setFeedback(success);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    }
  };

  if (!graph) return <main className="app"><p>{feedback || "Loading graph…"}</p></main>;

  return (
    <main className="app">
      <header className="toolbar">
        <strong>mndmap</strong>
        <button type="button" onClick={() => void run(() => api.rescan(), "Rescan complete.")}>Rescan</button>
        <button type="button" onClick={() => void run(() => api.emitPreview(), "Emit preview ready.")}>Preview emit</button>
        <button type="button" onClick={() => void run(() => api.emit(), "Site emitted.")}>Emit</button>
      </header>
      {feedback ? <p className="feedback">{feedback}</p> : null}
      {diagnostics ? <pre className="diagnostics">{diagnostics}</pre> : null}
      <section className="workspace">
        <div className="panel">
          <Explorer
            graph={graph}
            open={layer}
            picked={picked}
            folded={folded}
            menu={false}
            onAct={onAct}
            onFold={(id, shut) => setFolded((current) => shut ? [...new Set([...current, id])] : current.filter((entry) => entry !== id))}
            onPick={setPicked}
          />
        </div>
        <div className="panel viewer">
          <Viewer graph={graph} layer={layer} onLook={setLayer} />
        </div>
      </section>
    </main>
  );
}

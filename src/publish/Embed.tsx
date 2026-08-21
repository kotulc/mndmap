import { useEffect, useMemo, useState } from "react";
import type { Graph } from "../mndflow/adapter.js";
import { layoutGraph } from "./layout.js";

export function PublicationEmbed({ graphUrl = "./graph.json" }: { graphUrl?: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(graphUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load graph (${response.status})`);
      return response.json() as Promise<Graph>;
    }).then((value) => {
      if (!active) return;
      setGraph(value);
      setSelectedId(value.elements[0]?.id ?? "");
    }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { active = false; };
  }, [graphUrl]);

  const layout = useMemo(() => graph ? layoutGraph(graph) : null, [graph]);
  const selected = graph?.elements.find((element) => element.id === selectedId);
  if (error) return <main className="message" role="alert">{error}</main>;
  if (!graph || !layout) return <main className="message">Loading graph…</main>;

  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  return (
    <main className="embed">
      <header><div><small>read-only graph</small><h1>{graph.id}</h1></div><span>{graph.elements.length} records</span></header>
      <section className="canvas">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label={`${graph.id} graph`}>
          <g className="edges">{graph.edges.map((edge) => {
            const source = nodes.get(edge.source);
            const target = nodes.get(edge.target);
            if (!source || !target) return null;
            const x1 = source.x + 110;
            const y1 = source.y + 64;
            const x2 = target.x + 110;
            return <path key={edge.id} d={`M ${x1} ${y1} C ${x1} ${y1 + 28}, ${x2} ${target.y - 28}, ${x2} ${target.y}`} />;
          })}</g>
          <g>{layout.nodes.map((node) => (
            <g key={node.id} role="button" tabIndex={0} aria-label={node.label}
              className={`node ${node.claimed ? "claimed" : ""} ${node.staged ? "staged" : ""} ${node.id === selectedId ? "selected" : ""}`}
              transform={`translate(${node.x} ${node.y})`} onClick={() => setSelectedId(node.id)}
              onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setSelectedId(node.id)}>
              <rect width="220" height="64" rx="5" /><text x="14" y="27">{truncate(node.label, 30)}</text>
              <text className="id" x="14" y="46">{truncate(node.id, 34)}</text>
            </g>
          ))}</g>
        </svg>
      </section>
      <aside>
        {selected && <><h2>{selected.label}</h2><dl>
          {Object.entries(selected.data.values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{renderValue(value)}</dd></div>)}
        </dl><p>{selected.data.claimed ? "Claimed" : "Unclaimed"}{selected.data.staged ? " · staged" : ""}</p></>}
      </aside>
    </main>
  );
}

function renderValue(value: unknown): string {
  return Array.isArray(value) ? value.map(renderValue).join(", ") : value == null ? "—" : String(value);
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

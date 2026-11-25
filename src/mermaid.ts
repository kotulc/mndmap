/** Mermaid flowcharts read with Mermaid's own parser, as a plain graph to draw: nodes, edges and
 *  subgraphs. The parser wants a browser, so it runs in a jsdom window, loaded once on first use.
 *  A node links to a page with Mermaid's own `click A "path"` line. */

import { JSDOM } from "jsdom";


/** A node: its text lines, its Mermaid shape, and the reference its `click` names. */
export type FlowNode = { id: string; lines: string[]; shape: string; ref?: string; tip?: string };

/** An edge and how it is drawn. */
export type FlowEdge = {
  from: string; to: string; label: string; stroke: "normal" | "thick" | "dotted" | "invisible";
  head: boolean; tail: boolean;
};

/** A subgraph: its title, its member ids (nodes and subgraphs). */
export type Cluster = { id: string; title: string; members: string[] };

/** A whole flowchart. */
export type Flow = {
  dir: "LR" | "RL" | "TB" | "BT"; title: string;
  nodes: FlowNode[]; edges: FlowEdge[]; clusters: Cluster[];
};

/** The slice of Mermaid's API this reads. */
type Mermaid = {
  initialize: (config: object) => void;
  parse: (text: string, options: object) => Promise<{ diagramType: string } | false>;
  mermaidAPI: { getDiagramFromText: (text: string) => Promise<{ db: FlowDb }> };
};

/** The slice of Mermaid's flowchart database this reads. */
type FlowDb = {
  getVertices: () => Map<string, Vertex> | Record<string, Vertex>;
  getEdges: () => { start: string; end: string; type?: string; stroke?: string; text?: string }[];
  getSubGraphs: () => { id: string; title: string; nodes: string[] }[];
  getDirection: () => string;
  getDiagramTitle?: () => string;
  getTooltip?: (id: string) => string | undefined;
};

type Vertex = { id: string; text?: string; type?: string; link?: string };

let loaded: Promise<Mermaid> | undefined;


/** Mermaid, initialised in a jsdom window the first time it is asked for. */
function mermaid(): Promise<Mermaid> {
  loaded ??= (async () => {
    const { window } = new JSDOM("");
    Object.assign(globalThis, { window, document: window.document });
    const { default: api } = await import("mermaid") as unknown as { default: Mermaid };
    api.initialize({ startOnLoad: false, securityLevel: "loose" });
    return api;
  })();
  return loaded;
}

/** A label's text as lines: breaks kept, markup and markdown emphasis dropped. */
function lines(text: string): string[] {
  return text.split(/<br\s*\/?>|\n/i).map((l) => l.replace(/<[^>]+>/g, "").replace(/[`*_]/g, "")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim())
    .filter(Boolean);
}

/** What kind of Mermaid diagram the text is, or nothing when it does not parse. */
export async function kind(text: string): Promise<string | undefined> {
  const parsed = await (await mermaid()).parse(text, { suppressErrors: true });
  return parsed ? parsed.diagramType : undefined;
}

/** A flowchart's text read into a graph. */
export async function flow(text: string): Promise<Flow> {
  const { db } = await (await mermaid()).mermaidAPI.getDiagramFromText(text);
  const raw = db.getVertices();
  const vertices = raw instanceof Map ? [...raw.values()] : Object.values(raw);
  const dir = db.getDirection().replace("TD", "TB");
  return {
    dir: (["LR", "RL", "TB", "BT"].includes(dir) ? dir : "TB") as Flow["dir"],
    title: db.getDiagramTitle?.() ?? "",
    nodes: vertices.map((v) => ({
      id: v.id, lines: lines(v.text ?? v.id), shape: v.type ?? "square",
      ...(v.link ? { ref: v.link } : {}),
      ...(db.getTooltip?.(v.id) ? { tip: db.getTooltip(v.id) } : {}),
    })),
    edges: db.getEdges().map((e) => ({
      from: e.start, to: e.end, label: lines(e.text ?? "").join(" "),
      stroke: (e.stroke ?? "normal") as FlowEdge["stroke"],
      head: !(e.type ?? "arrow_point").includes("open"),
      tail: (e.type ?? "").startsWith("double"),
    })),
    clusters: db.getSubGraphs().map((s) => ({ id: s.id, title: lines(s.title).join(" "), members: s.nodes })),
  };
}

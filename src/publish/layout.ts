import type { Graph } from "../mndflow/adapter.js";

export interface PositionedElement {
  id: string;
  label: string;
  x: number;
  y: number;
  claimed: boolean;
  staged: boolean;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: PositionedElement[];
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;
const GAP_X = 56;
const GAP_Y = 56;
const PADDING = 32;
const COLUMNS = 3;

export function layoutGraph(graph: Graph): GraphLayout {
  const columns = Math.max(1, Math.min(COLUMNS, graph.elements.length));
  const rows = Math.max(1, Math.ceil(graph.elements.length / columns));
  return {
    width: PADDING * 2 + columns * NODE_WIDTH + (columns - 1) * GAP_X,
    height: PADDING * 2 + rows * NODE_HEIGHT + (rows - 1) * GAP_Y,
    nodes: graph.elements.map((element, index) => ({
      id: element.id,
      label: element.label,
      x: PADDING + (index % columns) * (NODE_WIDTH + GAP_X),
      y: PADDING + Math.floor(index / columns) * (NODE_HEIGHT + GAP_Y),
      claimed: element.data.claimed,
      staged: element.data.staged,
    })),
  };
}

export function renderGraphSvg(graph: Graph): string {
  const layout = layoutGraph(graph);
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) return "";
    const x1 = source.x + NODE_WIDTH / 2;
    const y1 = source.y + NODE_HEIGHT;
    const x2 = target.x + NODE_WIDTH / 2;
    const y2 = target.y;
    return `<path d="M ${x1} ${y1} C ${x1} ${y1 + 28}, ${x2} ${y2 - 28}, ${x2} ${y2}" />`;
  }).join("");
  const elements = layout.nodes.map((node) => {
    const classes = ["node", node.claimed ? "claimed" : "", node.staged ? "staged" : ""].filter(Boolean).join(" ");
    return `<g class="${classes}" transform="translate(${node.x} ${node.y})"><rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="5" /><text x="14" y="27">${escapeXml(truncate(node.label, 30))}</text><text class="id" x="14" y="46">${escapeXml(truncate(node.id, 34))}</text></g>`;
  }).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}">`,
    `<title id="title">${escapeXml(graph.id)} graph</title>`,
    "<style>svg{background:#10141b;color:#d8dee9;font:13px Inter,system-ui,sans-serif}.edges path{fill:none;stroke:#4a586b;stroke-width:1.5}.node rect{fill:#1b212b;stroke:#3a4655}.node.claimed rect{stroke:#c792ea;stroke-width:3}.node.staged rect{stroke:#e5b567;stroke-width:3}.node text{fill:currentColor}.node .id{fill:#8994a4;font-size:10px}</style>",
    `<g class="edges">${edges}</g><g class="nodes">${elements}</g></svg>\n`,
  ].join("");
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;",
  })[character]!);
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

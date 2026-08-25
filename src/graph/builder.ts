import { base_graph, ROOT, review, validate, type Block, type Graph, type Relation } from "@mnd/kit";
import { edgeIdFromInternal } from "../fingerprints.js";
import { pageRoute, sectionAnchor, slugifySegment, sourceLink } from "../routes.js";
import type { MndmapConfig, OrganizationNode, SourceNode, WorkingStoreSnapshot } from "../types.js";
import { DOC_VOCABULARY, TIER_ROOT_ID } from "../vocab/docs.js";

const TYPE_BY_KIND: Record<string, string> = {
  folder: "doc.set",
  page: "doc.page",
  section: "doc.section",
  table: "doc.table",
  row: "doc.row",
  list: "doc.item",
  item: "doc.item",
  term: "doc.term",
  link: "doc.link",
};

export function buildGraph(snapshot: WorkingStoreSnapshot): { graph: Graph; tierRootId: string; notes: ReturnType<typeof review> } {
  const graph = base_graph();
  for (const definition of DOC_VOCABULARY) graph.defs[definition.id] = definition;

  const tierRoot: Block = {
    id: TIER_ROOT_ID,
    parent: ROOT,
    type: "doc.set",
    label: "docs",
    num: 1,
  };
  graph.blocks[TIER_ROOT_ID] = tierRoot;

  const sourceById = new Map(snapshot.sourceNodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string | null, OrganizationNode[]>();
  for (const node of snapshot.organization.nodes) {
    const bucket = childrenByParent.get(node.parentId) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parentId, bucket);
  }
  for (const bucket of childrenByParent.values()) bucket.sort((left, right) => left.position - right.position);

  const emitPathByOrg = new Map<string, string>();
  const walk = (node: OrganizationNode, prefix: string): void => {
    const segment = node.outputSlug ?? slugifySegment(node.title);
    const path = node.parentId === null ? "" : `${prefix}/${segment}`.replace(/^\//, "");
    emitPathByOrg.set(node.id, path);

    if (node.kind === "group") {
      const block = orgBlock(node, "doc.set", path || "docs", snapshot.config);
      graph.blocks[block.id] = block;
      for (const child of childrenByParent.get(node.id) ?? []) walk(child, path);
      return;
    }

    const source = node.sourceNodeId ? sourceById.get(node.sourceNodeId) : undefined;
    if (!source) return;
    const block = sourceBlock(node, source, path, snapshot.config, emitPathByOrg);
    graph.blocks[block.id] = block;

    for (const child of childrenByParent.get(node.id) ?? []) {
      walk(child, source.kind === "page" || source.kind === "folder" ? path : prefix);
    }
  };

  const root = snapshot.organization.nodes.find((node) => node.id === snapshot.organization.rootId);
  if (root) walk(root, "");

  const notes = review(graph, TIER_ROOT_ID);
  return { graph, tierRootId: TIER_ROOT_ID, notes };
}

export function checkVocabulary(snapshot: WorkingStoreSnapshot): { faults: ReturnType<typeof validate>; notes: ReturnType<typeof review> } {
  const { graph } = buildGraph(snapshot);
  return { faults: validate(graph), notes: review(graph, TIER_ROOT_ID) };
}

function orgBlock(node: OrganizationNode, type: string, path: string, _config: MndmapConfig): Block {
  return {
    id: node.id,
    parent: node.parentId ?? TIER_ROOT_ID,
    type,
    label: node.title,
    num: node.position + 1,
    fields: [
      { name: "path", form: "text", value: pageRoute(`${path}/index.md`) },
      { name: "title", form: "text", value: node.title },
      { name: "source", form: "link", value: sourceLink(`${path}/index.md`) },
    ],
  };
}

function sourceBlock(
  node: OrganizationNode,
  source: SourceNode,
  path: string,
  config: MndmapConfig,
  emitPathByOrg: Map<string, string>,
): Block {
  const type = TYPE_BY_KIND[source.kind] ?? "doc.section";
  const blockId = node.id;
  const parentId = node.parentId ?? TIER_ROOT_ID;
  const extension = String(source.sourceData.extension ?? ".md");
  const emitPath = source.kind === "page" ? `${path}${extension}` : `${path}${extension}`;
  const heading = String(source.sourceData.title ?? node.title);
  const fields = [
    ...(source.kind === "page" ? [
      { name: "path", form: "text" as const, value: pageRoute(emitPath) },
      { name: "title", form: "text" as const, value: heading },
    ] : []),
    ...(source.kind === "section" ? [
      { name: "heading", form: "text" as const, value: heading },
      { name: "depth", form: "number" as const, value: String(source.sourceData.depth ?? 1) },
    ] : []),
    { name: "source", form: "link" as const, value: sourceLink(emitPath, source.kind === "section" ? heading : undefined) },
  ];

  return {
    id: blockId,
    parent: parentId,
    type,
    label: heading,
    num: node.position + 1,
    fields,
  };
}

export function graphFile(snapshot: WorkingStoreSnapshot, workspaceId = "mndmap"): string {
  const { graph } = buildGraph(snapshot);
  return JSON.stringify({ schema: "2.0", id: workspaceId, graph }, null, 2);
}

export function deterministicOrdering(graph: Graph): Graph {
  const blocks = Object.fromEntries(Object.entries(graph.blocks).sort(([left], [right]) => left.localeCompare(right)));
  const edges = Object.fromEntries(Object.entries(graph.edges).sort(([left], [right]) => left.localeCompare(right)));
  const defs = Object.fromEntries(Object.entries(graph.defs).sort(([left], [right]) => left.localeCompare(right)));
  return { ...graph, blocks, edges, defs };
}

export function addContainsEdges(graph: Graph): Graph {
  const edges = { ...graph.edges };
  for (const block of Object.values(graph.blocks)) {
    if (!block.parent || block.parent === ROOT) continue;
    const id = edgeIdFromInternal(block.parent, block.id);
    const relation: Relation = {
      id,
      from: block.parent,
      to: block.id,
      module: "directed",
      type: "doc.link",
      fields: [{ name: "kind", form: "text", value: "contains" }],
    };
    edges[id] = relation;
  }
  return { ...graph, edges };
}

import { base_graph, ROOT, review, validate, write, type Block, type Graph, type Relation } from "@mnd/kit";
import { edgeIdFromInternal } from "../fingerprints.js";
import { childSegments, segmentsForPage } from "../segments.js";
import { pageRoute, slugifySegment, sourceLink } from "../routes.js";
import type { MndmapConfig, OrganizationNode, SourceNode, WorkingStoreSnapshot } from "../types.js";
import { DOC_VOCABULARY, TIER_ROOT_ID, tierRootLabel } from "../vocab/docs.js";

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
    label: tierRootLabel(snapshot.config),
    num: 1,
    arrangement: "down",
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

  const walk = (node: OrganizationNode, prefix: string, owningPage?: string): void => {
    const segment = node.outputSlug ?? slugifySegment(node.title);
    const path = node.parentId === null ? "" : `${prefix}/${segment}`.replace(/^\//, "");

    if (node.kind === "group") {
      const block = orgBlock(node, "doc.set", path, snapshot.config);
      graph.blocks[block.id] = block;
      const landingPath = `${path ? `${path}/` : ""}index.md`;
      for (const child of childrenByParent.get(node.id) ?? []) walk(child, path, landingPath);
      return;
    }

    if (node.kind === "folder") {
      const block = orgBlock(node, "doc.set", path || tierRootLabel(snapshot.config), snapshot.config);
      graph.blocks[block.id] = block;
      for (const child of childrenByParent.get(node.id) ?? []) walk(child, path, owningPage);
      return;
    }

    if (node.kind === "page") {
      const source = node.sourceNodeId ? sourceById.get(node.sourceNodeId) : undefined;
      if (!source) return;
      const extension = String(source.sourceData.extension ?? ".md");
      const pagePath = `${path}${extension}`.replace(/^\//, "");
      const block = pageBlock(node, source, pagePath, snapshot.config);
      graph.blocks[block.id] = block;
      addSegmentBlocks(graph, node.id, pagePath, snapshot, block.id);
      return;
    }
  };

  const root = snapshot.organization.nodes.find((node) => node.id === snapshot.organization.rootId);
  if (root) {
    walk(root, "");
    delete graph.blocks[root.id];
    for (const [id, child] of Object.entries(graph.blocks)) {
      if (child.parent === root.id) graph.blocks[id] = { ...child, parent: TIER_ROOT_ID };
    }
  }

  const notes = review(graph, TIER_ROOT_ID);
  return { graph, tierRootId: TIER_ROOT_ID, notes };
}

function addSegmentBlocks(
  graph: Graph,
  pageOrganizationId: string,
  pagePath: string,
  snapshot: WorkingStoreSnapshot,
  pageBlockId: string,
): void {
  const sourceById = new Map(snapshot.sourceNodes.map((node) => [node.id, node]));
  const rows = segmentsForPage(pageOrganizationId, snapshot.segmentPlacements, snapshot.segmentOverrides);

  const walkSegments = (parentSegmentId: string | null, parentBlockId: string, depth: number): void => {
    for (const row of childSegments(rows, parentSegmentId)) {
      const source = sourceById.get(row.sourceNodeId);
      if (!source || source.kind !== "section") continue;
      const placement = snapshot.segmentPlacements.find((entry) =>
        entry.pageOrganizationId === pageOrganizationId && entry.sourceNodeId === row.sourceNodeId)!;
      const blockId = stableSegmentBlockId(placement.id);
      const heading = String(source.sourceData.title ?? "");
      graph.blocks[blockId] = {
        id: blockId,
        parent: parentBlockId,
        type: "doc.section",
        label: heading,
        num: row.position + 1,
        arrangement: "down",
        fields: [
          { name: "heading", form: "text", value: heading },
          { name: "depth", form: "number", value: String(source.sourceData.depth ?? depth) },
          { name: "source", form: "link", value: sourceLink(pagePath, heading) },
        ],
      };
      walkSegments(placement.id, blockId, depth + 1);
    }
  };

  walkSegments(null, pageBlockId, 1);
}

function stableSegmentBlockId(placementId: string): string {
  return placementId.startsWith("seg:") ? placementId : `seg:${placementId}`;
}

export function checkVocabulary(snapshot: WorkingStoreSnapshot): { faults: ReturnType<typeof validate>; notes: ReturnType<typeof review> } {
  const { graph } = buildGraph(snapshot);
  return { faults: validate(graph), notes: review(graph, TIER_ROOT_ID) };
}

function orgBlock(node: OrganizationNode, type: string, path: string, config: MndmapConfig): Block {
  const landing = path ? `${path}/index.md` : "index.md";
  return {
    id: node.id,
    parent: node.parentId ?? TIER_ROOT_ID,
    type,
    label: node.title,
    num: node.position + 1,
    arrangement: "down",
    fields: [
      { name: "path", form: "text", value: pageRoute(landing) },
      { name: "title", form: "text", value: node.title },
      { name: "source", form: "link", value: sourceLink(landing) },
    ],
  };
}

function pageBlock(
  node: OrganizationNode,
  source: SourceNode,
  emitPath: string,
  _config: MndmapConfig,
): Block {
  const heading = String(source.sourceData.title ?? node.title);
  return {
    id: node.id,
    parent: node.parentId ?? TIER_ROOT_ID,
    type: "doc.page",
    label: heading,
    num: node.position + 1,
    arrangement: "down",
    fields: [
      { name: "path", form: "text", value: pageRoute(emitPath) },
      { name: "title", form: "text", value: heading },
      { name: "source", form: "link", value: sourceLink(emitPath) },
    ],
  };
}

export function graphFile(snapshot: WorkingStoreSnapshot, workspaceId = "mndmap"): string {
  const { graph } = buildGraph(snapshot);
  return write(deterministicOrdering(graph), workspaceId).trimEnd();
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

export function projectLayer(snapshot: WorkingStoreSnapshot, layerId: string) {
  const { graph } = buildGraph(snapshot);
  const drawable = addContainsEdges(graph);
  const orgNode = snapshot.organization.nodes.find((node) => node.id === layerId);
  const depth = orgNode?.diagramDepth ?? snapshot.config.diagrams.depth;
  const layer = layerId === snapshot.organization.rootId ? TIER_ROOT_ID : layerId;
  return { graph: drawable, layer, depth };
}

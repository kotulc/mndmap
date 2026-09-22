/** UI projections over the full translated graph.
 *
 *  {@link viewingGraph} is the one tree both Explorer and Viewer read: sets,
 *  pages, and each page's document as a lattice of blocks. Free and grid stay
 *  the only arrangements — a row or column is `x`/`y` on a free layer; a
 *  markdown table stays a grid holder. Body, prose, and stand-in blocks exist
 *  only in the projection. {@link organizationGraph} stays sets and pages for
 *  the workspace root check. Neither projection mutates the held graph. */

import { at_cell, children, is_holder, type Block, type Graph, type Id } from "@mnd/kit";
import {
  CODE, DONE, ITEM, LANG, LEVEL, LINK, PAGE, SECTION, SET, TIER_ROOT,
  field, type Holder,
} from "../doc.js";
import { KEY } from "../read.js";

type Edge = Graph["edges"][string];

/** Fields that choose a construct, not something the tray lists as metadata. */
const MACHINE = new Set([LEVEL, LANG, DONE, KEY, "title"]);

/** Lattice step used to seat a page's blocks on the canvas. */
const UNIT = 24;
const CARD = { w: 5 * UNIT, h: 2 * UNIT };
const GAP = UNIT;
const CELL = { w: CARD.w + GAP * 2, h: CARD.h + GAP * 2 };
const STRIDE_X = CARD.w + GAP;
const STRIDE_Y = CARD.h + GAP;

/** Heading depths drawn as their own section blocks (`#` … `###`). */
export const SECTION_DEPTH = 3;

const REQUIREMENT = "req.requirement";

export type OutlineRow =
  | { kind: "section"; id: Id; depth: number; title: string; level?: number }
  | { kind: "prose"; id: Id; depth: number; markdown: string }
  | { kind: "table"; id: Id; depth: number; headers: string[]; rows: string[][] }
  | { kind: "list"; id: Id; depth: number; items: { id: Id; text: string; done?: boolean }[] }
  | { kind: "code"; id: Id; depth: number; language?: string; text: string }
  | { kind: "record"; id: Id; depth: number; label: string; fields: { name: string; value: string }[] };

/** Sets and pages only, re-rooted at the collection root, with no edges. */
export function organizationGraph(graph: Graph): Graph {
  const kept = new Set<Id>();
  const root = graph.blocks[TIER_ROOT];
  if (root?.type === SET) kept.add(TIER_ROOT);

  const seen = new Set<Id>();
  const visit = (id: Id): void => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const child of children(graph, id)) {
      if (child.type === SET || child.type === PAGE) kept.add(child.id);
      visit(child.id);
    }
  };
  if (graph.blocks[TIER_ROOT]) visit(TIER_ROOT);

  const nearest = (id: Id): Id | null => {
    let at = graph.blocks[id]?.parent ?? null;
    const walk = new Set<Id>();
    while (at && !walk.has(at)) {
      walk.add(at);
      if (kept.has(at)) return at;
      at = graph.blocks[at]?.parent ?? null;
    }
    return null;
  };

  /** Kept children under each kept parent, in original relative order. */
  const under = new Map<Id | null, Id[]>();
  for (const id of kept) {
    const parent = id === TIER_ROOT ? null : nearest(id);
    const list = under.get(parent) ?? [];
    list.push(id);
    under.set(parent, list);
  }
  for (const [, list] of under) {
    list.sort((left, right) => {
      const a = graph.blocks[left]?.order ?? 0;
      const b = graph.blocks[right]?.order ?? 0;
      return a - b || left.localeCompare(right);
    });
  }

  const blocks: Record<Id, Block> = {};
  for (const [parent, list] of under) {
    list.forEach((id, index) => {
      const block = graph.blocks[id]!;
      const next: Block = {
        ...block,
        parent: id === TIER_ROOT || parent === null ? null : parent,
        order: index + 1,
      };
      delete next.group;
      delete next.cell;
      blocks[id] = next;
    });
  }

  return {
    root: TIER_ROOT,
    blocks,
    edges: {},
    holders: {},
    ...vocab(graph, blocks),
  };
}

/** A page's document as canvas blocks: sections (#…###), prose/code, and
 *  table grids — nested by heading membership, seated on a free lattice. */
export function contentGraph(graph: Graph, pageId: Id, maxLevel = SECTION_DEPTH): Graph | null {
  const prepared = prepareContent(graph, pageId, maxLevel);
  if (!prepared) return null;
  introduceBodies(prepared.blocks, prepared.holders, pageId);
  placeLattice(prepared.blocks, prepared.holders, {}, pageId);
  return {
    root: pageId,
    blocks: prepared.blocks,
    edges: {},
    holders: prepared.holders,
    ...vocab(graph, prepared.blocks),
  };
}

/** Collect, hoist, explode, and label a page's content — no coordinates yet. */
function prepareContent(
  graph: Graph,
  pageId: Id,
  maxLevel: number,
): { blocks: Record<Id, Block>; holders: Record<Id, Holder> } | null {
  const page = graph.blocks[pageId];
  if (!page || page.type !== PAGE) return null;

  const kept = new Set<Id>([pageId]);
  const holder_ids = new Set<Id>();

  const take_holder = (id: Id) => {
    if (!graph.holders[id] || holder_ids.has(id)) return;
    holder_ids.add(id);
    for (const block of Object.values(graph.blocks)) {
      if (block.group === id) kept.add(block.id);
    }
  };

  const visit = (id: Id): void => {
    for (const holder of Object.values(graph.holders)) {
      if (holder.parent === id) take_holder(holder.id);
    }
    for (const child of children(graph, id)) {
      if (child.type === SET || child.type === PAGE) continue;
      if (child.type === SECTION) {
        const level = Number(field(child.fields, LEVEL) ?? 99);
        if (!Number.isFinite(level) || level > maxLevel) continue;
        kept.add(child.id);
        visit(child.id);
        continue;
      }
      if (child.group) {
        if (graph.holders[child.group]) {
          kept.add(child.id);
          take_holder(child.group);
        }
        continue;
      }
      kept.add(child.id);
      visit(child.id);
    }
  };
  visit(pageId);

  const blocks: Record<Id, Block> = {};
  for (const id of kept) {
    const block = graph.blocks[id];
    if (!block) continue;
    const next: Block = { ...block };
    if (id === pageId) next.parent = null;
    else if (next.parent && !kept.has(next.parent)) next.parent = pageId;
    delete next.x;
    delete next.y;
    blocks[id] = next;
  }

  const holders: Record<Id, Holder> = {};
  for (const id of holder_ids) {
    const holder = graph.holders[id];
    if (!holder) continue;
    const parent = holder.parent && kept.has(holder.parent) ? holder.parent : pageId;
    const copy: Holder = { ...holder, parent };
    if (!copy.of || !kept.has(copy.of)) copy.of = parent;
    delete copy.x;
    delete copy.y;
    holders[id] = copy;
  }

  hoist_sole_title(blocks, holders, pageId);
  explode_list_groups(blocks, holders);
  label_bodies(blocks);

  return { blocks, holders };
}

/** When the page's only loose child is a level-1 section, reparent that
 *  section's children (and holders) onto the page and drop the H1 from the
 *  canvas tree. The tray still reads the full graph. */
function hoist_sole_title(
  blocks: Record<Id, Block>,
  holders: Record<Id, Holder>,
  pageId: Id,
): void {
  const kids = Object.values(blocks).filter(
    (block) => block.parent === pageId && block.id !== pageId && !block.group,
  );
  if (kids.length !== 1) return;
  const sole = kids[0]!;
  if (sole.type !== SECTION) return;
  const level = Number(field(sole.fields, LEVEL) ?? 99);
  if (level !== 1) return;

  for (const block of Object.values(blocks)) {
    if (block.parent === sole.id) block.parent = pageId;
  }
  for (const holder of Object.values(holders)) {
    if (holder.parent === sole.id) {
      holder.parent = pageId;
      if (holder.of === sole.id) holder.of = pageId;
    }
  }
  delete blocks[sole.id];
}

/** Kit free-groups never place their members on the stage (empty band). Turn
 *  each list group into ordinary stacked cards under the same parent. */
function explode_list_groups(
  blocks: Record<Id, Block>,
  holders: Record<Id, Holder>,
): void {
  for (const id of Object.keys(holders)) {
    const holder = holders[id]!;
    if (holder.arrangement !== "free") continue;
    for (const block of Object.values(blocks)) {
      if (block.group !== id) continue;
      delete block.group;
    }
    delete holders[id];
  }
}

/** Cards need a name; body-only items otherwise show as "Item". Code fences
 *  are named by language in the graph — prefer the first line of the body
 *  on the canvas so the card reads as the snippet, not "ts". */
function label_bodies(blocks: Record<Id, Block>): void {
  for (const block of Object.values(blocks)) {
    const line = (block.body ?? "").trim().split(/\r?\n/)[0]?.trim() ?? "";
    if (!line) continue;
    const label = line.length > 48 ? `${line.slice(0, 45)}…` : line;
    if (block.type === CODE) {
      block.name = label;
      continue;
    }
    if (block.name) continue;
    if (block.type !== ITEM) continue;
    block.name = label;
  }
}

/** Organization plus every page's content tree — Explorer and Viewer both
 *  read this. Parents in the projection are the tree; coordinates seat the
 *  lattice; edges include `contains:` body links and stand-ins for off-layer
 *  requirement ends. */
export function viewingGraph(graph: Graph, maxLevel = SECTION_DEPTH): Graph {
  const org = organizationGraph(graph);
  const blocks: Record<Id, Block> = { ...org.blocks };
  const holders: Record<Id, Holder> = {};

  for (const block of Object.values(org.blocks)) {
    if (block.type !== PAGE) continue;
    const prepared = prepareContent(graph, block.id, maxLevel);
    if (!prepared) continue;
    for (const [id, held] of Object.entries(prepared.blocks)) {
      if (id === block.id) {
        const prior = org.blocks[id]!;
        blocks[id] = {
          ...held,
          parent: prior.parent,
          ...(prior.order !== undefined ? { order: prior.order } : {}),
        };
        delete blocks[id]!.x;
        delete blocks[id]!.y;
        continue;
      }
      blocks[id] = held;
    }
    Object.assign(holders, prepared.holders);
  }

  for (const block of Object.values(org.blocks)) {
    if (block.type === PAGE) introduceBodies(blocks, holders, block.id);
  }

  const edges: Record<Id, Edge> = {};
  add_contains_edges(blocks, edges);
  add_requirement_stands(graph, blocks, edges);
  copy_edges(graph, blocks, edges);

  for (const block of Object.values(org.blocks)) {
    if (block.type === PAGE) placeLattice(blocks, holders, edges, block.id);
  }

  /** Sets and pages stay without coordinates — free lays them in a row. */
  for (const block of Object.values(blocks)) {
    if (block.type === SET || block.type === PAGE) {
      delete block.x;
      delete block.y;
    }
  }

  return {
    root: org.root,
    blocks,
    edges,
    holders,
    ...vocab(graph, blocks),
  };
}

/** Projection-only body and prose blocks. Children of a section move onto its
 *  body; the section and body stay siblings under the same parent. */
function introduceBodies(
  blocks: Record<Id, Block>,
  holders: Record<Id, Holder>,
  pageId: Id,
): void {
  const page = blocks[pageId];
  if (page?.type === PAGE && page.body?.trim()) {
    const proseId = `prose:${pageId}` as Id;
    if (!blocks[proseId]) {
      blocks[proseId] = {
        id: proseId,
        parent: pageId,
        type: ITEM,
        name: first_line(page.body) || "Prose",
        body: page.body,
        /** Ahead of every section so placeLattice seats it at row 0. */
        order: 0,
      };
    }
  }

  let guard = 0;
  while (guard++ < 64) {
    const section = Object.values(blocks).find((block) => {
      if (block.type !== SECTION) return false;
      return section_has_kept_children(blocks, holders, block.id);
    });
    if (!section) break;

    const bodyId = `body:${section.id}` as Id;
    if (blocks[bodyId]) break;

    const parent = section.parent;
    const order = (section.order ?? 0) + 0.5;
    blocks[bodyId] = {
      id: bodyId,
      parent,
      type: ITEM,
      name: section.name ?? "Body",
      order,
    };

    for (const block of Object.values(blocks)) {
      if (block.parent === section.id && !block.group) block.parent = bodyId;
    }
    for (const holder of Object.values(holders)) {
      if (holder.parent === section.id) {
        holder.parent = bodyId;
        if (holder.of === section.id) holder.of = bodyId;
      }
    }
  }

  renumber_orders(blocks, holders);
}

function section_has_kept_children(
  blocks: Record<Id, Block>,
  holders: Record<Id, Holder>,
  sectionId: Id,
): boolean {
  for (const block of Object.values(blocks)) {
    if (block.parent === sectionId && !block.group) return true;
  }
  for (const holder of Object.values(holders)) {
    if (holder.parent === sectionId && !holder.group) return true;
  }
  return false;
}

function add_contains_edges(blocks: Record<Id, Block>, edges: Record<Id, Edge>): void {
  for (const block of Object.values(blocks)) {
    if (!block.id.startsWith("body:")) continue;
    const sectionId = block.id.slice("body:".length) as Id;
    if (!blocks[sectionId]) continue;
    const id = `contains:${sectionId}` as Id;
    edges[id] = {
      id,
      from: sectionId,
      to: block.id,
      type: LINK,
      dir: "forward",
      name: "contains",
    };
  }
}

/** Stand-ins for requirement edges whose other end is off the body layer. */
function add_requirement_stands(
  graph: Graph,
  blocks: Record<Id, Block>,
  edges: Record<Id, Edge>,
): void {
  for (const edge of Object.values(graph.edges)) {
    const reqId = requirement_end(blocks, edge.from, edge.to);
    if (!reqId) continue;
    const otherId = edge.from === reqId ? edge.to : edge.from;
    const req = blocks[reqId]!;
    const bodyParent = req.parent;
    if (!bodyParent || !String(bodyParent).startsWith("body:")) continue;

    const other = blocks[otherId];
    if (other && other.parent === bodyParent && !other.group) continue;

    const standId = `stand:${edge.id}` as Id;
    if (blocks[standId]) continue;
    const source = graph.blocks[otherId];
    const name = source?.name ?? edge.name ?? otherId;
    blocks[standId] = {
      id: standId,
      parent: bodyParent,
      type: ITEM,
      name,
      order: (req.order ?? 0) + 0.1,
    };

    const from = edge.from === reqId ? reqId : standId;
    const to = edge.to === reqId ? reqId : standId;
    edges[edge.id] = { ...edge, from, to };
  }
}

function requirement_end(blocks: Record<Id, Block>, from: Id, to: Id): Id | null {
  if (blocks[from]?.type === REQUIREMENT) return from;
  if (blocks[to]?.type === REQUIREMENT) return to;
  return null;
}

function copy_edges(graph: Graph, blocks: Record<Id, Block>, edges: Record<Id, Edge>): void {
  for (const edge of Object.values(graph.edges)) {
    if (edges[edge.id]) continue;
    if (!blocks[edge.from] || !blocks[edge.to]) continue;
    edges[edge.id] = { ...edge };
  }
}

/** Seat every loose content block on the free lattice. Runs stack downward;
 *  inside a run, slots are row-major. */
function placeLattice(
  blocks: Record<Id, Block>,
  holders: Record<Id, Holder>,
  edges: Record<Id, Edge>,
  pageId: Id,
): void {
  const parents = new Set<Id>();
  for (const block of Object.values(blocks)) {
    if (block.parent) parents.add(block.parent);
  }
  for (const holder of Object.values(holders)) {
    if (holder.parent) parents.add(holder.parent);
  }
  parents.add(pageId);

  for (const parent of parents) {
    if (!blocks[parent] && parent !== pageId) continue;
    place_layer(blocks, holders, edges, parent, pageId);
  }
}

function place_layer(
  blocks: Record<Id, Block>,
  holders: Record<Id, Holder>,
  edges: Record<Id, Edge>,
  parent: Id,
  pageId: Id,
): void {
  type Unit = { id: Id; order: number; kind: "block" | "holder" };
  const loose: Unit[] = [];
  for (const block of Object.values(blocks)) {
    if (block.id === pageId || block.parent !== parent || block.group) continue;
    if (block.type === PAGE || block.type === SET) continue;
    loose.push({ id: block.id, order: block.order ?? 0, kind: "block" });
  }
  for (const holder of Object.values(holders)) {
    if (holder.parent !== parent || holder.group) continue;
    loose.push({ id: holder.id, order: holder.order ?? 0, kind: "holder" });
  }
  if (!loose.length) return;
  loose.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const placed = new Set<Id>();
  let y = 0;
  let index = 0;

  const seat_block = (id: Id, col: number, rowY: number, order: number) => {
    const block = blocks[id]!;
    block.x = col * STRIDE_X;
    block.y = rowY;
    block.order = order;
    placed.add(id);
  };

  while (index < loose.length) {
    const row = loose[index]!;
    if (placed.has(row.id)) {
      index += 1;
      continue;
    }

    if (row.kind === "holder") {
      const holder = holders[row.id]!;
      holder.x = 0;
      holder.y = y;
      holder.order = ++index;
      placed.add(row.id);
      const rows = holder.arrangement === "grid" ? Math.max(1, holder.rows ?? 1) : 1;
      y += Math.max(CARD.h, rows * CELL.h) + GAP;
      continue;
    }

    const block = blocks[row.id]!;

    if (block.type === SECTION) {
      const order = ++index;
      seat_block(block.id, 0, y, order);
      const bodyId = `body:${block.id}` as Id;
      if (blocks[bodyId] && blocks[bodyId]!.parent === parent) {
        seat_block(bodyId, 1, y, order + 1);
      }
      y += STRIDE_Y;
      continue;
    }

    if (block.id.startsWith("body:")) {
      /** Placed with its section; orphan bodies take column 0. */
      if (!placed.has(block.id)) {
        seat_block(block.id, 0, y, ++index);
        y += STRIDE_Y;
      } else {
        index += 1;
      }
      continue;
    }

    if (block.type === REQUIREMENT) {
      const order = ++index;
      seat_block(block.id, 0, y, order);
      let col = 1;
      for (const stand of stand_ins_for(blocks, edges, block.id, parent)) {
        seat_block(stand.id, col, y, order + col);
        col += 1;
      }
      y += STRIDE_Y;
      continue;
    }

    if (block.id.startsWith("stand:")) {
      if (!placed.has(block.id)) {
        seat_block(block.id, 0, y, ++index);
        y += STRIDE_Y;
      } else {
        index += 1;
      }
      continue;
    }

    /** Consecutive peer leaves (items, tasks, fences, prose) share a run. */
    const peers: Id[] = [];
    while (index < loose.length) {
      const next = loose[index]!;
      if (next.kind !== "block" || placed.has(next.id)) break;
      const peer = blocks[next.id]!;
      if (!is_peer_leaf(peer)) break;
      peers.push(next.id);
      index += 1;
    }
    if (!peers.length) {
      seat_block(block.id, 0, y, ++index);
      y += STRIDE_Y;
      continue;
    }

    const cols = peer_columns(peers.length);
    peers.forEach((id, at) => {
      const col = at % cols;
      const rowAt = Math.floor(at / cols);
      seat_block(id, col, y + rowAt * STRIDE_Y, at + 1);
    });
    const rowsUsed = Math.ceil(peers.length / cols);
    y += rowsUsed * STRIDE_Y;
  }
}

function is_peer_leaf(block: Block): boolean {
  if (block.type === SECTION || block.type === REQUIREMENT) return false;
  if (block.id.startsWith("body:") || block.id.startsWith("stand:")) return false;
  return true;
}

function peer_columns(n: number): number {
  if (n <= 3) return 1;
  return Math.min(4, Math.ceil(Math.sqrt(n)));
}

/** Stand-ins on this layer that belong beside a requirement. */
function stand_ins_for(
  blocks: Record<Id, Block>,
  edges: Record<Id, Edge>,
  reqId: Id,
  parent: Id,
): Block[] {
  const out: Block[] = [];
  for (const edge of Object.values(edges)) {
    if (edge.from !== reqId && edge.to !== reqId) continue;
    const standId = `stand:${edge.id}` as Id;
    const stand = blocks[standId];
    if (!stand || stand.parent !== parent) continue;
    out.push(stand);
  }
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}

function first_line(text: string): string {
  const line = text.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > 48 ? `${line.slice(0, 45)}…` : line;
}

function renumber_orders(blocks: Record<Id, Block>, holders: Record<Id, Holder>): void {
  const parents = new Set<Id | null>();
  for (const block of Object.values(blocks)) parents.add(block.parent);
  for (const holder of Object.values(holders)) parents.add(holder.parent ?? null);

  for (const parent of parents) {
    const units: { id: Id; order: number; kind: "block" | "holder" }[] = [];
    for (const block of Object.values(blocks)) {
      if (block.parent !== parent || block.group) continue;
      units.push({ id: block.id, order: block.order ?? 0, kind: "block" });
    }
    for (const holder of Object.values(holders)) {
      if ((holder.parent ?? null) !== parent || holder.group) continue;
      units.push({ id: holder.id, order: holder.order ?? 0, kind: "holder" });
    }
    units.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    units.forEach((unit, index) => {
      if (unit.kind === "block") blocks[unit.id]!.order = index + 1;
      else holders[unit.id]!.order = index + 1;
    });
  }
}

function vocab(graph: Graph, blocks: Record<Id, Block>): Pick<Graph, "defs" | "packages"> {
  const types = new Set(Object.values(blocks).map((block) => block.type).filter(Boolean) as Id[]);
  const defs: Graph["defs"] = {};
  const packages: Graph["packages"] = {};
  for (const type of types) {
    let at: Id | undefined = type;
    while (at && graph.defs[at] && !defs[at]) {
      const def = graph.defs[at] as NonNullable<(typeof graph.defs)[string]>;
      defs[at] = def;
      if (def.from && graph.packages[def.from]) packages[def.from] = graph.packages[def.from]!;
      at = def.extends;
    }
  }
  for (const [id, pack] of Object.entries(graph.packages)) {
    if (packages[id]) continue;
    if (Object.keys(defs).some((type) => graph.defs[type]?.from === id)) packages[id] = pack;
  }
  return {
    defs: Object.keys(defs).length ? defs : { ...graph.defs },
    packages: Object.keys(packages).length ? packages : { ...graph.packages },
  };
}

/** Walk parents until a page, or null when the id is not under one. */
export function pageOf(graph: Graph, id: Id | null | undefined): Id | null {
  let at: Id | null = id ?? null;
  const seen = new Set<Id>();
  while (at && !seen.has(at)) {
    seen.add(at);
    const block = graph.blocks[at];
    if (!block) return null;
    if (block.type === PAGE) return at;
    at = block.parent;
  }
  return null;
}

/** Whether an id exists only in a projection (missing from the held graph). */
export function isProjectionId(id: Id, held: Graph): boolean {
  return !held.blocks[id] && !held.holders[id];
}

/** Held-graph id to edit when a projection row is selected, if any. */
export function heldId(id: Id, held: Graph): Id | null {
  if (held.blocks[id]) return id;
  if (id.startsWith("body:")) {
    const sectionId = id.slice("body:".length) as Id;
    return held.blocks[sectionId] ? sectionId : null;
  }
  if (id.startsWith("prose:")) {
    const pageId = id.slice("prose:".length) as Id;
    return held.blocks[pageId] ? pageId : null;
  }
  if (id.startsWith("stand:")) return null;
  return null;
}

/** Emitted-order outline for a page's content (not organization). */
export function documentOutline(graph: Graph, pageId: Id): OutlineRow[] {
  const page = graph.blocks[pageId];
  if (!page || page.type !== PAGE) return [];
  const out: OutlineRow[] = [];
  walk(pageId, 0);
  return out;

  function walk(parent: Id, depth: number): void {
    let items: { id: Id; text: string; done?: boolean }[] = [];
    let rows: Block[] = [];
    const close = () => {
      if (items.length) {
        out.push({ kind: "list", id: items[0]!.id, depth, items });
        items = [];
      }
      if (rows.length) {
        out.push(typed_table(rows, depth));
        rows = [];
      }
    };

    for (const unit of units(graph, parent)) {
      if (is_holder(graph, unit.id)) {
        close();
        const holder = unit as Holder;
        if (holder.arrangement === "grid") {
          const table = grid_table(graph, holder, depth);
          if (table) out.push(table);
        } else {
          const list = group_list(graph, holder, depth);
          if (list) out.push(list);
        }
        continue;
      }
      const block = unit as Block;
      if (block.type === SET || block.type === PAGE) continue;

      if (field(block.fields, KEY) !== undefined) {
        rows.push(block);
        continue;
      }
      if (block.type === ITEM && field(block.fields, DONE) !== undefined) {
        const done = field(block.fields, DONE);
        items.push({
          id: block.id,
          text: block.body ?? "",
          ...(done === undefined ? {} : { done: done === "true" }),
        });
        continue;
      }
      close();

      if (block.type === SECTION) {
        const level = Number(field(block.fields, LEVEL) ?? depth + 1);
        out.push({
          kind: "section",
          id: block.id,
          depth,
          title: block.name ?? "",
          ...(Number.isFinite(level) ? { level } : {}),
        });
        if (block.body?.trim()) {
          out.push({ kind: "prose", id: `${block.id}:body`, depth: depth + 1, markdown: block.body });
        }
        walk(block.id, depth + 1);
        continue;
      }
      if (block.type === CODE) {
        const language = field(block.fields, LANG);
        out.push({
          kind: "code",
          id: block.id,
          depth,
          ...(language ? { language } : {}),
          text: block.body ?? "",
        });
        continue;
      }

      const user = user_fields(block);
      if (user.length && !(block.body?.trim())) {
        out.push({
          kind: "record",
          id: block.id,
          depth,
          label: block.name ?? block.id,
          fields: user,
        });
        walk(block.id, depth + 1);
        continue;
      }
      if (block.body?.trim()) {
        out.push({ kind: "prose", id: block.id, depth, markdown: block.body });
      } else if (user.length) {
        out.push({
          kind: "record",
          id: block.id,
          depth,
          label: block.name ?? block.id,
          fields: user,
        });
      }
      walk(block.id, depth + 1);
    }
    close();
  }
}

/** Organization children of a set, for the folder Content tab. */
export function orgChildren(graph: Graph, id: Id): Block[] {
  return children(graph, id).filter((block) => block.type === SET || block.type === PAGE);
}

function user_fields(block: Block): { name: string; value: string }[] {
  return (block.fields ?? [])
    .filter((entry) => !MACHINE.has(entry.name) && entry.value !== undefined)
    .map((entry) => ({ name: entry.name, value: entry.value ?? "" }));
}

function units(graph: Graph, layer: Id): (Block | Holder)[] {
  const held = [
    ...children(graph, layer).filter((block) => !block.group),
    ...Object.values(graph.holders).filter((holder) => holder.parent === layer && !holder.group),
  ];
  return held.sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id));
}

function typed_table(rows: Block[], depth: number): OutlineRow {
  const headers = (rows[0]!.fields ?? [])
    .filter((entry) => entry.name !== KEY)
    .map((entry) => entry.name);
  return {
    kind: "table",
    id: rows[0]!.id,
    depth,
    headers,
    rows: rows.map((row) => headers.map((name) => field(row.fields, name) ?? "")),
  };
}

function grid_table(graph: Graph, holder: Holder, depth: number): OutlineRow | null {
  const rows = holder.rows ?? 0;
  const cols = holder.cols ?? 0;
  if (rows < 1 || cols < 1) return null;
  const cells: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: string[] = [];
    for (let c = 0; c < cols; c++) {
      const cell = at_cell(graph, holder.id, r, c);
      line.push(cell?.body ?? "");
    }
    cells.push(line);
  }
  const headers = cells[0] ?? [];
  return {
    kind: "table",
    id: holder.id,
    depth,
    headers,
    rows: cells.slice(1),
  };
}

function group_list(graph: Graph, holder: Holder, depth: number): OutlineRow | null {
  const members = Object.values(graph.blocks)
    .filter((block) => block.group === holder.id)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id));
  if (!members.length) return null;
  return {
    kind: "list",
    id: holder.id,
    depth,
    items: members.map((member) => {
      const done = field(member.fields, DONE);
      return {
        id: member.id,
        text: member.body ?? member.name ?? "",
        ...(done === undefined ? {} : { done: done === "true" }),
      };
    }),
  };
}

/** Re-export for tests. */
export const ORG_TYPES = [SET, PAGE] as const;
export const CONTENT_TYPES = [SECTION, ITEM, CODE] as const;
export const LATTICE = { CARD, GAP, CELL, STRIDE_X, STRIDE_Y } as const;

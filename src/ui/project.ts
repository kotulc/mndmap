/** UI projections over the full translated graph.
 *
 *  Organization (Explorer) shows only sets and pages. The Viewer uses
 *  {@link viewingGraph}: pages keep their set parents, and each page carries
 *  its document as nested canvas blocks — `#`…`###` sections, list/task/code
 *  cards, and table grids — stacked in source order. A sole H1 is hoisted so
 *  opening a page lands on its real sections; free list-groups are exploded
 *  into cards (the kit draws those groups empty). The tray still reads the
 *  full held graph. Neither projection mutates it. */

import { at_cell, children, is_holder, type Block, type Graph, type Id } from "@mnd/kit";
import {
  CODE, DONE, ITEM, LANG, LEVEL, PAGE, SECTION, SET, TIER_ROOT,
  field, type Holder,
} from "../doc.js";
import { KEY } from "../read.js";

/** Fields that choose a construct, not something the tray lists as metadata. */
const MACHINE = new Set([LEVEL, LANG, DONE, KEY, "title"]);

/** Lattice step used to stack a page's blocks down the canvas. */
const UNIT = 24;
const CARD = { w: 5 * UNIT, h: 2 * UNIT };
const GAP = UNIT;
const CELL = { w: CARD.w + GAP * 2, h: CARD.h + GAP * 2 };

/** Heading depths drawn as their own section blocks (`#` … `###`). */
export const SECTION_DEPTH = 3;

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
    root: TIER_ROOT,
    blocks,
    edges: {},
    holders: {},
    defs: Object.keys(defs).length ? defs : { ...graph.defs },
    packages: Object.keys(packages).length ? packages : { ...graph.packages },
  };
}

/** A page's document as canvas blocks: sections (#…###), prose/code, and
 *  table grids — nested by heading membership, stacked top-to-bottom in
 *  source order. Opening a section shows its children the same way. */
export function contentGraph(graph: Graph, pageId: Id, maxLevel = SECTION_DEPTH): Graph | null {
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

  /** A lone H1 that mirrors the page is an extra click with no new meaning —
   *  hoist its children onto the page so opening the page shows ##…### and
   *  the content blocks directly. */
  hoist_sole_title(blocks, holders, pageId);
  /** Free list-groups draw empty in the kit; explode them into stacked cards.
   *  Table grids stay as holders. Name each body-only block from its prose. */
  explode_list_groups(blocks, holders);
  label_bodies(blocks);

  stack_layers(blocks, holders, pageId);

  return {
    root: pageId,
    blocks,
    edges: {},
    holders,
    ...vocab(graph, blocks),
  };
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

/** Organization plus every page's content tree — what the Viewer draws.
 *  Pages keep their set parents so a double-click can descend into them;
 *  Explorer still uses {@link organizationGraph} alone. */
export function viewingGraph(graph: Graph, maxLevel = SECTION_DEPTH): Graph {
  const org = organizationGraph(graph);
  const blocks: Record<Id, Block> = { ...org.blocks };
  const holders: Record<Id, Holder> = {};

  for (const block of Object.values(org.blocks)) {
    if (block.type !== PAGE) continue;
    const content = contentGraph(graph, block.id, maxLevel);
    if (!content) continue;
    for (const [id, held] of Object.entries(content.blocks)) {
      if (id === block.id) {
        /** Keep the org parent so the page still sits in its set. */
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
    Object.assign(holders, content.holders);
  }

  return {
    root: org.root,
    blocks,
    edges: {},
    holders,
    ...vocab(graph, blocks),
  };
}

/** Stack each layer's loose units (non-celled blocks + holders) vertically. */
function stack_layers(
  blocks: Record<Id, Block>,
  holders: Record<Id, Holder>,
  pageId: Id,
): void {
  for (const parent of Object.keys(blocks)) {
    const loose: { id: Id; order: number; kind: "block" | "holder" }[] = [];
    for (const block of Object.values(blocks)) {
      if (block.id === pageId || block.parent !== parent || block.group) continue;
      /** A page that still sits under a set is laid out by the set, not here. */
      if (block.type === PAGE || block.type === SET) continue;
      loose.push({ id: block.id, order: block.order ?? 0, kind: "block" });
    }
    for (const holder of Object.values(holders)) {
      if (holder.parent !== parent || holder.group) continue;
      loose.push({ id: holder.id, order: holder.order ?? 0, kind: "holder" });
    }
    if (!loose.length) continue;
    loose.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    let y = 0;
    loose.forEach((row, index) => {
      if (row.kind === "block") {
        const block = blocks[row.id]!;
        block.order = index + 1;
        block.x = 0;
        block.y = y;
        y += CARD.h + GAP;
        return;
      }
      const holder = holders[row.id]!;
      holder.order = index + 1;
      holder.x = 0;
      holder.y = y;
      const rows = holder.arrangement === "grid" ? Math.max(1, holder.rows ?? 1) : 1;
      y += Math.max(CARD.h, rows * CELL.h) + GAP;
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

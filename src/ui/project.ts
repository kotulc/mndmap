/** UI projections over the full translated graph.
 *
 *  Organization (Explorer + Viewer) shows only sets and pages. Content
 *  (tray outline) is the page's emitted-order document, as indentation —
 *  never as canvas nesting. Neither projection mutates the graph. */

import { at_cell, children, is_holder, type Block, type Graph, type Id } from "@mnd/kit";
import {
  CODE, DONE, ITEM, LANG, LEVEL, PAGE, SECTION, SET, TIER_ROOT,
  field, type Holder,
} from "../doc.js";
import { KEY } from "../read.js";

/** Fields that choose a construct, not something the tray lists as metadata. */
const MACHINE = new Set([LEVEL, LANG, DONE, KEY, "title"]);

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

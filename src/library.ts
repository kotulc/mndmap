/** The library projected: the explorer's packages and definitions, drawn as diagrams.
 *
 *  A projection is of one row of the explorer's tree, and draws what it holds as the explorer
 *  files it, in its order: each branch a box, boxes inside boxes, and each definition a card.
 *  Drilling down narrows it. A row holding definitions of its own draws them as a context: its
 *  cards, and how they relate — what each extends, and what holds or allocates what where the
 *  document uses them — with what they relate to outside it drawn faded. One definition opened is
 *  drawn in the context of its use. Drawn, never stored: the explorer's tree is the one source.
 *
 *  The document's own projection, the page, is `read.ts`'s; both follow the same tree. */

import { tree_of, type Pointed } from "@mnd/kit/react";
import { UNITS, box_of, project, set_card, set_full, type Block, type Graph, type Id }
  from "@mnd/kit";
import { ALLOCATES, HEADING, MEMBER, TABLE } from "./packages/markdown.js";
import { reading } from "./read.js";

/** A library section or folder, as the explorer points at one. */
export type Shelf = Extract<Pointed, { of: "defs" }>;

/** A projection of the library: the row it is of, or with `local` named, that one definition in
 *  the context of its use. */
export type Chart = { at: Shelf; local?: Id };

/** One row of the explorer's tree. */
type Row = ReturnType<typeof tree_of>[number];

/** What names a definition's card, each block beside it, and a box of them. */
export const DEFINED = "defined:";
const USED = "used:";
const GROUP = "group:";
const SECTION = "section:";

/** The one relation a projection draws that no package defines: a definition built on another. */
const EXTENDS = "extends";

/** How many cards a definition's context sets in a row. */
const ACROSS = 4;

/** How a card related from outside the row is drawn: its border faint and dashed. */
const FADED = { style: { border_style: "dashed", border_contrast: "faint" } };

/** Where a projection keeps the document's own blocks, out of its drawing. */
const HELD = "@held";


/** A projection drawn: a row of the library, each box `across` cards wide, or one definition in
 *  its context. */
export function charted(graph: Graph, chart: Chart, card: { w: number; h: number },
                        full: boolean, across: number): Graph {
  set_card(card.w, card.h);
  set_full(full);
  return chart.local ? local(graph, chart.local) : nested(graph, chart.at, across);
}

/** Every definition a row holds, however deep. */
export function listed(graph: Graph, at: Shelf): Id[] {
  return under(graph, at).filter((row) => row.of === "def").map((row) => row.ref);
}

/** The row a definition is first listed under: the narrowest projection that draws it. */
export function holder_of(graph: Graph, def: Id): Shelf | null {
  const all = tree_of(graph, [], true);
  const at = all.findIndex((row) => row.of === "def" && row.ref === def);
  const holder = all.slice(0, at).findLast((row) => row.depth < all[at]!.depth);
  return at >= 0 && holder?.at?.of === "defs" ? holder.at : null;
}

/** Whether two explorer pointers name the same thing. */
export function same(left: Pointed | undefined, right: Pointed): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}


/** The rows under the one a pointer names, in order, and the depth each sits at below it. */
function under(graph: Graph, at: Shelf): (Row & { below: number })[] {
  const all = tree_of(graph, [], true);
  const top = all.findIndex((row) => same(row.at, at));
  const out: (Row & { below: number })[] = [];
  for (let i = top + 1; top >= 0 && i < all.length && all[i]!.depth > all[top]!.depth; i++) {
    out.push({ ...all[i]!, below: all[i]!.depth - all[top]!.depth });
  }
  return out;
}

/** A row drawn as it is filed: each branch under it a box inside its holder's, each definition a
 *  card in its holder's box, the boxes stacked down the page. Its own definitions, where it holds
 *  any, are drawn first as their context. */
function nested(graph: Graph, at: Shelf, across: number): Graph {
  const blocks = aside(graph);
  const root = graph.root;
  const air = UNITS.unit;
  const gap = UNITS.gap * air;
  const card = { w: UNITS.block.w * air, h: UNITS.block.h * air };
  const w = across * card.w + (across - 1) * gap;
  const holders: (Id | undefined)[] = [];
  const own: Id[] = [];
  const tops: Id[] = [];
  let order = 0;

  for (const row of under(graph, at)) {
    // Each box sits in its holder's; one the row holds itself sits loose.
    holders.length = row.below;
    const group = holders[row.below - 1];
    if (row.of !== "def") {
      const id = `${GROUP}${row.id}`;
      blocks[id] = { id, parent: root, type: "group", name: row.label, order: ++order, w,
                     ...(group ? { group } : {}) };
      if (!group) tops.push(id);
      holders.push(id);
      continue;
    }
    const id = `${DEFINED}${row.ref}`;
    if (blocks[id]) continue;
    blocks[id] = { id, parent: root, of: row.ref, order: ++order, ...(group ? { group } : {}) };
    if (!group) own.push(row.ref);
  }

  const edges = own.length ? context(graph, blocks, own, across) : {};
  // Measured as the kit lays them, then stacked under the context.
  const drawn: Graph = { ...graph, blocks, edges, defs: { ...graph.defs, [EXTENDS]: EXTENDING } };
  const sizes = new Map(project(drawn, null).nodes.map((node) => [node.id, box_of(node)]));
  let y = Math.max(0, ...Object.values(blocks).filter((b) => b.parent === root && !b.group
    && b.y !== undefined).map((b) => b.y! + card.h)) + (own.length ? air * 3 : 0);
  for (const id of tops) {
    blocks[id] = { ...blocks[id]!, x: 0, y };
    y += (sizes.get(id)?.h ?? card.h) + air * 2;
  }
  return { ...drawn, blocks };
}

/** A row's own definitions as their context: their cards in rows of `across`, and under them,
 *  faded, what they relate to from outside it, each line drawn. */
function context(graph: Graph, blocks: Record<Id, Block>, own: Id[], across: number
                 ): Graph["edges"] {
  const air = UNITS.unit;
  const card = { w: UNITS.block.w * air, h: UNITS.block.h * air };
  const step = card.w + air * 2;
  const tall = card.h + air * 3;
  const inside = new Set(own);
  const place = (id: Id, n: number, top: number) => {
    blocks[id] = { ...blocks[id]!, x: (n % across) * step, y: top + Math.floor(n / across) * tall,
                   ...card };
  };
  own.forEach((def, n) => place(`${DEFINED}${def}`, n, 0));

  // What relates to them, and from outside, faded under them.
  const lines = related(graph).filter(([from, to]) => inside.has(from) || inside.has(to));
  const outside = [...new Set(lines.flatMap(([from, to]) => [from, to]).filter((id) => graph.defs[id] && !inside.has(id)
    && !blocks[`${DEFINED}${id}`]))];
  const below = Math.ceil(own.length / across) * tall + air * 2;
  outside.forEach((def, n) => {
    const id = `${DEFINED}${def}`;
    blocks[id] = { id, parent: graph.root, of: def, looks: FADED };
    place(id, n, below);
  });

  const edges: Graph["edges"] = {};
  for (const [from, to, type] of lines) {
    if (!blocks[`${DEFINED}${from}`] || !blocks[`${DEFINED}${to}`]) continue;
    const id = `${type}:${from}:${to}`;
    edges[id] = { id, from: `${DEFINED}${from}`, to: `${DEFINED}${to}`, type,
                  ...(type === MEMBER ? {} : { dir: "forward" as const }) };
  }
  return edges;
}

/** How definitions relate: what each extends, and from the document, which holds which — a
 *  heading the content under it — and which columns allocate which tables. */
function related(graph: Graph): [Id, Id, Id][] {
  const out = new Map<string, [Id, Id, Id]>();
  const add = (from: Id | undefined, to: Id | undefined, type: Id) => {
    if (from && to && from !== to) out.set(`${type}:${from}:${to}`, [from, to, type]);
  };
  for (const def of Object.values(graph.defs)) add(def.id, def.extends, EXTENDS);
  for (const block of reading(graph)) {
    const holder = graph.blocks[block.parent ?? ""];
    if (holder?.type === HEADING) add(holder.type, block.type, MEMBER);
    for (const column of block.grid?.columns ?? []) add(column, TABLE, ALLOCATES);
  }
  return [...out.values()];
}

/** The relation a definition's line to what it extends is drawn as. */
const EXTENDING = { id: EXTENDS, group: "relation" as const, extends: "line", name: "extends" };

/** The document's blocks, kept out of a projection: each it shows is a reference, so they stay
 *  where they are, under a holder it never draws. */
function aside(graph: Graph): Record<Id, Block> {
  const blocks: Record<Id, Block> = {};
  for (const block of Object.values(graph.blocks)) {
    blocks[block.id] = block.parent === graph.root ? { ...block, parent: HELD } : block;
  }
  blocks[graph.root] = graph.blocks[graph.root]!;
  return blocks;
}

/** One definition in the context of its use: the blocks it types or the tables allocating it, as
 *  cards, in rows of `ACROSS`, each under the heading of its section; the definition under them;
 *  and under it, the other columns those tables allocate, each dashed to the tables it shares. */
function local(graph: Graph, def: Id): Graph {
  const blocks = aside(graph);
  const edges: Graph["edges"] = {};
  const root = graph.root;
  const air = UNITS.unit;
  const card = { w: UNITS.block.w * air, h: UNITS.block.h * air };
  const gap = air * 2;
  const step = card.w + gap * 2;
  let order = 0;
  const put = (id: Id, of: Id, x: number, y: number) => {
    blocks[id] = { id, parent: root, of, order: ++order, x, y, ...card };
  };
  const line = (from: Id, to: Id, type: Id) => {
    const id = `${type}:${from}:${to}`;
    edges[id] = { id, from, to, type };
  };

  const users = reading(graph).filter((b) => b.type === def || b.grid?.columns?.includes(def));
  const wide = Math.max(1, Math.min(users.length, ACROSS)) * step - gap * 2;
  const centred = (count: number) => (wide - (count * step - gap * 2)) / 2;
  const tall = card.h * 2 + gap * 3;
  const centre = `${DEFINED}${def}`;
  const y = Math.ceil(users.length / ACROSS) * tall;
  put(centre, def, centred(1), y);

  users.forEach((user, n) => {
    const x = (n % ACROSS) * step;
    const top = Math.floor(n / ACROSS) * tall;
    const use = `${USED}${user.id}`;
    put(use, user.id, x, top + card.h + gap);
    line(centre, use, user.type === def ? MEMBER : ALLOCATES);
    const section = graph.blocks[user.parent ?? ""];
    if (section?.type !== HEADING) return;
    put(`${SECTION}${user.id}`, section.id, x, top);
    line(`${SECTION}${user.id}`, use, MEMBER);
  });

  // The columns allocated beside it, each dashed to the tables it shares with it.
  const others = [...new Set(users.flatMap((user) => user.grid?.columns ?? []))]
    .filter((other) => other !== def);
  others.forEach((other, n) => {
    const id = `${DEFINED}${other}`;
    put(id, other, centred(others.length) + n * step, y + card.h + gap * 3);
    for (const user of users.filter((u) => u.grid?.columns?.includes(other))) {
      line(id, `${USED}${user.id}`, ALLOCATES);
    }
  });
  return { ...graph, blocks, edges };
}

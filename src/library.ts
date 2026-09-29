/** The library projected: the explorer's packages and definitions, drawn as diagrams.
 *
 *  A projection is of one row of the explorer's tree, and draws everything under it as it is filed,
 *  in boxes down the page: a box of its own definitions, then a box per folder, each folder's
 *  folders boxes inside it, each definition a card, `across` cards to a row. Drilling down narrows
 *  it to one folder. One definition opened is drawn with what it extends over it and its usages
 *  beside it, by section. Drawn, never stored: the explorer's tree is the one source.
 *
 *  The document's own projection, the page, is `read.ts`'s; both follow the same tree. */

import { tree_of, type Pointed } from "@mnd/kit/react";
import { BASE_PACKAGE, UNITS, box_of, project, set_card, set_full, type Block, type Graph,
         type Id } from "@mnd/kit";
import { HEADING, MEMBER } from "./packages/markdown.js";
import { reading } from "./read.js";

/** A library section or folder, as the explorer points at one. */
export type Shelf = Extract<Pointed, { of: "defs" }>;

/** A projection of the library: the section it is of, or with `local` named, that one definition
 *  with what it extends and where it is used. */
export type Chart = { at: Shelf; local?: Id };

/** One row of the explorer's tree. */
type Row = ReturnType<typeof tree_of>[number];

/** What names a definition's card, a usage's, and a box of them. */
export const DEFINED = "defined:";
const USED = "used:";
const GROUP = "group:";

/** The one relation a projection draws that no package defines: a definition built on another. */
const EXTENDS = "extends";

/** The relation a definition's line to what it extends is drawn as. */
const EXTENDING = { id: EXTENDS, group: "relation" as const, extends: "line", name: "extends" };

/** What a projection's boxes are: a group of its own, so they are never counted as the group
 *  definition's usages. */
const BOX = "chart.box";
const BOXING = { id: BOX, group: "block" as const, extends: "group", name: "box" };

/** The definitions a projection draws with, beside the graph's own. */
const DRAWN = { [EXTENDS]: EXTENDING, [BOX]: BOXING };

/** Where a projection keeps the document's own blocks, out of its drawing. */
const HELD = "@held";


/** A projection drawn: a row of the library, or one definition opened, `across` cards wide. */
export function charted(graph: Graph, chart: Chart, card: { w: number; h: number },
                        full: boolean, across: number): Graph {
  set_card(card.w, card.h);
  set_full(full);
  return chart.local ? local(graph, chart.local, across) : boxed(graph, chart.at, across);
}

/** The folder a box is drawn for, as the explorer points at it. */
export function pointed_of(graph: Graph, id: Id): Shelf | null {
  const row = id.startsWith(GROUP)
    && tree_of(graph, [], true).find((each) => `${GROUP}${each.id}` === id);
  return row && row.at?.of === "defs" ? row.at : null;
}

/** The box a folder is drawn as, on its section's projection: none for the section itself, which
 *  is the whole of it. */
export function box_for(graph: Graph, at: Shelf): Id | null {
  const row = tree_of(graph, [], true).find((each) => same(each.at, at));
  return row && parent_of(graph, at) ? `${GROUP}${row.id}` : null;
}

/** The section a folder is filed in: the projection that draws it. */
export function section_of(graph: Graph, at: Shelf): Shelf {
  return path_of(graph, at)[0]?.at ?? at;
}

/** The folder a pick on a projection is in: a box's own, a definition's, else the whole of it. */
export function shelf_at(graph: Graph, id: Id | undefined, chart: Chart): Shelf {
  const def = chart.local ?? (id?.startsWith(DEFINED) ? id.slice(DEFINED.length) : null);
  return (id && pointed_of(graph, id)) || (def && holder_of(graph, def)) || chart.at;
}

/** The row a definition is first listed under: the narrowest projection that draws it. */
export function holder_of(graph: Graph, def: Id): Shelf | null {
  return filed_under(graph, (row) => row.of === "def" && row.ref === def);
}

/** The rows a row is filed down through, outermost first and itself last, each as it is labelled. */
export function path_of(graph: Graph, at: Shelf): { at: Shelf; label: string }[] {
  const all = tree_of(graph, [], true);
  const out: { at: Shelf; label: string }[] = [];
  for (let step: Shelf | null = at; step; step = parent_of(graph, step)) {
    const here = step;
    out.unshift({ at: here, label: all.find((row) => same(row.at, here))?.label ?? "" });
  }
  return out;
}

/** The row a row is filed under, where that is one of the library's too: one step up. */
export function parent_of(graph: Graph, at: Shelf): Shelf | null {
  return filed_under(graph, (row) => same(row.at, at));
}

/** How wide a projection `across` cards wide reads: a box's widest row, or a definition's card
 *  and its usages beside it. */
export function chart_width(chart: Chart, across: number): number {
  const usages = usages_across(across);
  return chart.local ? beside() + row_width(usages, usages) : row_width(across, across);
}

/** Whether two explorer pointers name the same thing. */
export function same(left: Pointed | undefined, right: Pointed): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}


/** The row the first row matching is filed under, where that is one of the library's. */
function filed_under(graph: Graph, match: (row: Row) => boolean): Shelf | null {
  const all = tree_of(graph, [], true);
  const at = all.findIndex(match);
  const holder = all.slice(0, at).findLast((row) => row.depth < all[at]!.depth);
  return at >= 0 && holder?.at?.of === "defs" ? holder.at : null;
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

/** The document's blocks a definition is used by: those it types, and the tables allocating it. */
function uses(graph: Graph, def: Id): Block[] {
  return reading(graph).filter((b) => b.type === def || b.grid?.columns?.includes(def));
}

/** How far right of a definition's card its usages sit. */
function beside(): number {
  return UNITS.block.w * UNITS.unit + UNITS.unit * 4;
}

/** How many usages a row holds beside an opened definition, so the two read `across` wide. */
function usages_across(across: number): number {
  return Math.max(1, across - 1);
}

/** How wide a box is to hold this many cards in a row, wrapping past `most`. */
function row_width(count: number, most: number): number {
  const row = Math.min(count, most);
  const air = UNITS.unit;
  return row * UNITS.block.w * air + (row - 1) * UNITS.gap * air;
}

/** A name with how many it holds, as a box is named: `prose (4)`. */
function counted(name: string, n: number): string {
  return `${name} (${n})`;
}

/** A definition's card: named with how often the document uses it, where it types blocks. A base
 *  the app ships types none of them itself, so it says nothing. */
function def_card(graph: Graph, def: Id): Partial<Block> {
  const d = graph.defs[def];
  const n = uses(graph, def).length;
  return { of: def, ...(d?.group === "block" && d.from !== BASE_PACKAGE
    ? { name: `${d.name} (${n} ${n === 1 ? "usage" : "usages"})` } : {}) };
}

/** A row drawn as it is filed, in boxes down the page: a box of the definitions it files itself,
 *  named as it is, then a box for each folder it files, each folder's own folders boxes inside it,
 *  and each definition a card in its folder's box. A box is named with how many it holds. */
function boxed(graph: Graph, at: Shelf, across: number): Graph {
  const blocks = aside(graph);
  const root = graph.root;
  const rows = under(graph, at);
  const self = tree_of(graph, [], true).find((row) => same(row.at, at));
  const tops: Id[] = [];
  let order = 0;

  /** A box for a folder, or the row itself, named with the definitions under it. */
  const box = (id: Id, label: string, held: number, group?: Id) => {
    blocks[id] = { id, parent: root, type: BOX, name: counted(label, held), order: ++order,
                   ...(group ? { group } : {}) };
    if (!group) tops.push(id);
  };
  /** How many definitions are filed under the row at `n`, however deep. */
  const held = (n: number) => {
    const end = rows.findIndex((each, m) => m > n && each.below <= rows[n]!.below);
    return rows.slice(n + 1, end < 0 ? undefined : end).filter((each) => each.of === "def").length;
  };

  // Its own definitions first, then each folder inside the one it is filed in.
  const own = rows.filter((row) => row.below === 1 && row.of === "def");
  const loose = `${GROUP}${self?.id ?? root}`;
  if (own.length) box(loose, self?.label ?? "", own.length);
  const holders: Id[] = [];
  rows.forEach((row, n) => {
    holders.length = row.below - 1;
    const holder = row.below === 1 ? (row.of === "def" ? loose : undefined) : holders.at(-1);
    if (row.of !== "def") {
      const id = `${GROUP}${row.id}`;
      box(id, row.label, held(n), holder);
      holders.push(id);
      return;
    }
    const id = `${DEFINED}${row.ref}`;
    if (!blocks[id]) blocks[id] = { id, parent: root, order: ++order, ...def_card(graph, row.ref),
                                    ...(holder ? { group: holder } : {}) };
  });

  // A box of cards is as wide as its cards, and one of boxes as wide as a box reads.
  for (const [id, block] of Object.entries(blocks)) {
    if (block.type !== BOX) continue;
    const kids = Object.values(blocks).filter((each) => each.group === id);
    const boxes = kids.some((each) => each.type === BOX);
    blocks[id] = { ...block, w: row_width(boxes ? across : Math.max(1, kids.length), across) };
  }

  // Measured as the kit lays them, then stacked down the page a card's height apart, as the kit
  // keeps a box inside a box.
  const drawn: Graph = { ...graph, blocks, defs: { ...graph.defs, ...DRAWN } };
  const sizes = new Map(project(drawn, null).nodes.map((node) => [node.id, box_of(node)]));
  let y = 0;
  for (const id of tops) {
    blocks[id] = { ...blocks[id]!, x: 0, y };
    y += (sizes.get(id)?.h ?? 0) + UNITS.block.h * UNITS.unit;
  }
  return { ...drawn, blocks };
}

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

/** One definition opened: its card, a line to a box of its usages beside it, a box inside it for
 *  each section they are read in, and over it what it extends, each link of the chain over the one
 *  it is built on. */
function local(graph: Graph, def: Id, across: number): Graph {
  const blocks = aside(graph);
  const edges: Graph["edges"] = {};
  const root = graph.root;
  const air = UNITS.unit;
  const card = { w: UNITS.block.w * air, h: UNITS.block.h * air };
  const rise = card.h + air * 3;
  const most = usages_across(across);
  let order = 0;

  // The chain: the definition first, and each it extends over it.
  const chain: Id[] = [];
  for (let at: Id | undefined = def; at && graph.defs[at] && !chain.includes(at);
       at = graph.defs[at]!.extends) chain.push(at);
  const top = (chain.length - 1) * rise;
  chain.forEach((link, n) => {
    const id = `${DEFINED}${link}`;
    blocks[id] = { id, parent: root, of: link, order: ++order, x: 0, y: top - n * rise, ...card };
    if (!n) return;
    const from = `${DEFINED}${chain[n - 1]}`;
    edges[`${EXTENDS}:${from}`] = { id: `${EXTENDS}:${from}`, from, to: id, type: EXTENDS,
                                    dir: "forward" };
  });

  // Its usages beside it, a box of them for each section they are read in.
  const used = uses(graph, def);
  const centre = `${DEFINED}${def}`;
  blocks[centre] = { ...blocks[centre]!, ...def_card(graph, def) };
  const drawn: Graph = { ...graph, blocks, edges, defs: { ...graph.defs, ...DRAWN } };
  if (!used.length) return drawn;
  const group = `${GROUP}${def}`;
  blocks[group] = { id: group, parent: root, type: BOX, name: counted("usages", used.length),
                    order: ++order, w: row_width(most, most), x: beside(), y: top };
  const sections = new Map<Id, Block[]>();
  for (const block of used) {
    const at = block.parent ?? root;
    sections.set(at, [...sections.get(at) ?? [], block]);
  }
  for (const [at, kin] of sections) {
    const section = `${GROUP}${def}:${at}`;
    const heading = graph.blocks[at]?.type === HEADING ? graph.blocks[at]!.name : undefined;
    const name = heading ?? "document";
    blocks[section] = { id: section, parent: root, type: BOX, name: counted(name, kin.length),
                        order: ++order, group, w: row_width(kin.length, most) };
    for (const block of kin) {
      const id = `${USED}${block.id}`;
      blocks[id] = { id, parent: root, of: block.id, order: ++order, group: section };
    }
  }
  edges[`${MEMBER}:${centre}`] = { id: `${MEMBER}:${centre}`, from: centre, to: group,
                                   type: MEMBER };
  return drawn;
}

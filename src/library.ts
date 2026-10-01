/** The library projected: the explorer's packages and definitions, drawn as diagrams.
 *
 *  Each library row is one layer. `packages` draws a box per package of the definitions it holds;
 *  a package, or `definitions`, draws a box per group its shelf files them in, then its unfiled
 *  blocks and relations, each definition a card, `across` cards to a row. One definition opened
 *  is its own layer: what it extends over it and a box of its usages under it. Drawn, never
 *  stored: the shelves are the one source, as the explorer lists them.
 *
 *  The document's own projection, the page, is `read.ts`'s. */

import type { Pointed } from "@mnd/kit/react";
import { BASE_PACKAGE, UNITS, box_of, packages, project, set_card, set_full, shelf_of,
         type Block, type Graph, type Id } from "@mnd/kit";

/** A library section, as the explorer points at one: `packages`, a package, or `definitions`. */
export type Shelf = Extract<Pointed, { of: "defs" }>;

/** A projection of the library: the section it is of, or with `local` named, that one definition
 *  with what it extends and where it is used. */
export type Chart = { at: Shelf; local?: Id };

/** What names a definition's card, a usage's, and a box of them. */
export const DEFINED = "defined:";
const USED = "used:";
const GROUP = "group:";

/** What a drawing's boxes are: a group of its own, so none is counted as a usage of the kit's. */
const BOX = "chart.box";

/** The relations a projection draws that no package defines: a definition built on another, and
 *  its usages pointing to it. */
const EXTENDS = "extends";
const USES = "uses";

/** The definitions a projection draws with, beside the graph's own. */
const DRAWN = {
  [BOX]: { id: BOX, group: "block" as const, extends: "group", name: "box" },
  [EXTENDS]: { id: EXTENDS, group: "relation" as const, extends: "line", name: "extends" },
  [USES]: { id: USES, group: "relation" as const, extends: "line", name: "uses" },
};

/** Where a projection keeps the document's own blocks, out of its drawing. */
const HELD = "@held";

/** The two library sections, as the explorer points at them. */
const PACKAGES: Shelf = { of: "defs", only: "packages" };
const DEFINITIONS: Shelf = { of: "defs", only: "all" };


/** A projection drawn: a library section, or one definition opened, `across` cards wide. */
export function charted(graph: Graph, chart: Chart, card: { w: number; h: number },
                        full: boolean, across: number): Graph {
  set_card(card.w, card.h);
  set_full(full);
  return chart.local ? local(graph, chart.local, across) : boxed(graph, chart.at, across);
}

/** The section a definition is drawn on: its package, or the workspace's definitions. */
export function home_of(graph: Graph, def: Id): Shelf {
  const pack = graph.defs[def]?.from;
  return pack ? { ...PACKAGES, from: graph.packages[pack]?.name ?? pack } : DEFINITIONS;
}

/** The package a box on `packages` stands for, as the explorer points at it. */
export function boxed_pack(graph: Graph, id: Id): Shelf | null {
  const pack = id.startsWith(GROUP) ? graph.packages[id.slice(GROUP.length)] : undefined;
  return pack ? { ...PACKAGES, from: pack.name } : null;
}

/** The section one up from this one: a package's is `packages`; the top has none. */
export function up_of(at: Shelf): Shelf | null {
  return at.only === "packages" && at.from ? PACKAGES : null;
}

/** What a section is called in the crumbs. */
export function label_of(at: Shelf): string {
  return at.from ?? (at.only === "packages" ? "packages" : "definitions");
}

/** How wide a projection `across` cards wide reads: a box's widest row. */
export function chart_width(across: number): number {
  return row_width(across, across);
}


/** A section drawn as its boxes, down the page: on `packages` a box per package holding a box per
 *  group it files, else a box per group its shelf files, then its unfiled blocks and relations.
 *  Each box is named with how many it holds, and each definition is a card in it. */
function boxed(graph: Graph, at: Shelf, across: number): Graph {
  const blocks = aside(graph);
  const all = at.only === "packages" && !at.from;
  const pack = at.from ? packages(graph).find((each) => each.name === at.from)?.from : undefined;
  const tops = all ? packages(graph).map((each) => `${GROUP}${each.from}`) : [];
  let order = 0;

  /** A box of definitions, or of boxes, named with how many definitions it holds. */
  const box = (id: Id, name: string, held: number, w: number, group?: Id) => {
    blocks[id] = { id, parent: graph.root, type: BOX, order: ++order, name: counted(name, held), w,
                   ...(group ? { group } : {}) };
  };
  const shelf = (from: Id | undefined, group?: Id) => {
    for (const each of shelved(graph, from)) {
      box(each.id, each.name, each.defs.length, row_width(Math.max(1, each.defs.length), across),
          group);
      if (!group) tops.push(each.id);
      for (const def of each.defs) {
        const id = `${DEFINED}${def}`;
        blocks[id] = { id, parent: graph.root, order: ++order, group: each.id, ...def_card(graph, def) };
      }
    }
  };
  if (all) {
    for (const each of packages(graph)) {
      const id = `${GROUP}${each.from}`;
      box(id, each.name, each.defs.length, row_width(across, across));
      shelf(each.from, id);
    }
  } else shelf(pack);

  // Measured as the kit lays them, then stacked down the page a card's height apart.
  const drawn: Graph = { ...graph, blocks, defs: { ...graph.defs, ...DRAWN } };
  const sizes = new Map(project(drawn, null).nodes.map((node) => [node.id, box_of(node)]));
  let y = 0;
  for (const id of tops) {
    blocks[id] = { ...blocks[id]!, x: 0, y };
    y += (sizes.get(id)?.h ?? 0) + UNITS.block.h * UNITS.unit;
  }
  return drawn;
}

/** A shelf's definitions in its groups, in order: each group it files, then its unfiled blocks and
 *  relations. The workspace's, or with `pack` named, that package's. */
function shelved(graph: Graph, pack?: Id): { id: Id; name: string; defs: Id[] }[] {
  const shelf = shelf_of(graph, pack);
  const box = (key: string) => `${GROUP}${pack ?? ""}:${key}`;
  const groups = shelf.filter((entry) => entry.name !== undefined)
    .map((entry) => ({ id: box(entry.id), name: entry.name!, defs: [] as Id[] }));
  const loose = (["block", "relation"] as const)
    .map((kind) => ({ id: box(kind), name: `${kind}s`, defs: [] as Id[], kind }));
  for (const entry of shelf) {
    if (entry.name !== undefined || !graph.defs[entry.id]) continue;
    const into = entry.in && groups.find((each) => each.id === box(entry.in!));
    (into || loose.find((each) => each.kind === entry.group)!).defs.push(entry.id);
  }
  return [...groups, ...loose].filter((each) => each.defs.length);
}

/** The document's blocks a definition is used by, in order: those it types, and those tagged
 *  with it. */
function uses(graph: Graph, def: Id): Block[] {
  return Object.values(graph.blocks)
    .filter((block) => block.type === def || block.tags?.includes(def))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

/** How wide a box is to hold this many cards in a row, wrapping past `most`. */
function row_width(count: number, most: number): number {
  const row = Math.min(count, most);
  const air = UNITS.unit;
  return row * UNITS.block.w * air + (row - 1) * UNITS.gap * air;
}

/** A name with how many it holds, as a box is named: `prose (3)`. */
function counted(name: string, n: number): string {
  return `${name} (${n})`;
}

/** A definition's card: named with how often the document uses it, where it types or tags
 *  blocks. A base the app ships types none of them itself, so it says nothing. */
function def_card(graph: Graph, def: Id): Partial<Block> {
  const d = graph.defs[def];
  const n = uses(graph, def).length;
  return { of: def, ...(d?.group === "block" && d.from !== BASE_PACKAGE
    ? { name: `${d.name} (${n} ${n === 1 ? "usage" : "usages"})` } : {}) };
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

/** One definition opened: its card in the middle, over it what it extends, each link of the
 *  chain over the one it is built on, and under it a box of its usages, `across` to a row,
 *  pointing up to it. */
function local(graph: Graph, def: Id, across: number): Graph {
  const blocks = aside(graph);
  const edges: Graph["edges"] = {};
  const root = graph.root;
  const air = UNITS.unit;
  const card = { w: UNITS.block.w * air, h: UNITS.block.h * air };
  const rise = card.h + air * 3;
  const used = uses(graph, def);
  const wide = row_width(Math.max(1, Math.min(used.length, across)), across);
  const x = (wide - card.w) / 2;
  let order = 0;

  // The chain: the definition first, and each it extends over it, centred over its usages.
  const chain: Id[] = [];
  for (let at: Id | undefined = def; at && graph.defs[at] && !chain.includes(at);
       at = graph.defs[at]!.extends) chain.push(at);
  const top = (chain.length - 1) * rise;
  chain.forEach((link, n) => {
    const id = `${DEFINED}${link}`;
    blocks[id] = { id, parent: root, of: link, order: ++order, x, y: top - n * rise, ...card };
    if (!n) return;
    const from = `${DEFINED}${chain[n - 1]}`;
    edges[`${EXTENDS}:${from}`] = { id: `${EXTENDS}:${from}`, from, to: id, type: EXTENDS,
                                    dir: "forward" };
  });

  // Its usages under it, in one box pointing up to it: set a gap left, as the kit pads a box.
  const centre = `${DEFINED}${def}`;
  blocks[centre] = { ...blocks[centre]!, ...def_card(graph, def) };
  const drawn: Graph = { ...graph, blocks, edges, defs: { ...graph.defs, ...DRAWN } };
  if (!used.length) return drawn;
  const group = `${GROUP}${def}`;
  blocks[group] = { id: group, parent: root, type: BOX, name: counted("usages", used.length),
                    order: ++order, w: wide, x: -UNITS.gap * air, y: top + rise };
  for (const block of used) {
    const id = `${USED}${block.id}`;
    blocks[id] = { id, parent: root, of: block.id, order: ++order, group };
  }
  edges[`${USES}:${group}`] = { id: `${USES}:${group}`, from: group, to: centre, type: USES,
                                dir: "forward" };
  return drawn;
}

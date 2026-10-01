/** The library projected: the explorer's packages and definitions, drawn as diagrams.
 *
 *  Each library section is one drawing, as the page is for usages, and its rows only move the pick
 *  on it. `packages` draws a box per package holding a box per group it files, each definition a
 *  card, `across` cards to a row. `definitions` projects the document's usages by kind, as the page
 *  does by section: a box per kind headed by its card, inside it a box per definition it takes,
 *  headed by that definition's card, its usages flowing beside it in reading order. Drawn, never
 *  stored: the shelves and the kinds are the one source, as the explorer lists them.
 *
 *  The document's own projection, the page, is `read.ts`'s. */

import type { Pointed } from "@mnd/kit/react";
import { BASE_PACKAGE, UNITS, allows_of, box_of, packages, project, set_card, set_full, shelf_of,
         type Block, type Graph, type Id } from "@mnd/kit";
import { staircase } from "./backbone.js";
import { FLOW } from "./packages/markdown.js";

/** A library section, as the explorer points at one: `packages`, a package, or `definitions`. A
 *  chart is only ever of a section; a package is a box on `packages`. */
export type Shelf = Extract<Pointed, { of: "defs" }>;

/** A projection of the library: the section it is of. */
export type Chart = { at: Shelf };

/** What names a definition's card, a usage's, and a box of them. */
export const DEFINED = "defined:";
const USED = "used:";
const GROUP = "group:";

/** What a drawing's boxes are: a group of its own, so none is counted as a usage of the kit's,
 *  headed by whatever comes first in it. */
const BOX = "chart.box";
const DRAWN = {
  [BOX]: { id: BOX, group: "block" as const, extends: "group", name: "box",
           components: { allows: { heads: true } } },
};

/** Where a projection keeps the document's own blocks, out of its drawing. */
const HELD = "@held";

/** The two library sections, as the explorer points at them. */
const PACKAGES: Shelf = { of: "defs", only: "packages" };
const DEFINITIONS: Shelf = { of: "defs", only: "all" };


/** A projection drawn: a library section, `across` cards wide. */
export function charted(graph: Graph, chart: Chart, card: { w: number; h: number },
                        full: boolean, across: number): Graph {
  set_card(card.w, card.h);
  set_full(full);
  return chart.at.only === "packages" ? boxed(graph, across) : projected(graph, across);
}

/** The section a definition's row is drawn on: the one it is listed in, else `packages` for a
 *  package's and `definitions` for the workspace's. */
export function home_of(graph: Graph, def: Id, only?: Shelf["only"]): Shelf {
  if (only) return only === "packages" ? PACKAGES : DEFINITIONS;
  return graph.defs[def]?.from ? PACKAGES : DEFINITIONS;
}

/** Whether `definitions` draws a definition: a kind, or one a kind takes. */
export function projects(graph: Graph, def: Id): boolean {
  return kinds(graph).some((kind) => kind.id === def || kind.members.includes(def));
}

/** The section a library row is drawn on: a package's is `packages`. */
export function chart_of(at: Shelf): Shelf {
  return at.only === "packages" ? PACKAGES : DEFINITIONS;
}

/** The `definitions` section. */
export function definitions(): Shelf {
  return DEFINITIONS;
}

/** A package's box on `packages`, as the explorer points at the package. */
export function pack_box(graph: Graph, at: Shelf): Id | null {
  const pack = at.from ? packages(graph).find((each) => each.name === at.from) : undefined;
  return pack ? `${GROUP}${pack.from}` : null;
}

/** The package a box on `packages` stands for, as the explorer points at it. */
export function boxed_pack(graph: Graph, id: Id): Shelf | null {
  const pack = id.startsWith(GROUP) ? graph.packages[id.slice(GROUP.length)] : undefined;
  return pack ? { ...PACKAGES, from: pack.name } : null;
}

/** What a section is called in the crumbs. */
export function label_of(at: Shelf): string {
  return at.only === "packages" ? "packages" : "definitions";
}

/** How wide a projection `across` cards wide reads: a box's widest row. */
export function chart_width(across: number): number {
  return row_width(across, across);
}


/** `packages` drawn as its boxes, down the page: a box per package holding a box per group it
 *  files, then its unfiled blocks and relations. Each box is named with how many it holds, and
 *  each definition is a card in it. */
function boxed(graph: Graph, across: number): Graph {
  const blocks = aside(graph);
  const tops = packages(graph).map((each) => `${GROUP}${each.from}`);
  let order = 0;

  /** A box of definitions, or of boxes, named with how many definitions it holds. */
  const box = (id: Id, name: string, held: number, w: number, group?: Id) => {
    blocks[id] = { id, parent: graph.root, type: BOX, order: ++order, name: counted(name, held), w,
                   ...(group ? { group } : {}) };
  };
  for (const pack of packages(graph)) {
    const id = `${GROUP}${pack.from}`;
    box(id, pack.name, pack.defs.length, row_width(across, across));
    for (const each of shelved(graph, pack.from)) {
      box(each.id, each.name, each.defs.length, row_width(Math.max(1, each.defs.length), across),
          id);
      for (const def of each.defs) {
        const card = `${DEFINED}${def}`;
        blocks[card] = { id: card, parent: graph.root, order: ++order, group: each.id,
                         ...def_card(graph, def) };
      }
    }
  }

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

/** `definitions` drawn as the document's usages by kind, as the page draws them by section: a box
 *  per kind headed by its card, inside it a box per definition it takes, headed by that one's card,
 *  its usages beside it in reading order. */
function projected(graph: Graph, across: number): Graph {
  const blocks = aside(graph);
  const counts = new Map<Id, number>();
  let order = 0;
  const add = (block: Omit<Block, "parent" | "order">) => {
    blocks[block.id] = { ...block, parent: graph.root, order: ++order } as Block;
  };
  for (const kind of kinds(graph)) {
    const box = `${GROUP}${kind.id}`;
    add({ id: box, type: BOX });
    add({ id: `${DEFINED}${kind.id}`, group: box, ...def_card(graph, kind.id) });
    counts.set(box, kind.members.length);
    for (const def of kind.members) {
      const sub = `${GROUP}${kind.id}:${def}`;
      add({ id: sub, type: BOX, group: box });
      add({ id: `${DEFINED}${def}`, group: sub, ...def_card(graph, def) });
      for (const block of uses(graph, def).filter((each) => each.type === def)) {
        add({ id: `${USED}${block.id}`, of: block.id, group: sub });
      }
    }
  }
  const drawn: Graph = { ...graph, blocks, defs: { ...graph.defs, ...DRAWN } };
  return staircase(drawn, across, FLOW, (group, n) => counts.has(group.id)
    ? `kind (${counts.get(group.id)} definitions)` : `definition (${n} usages)`);
}

/** The workspace's kinds, as it files them: each with the definitions it takes as members. */
function kinds(graph: Graph): { id: Id; members: Id[] }[] {
  return shelf_of(graph).filter((entry) => entry.name === undefined && graph.defs[entry.id])
    .map((entry) => ({ id: entry.id, members: allows_of(graph, entry.id).members }))
    .filter((kind): kind is { id: Id; members: Id[] } => Array.isArray(kind.members));
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

/** The held graph, back in reading order: its rows, and its markdown.
 *
 *  Both walk the graph as it is now, not as it was read, so a block moved in
 *  the explorer is read in its new place. A row is a backbone block and the
 *  content beside it, read from the drawn graph; stepping through the rows is
 *  stepping through the page. The markdown is read from the held outline. */

import { children, type Block, type Graph, type Id } from "@mnd/kit";
import { FRONT, HEADING, TABLE } from "./packages/markdown.js";

/** One row of the page: the layer it sits on, its backbone block, its cards left to right, and
 *  every block it covers. */
export interface Row {
  layer: Id;
  anchor: Id;
  cards: Id[];
  covers: Set<Id>;
}

/** One block's markdown, as the page writes it. A table also carries its cells, header first, and
 *  a heading its level. */
export interface Segment {
  id: Id;
  text: string;
  cells?: string[][];
  level?: number;
}

/** The deepest heading markdown writes. */
const LEVELS = 6;


/** Whether a block starts a row of its own: a backbone block, or a grid — too wide to sit in a
 *  row — and whatever follows one. */
export function breaks(block: Block, before: Block | undefined): boolean {
  return is_spine(block) || !!block.grid || !!before?.grid;
}

/** Every block a pick covers: each picked block and all it holds. */
export function covered(graph: Graph, picked: readonly Id[]): Set<Id> {
  return new Set(picked.flatMap((id) => under(graph, id)));
}

/** Whether a block sits in the backbone column rather than in a row: a heading, the front matter,
 *  or the layer's own block standing in at its head. */
export function is_spine(block: Block): boolean {
  return [HEADING, FRONT].includes(block.type ?? "") || block.of === block.parent;
}

/** A layer's rows, top to bottom. A heading that is a layer of its own covers its whole section;
 *  a layer with no backbone — a container, a folder — is a row per block. */
export function rows(graph: Graph, layer: Id): Row[] {
  const held = children(graph, layer);
  const spined = held.some(is_spine);
  const out: Row[] = [];
  held.forEach((block, n) => {
    const row = out[out.length - 1];
    // Content joins the row before it, with all it holds.
    if (spined && row && !breaks(block, held[n - 1])) {
      row.cards.push(block.id);
      for (const id of under(graph, block.id)) row.covers.add(id);
      return;
    }
    out.push({ layer, anchor: block.id, cards: [block.id], covers: new Set(under(graph, block.id)) });
  });
  return out;
}

/** The document as markdown, one segment per block that writes any, in reading order. A heading's
 *  level is how deep it is nested under headings, so moving one in the explorer re-levels it. */
export function segments(graph: Graph, layer: Id = graph.root, depth = 0): Segment[] {
  const out: Segment[] = [];
  for (const block of children(graph, layer)) {
    const level = block.type === HEADING ? Math.min(depth + 1, LEVELS) : 0;
    const cells = block.type === TABLE ? cells_of(graph, block.id) : null;
    const text = cells ? table_text(cells)
      : level ? `${"#".repeat(level)} ${block.name ?? ""}` : markdown_of(block);
    if (text) out.push({ id: block.id, text, ...(cells ? { cells } : {}), ...(level ? { level } : {}) });
    out.push(...segments(graph, block.id, level || depth));
  }
  return out;
}


/** A table's cells, from its grid: the schema's fields as its header, a line per row of values. */
function cells_of(graph: Graph, id: Id): string[][] | null {
  const grid = graph.blocks[id]?.grid;
  const fields = grid?.schema ? graph.defs[grid.schema]?.fields ?? [] : [];
  if (!grid || !fields.length) return null;
  const values = (grid.values ?? []).slice(1).map((row) => fields.map((_, n) => row[n] ?? ""));
  return [fields.map((field) => field.name), ...values];
}

/** What one block writes. */
function markdown_of(block: Block): string {
  if (block.type === FRONT) return `---\n${block.body ?? ""}\n---`;
  return (block.body ?? "").trim();
}

/** A table's cells as the page writes them. */
function table_text(cells: string[][]): string {
  const line = (row: string[]) => `| ${row.join(" | ")} |`;
  const [head = [], ...body] = cells;
  return [line(head), line(head.map(() => "---")), ...body.map(line)].join("\n");
}

/** A block and everything under it. */
function under(graph: Graph, id: Id): Id[] {
  return [id, ...children(graph, id).flatMap((block) => under(graph, block.id))];
}

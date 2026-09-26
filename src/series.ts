/** The held graph, back in reading order: its rows, and its markdown.
 *
 *  Both walk the graph as it is now, not as it was read, so a block moved in
 *  the explorer is read in its new place. A row is a backbone block and the
 *  content beside it; stepping through the rows is stepping through the page. */

import { children, type Block, type Graph, type Id } from "@mnd/kit";
import { FRONT, HEADING, LEAD, MORE, TABLE } from "./packages/markdown.js";

/** One row of the page: the layer it sits on, its backbone block, its cards left to right, and
 *  every block it covers. */
export interface Row {
  layer: Id;
  anchor: Id;
  cards: Id[];
  covers: Set<Id>;
}

/** One block's markdown, as the page writes it. A table also carries its cells, header first. */
export interface Segment {
  id: Id;
  text: string;
  cells?: string[][];
}


/** A layer's rows, top to bottom. A heading that is a layer of its own covers its whole section;
 *  a layer with no backbone — a container, a folder — is a row per block. */
export function rows(graph: Graph, layer: Id): Row[] {
  const held = children(graph, layer);
  const spined = held.some(is_spine);
  // A table writes its grid as its own, so reading inside it reads the table.
  const within = graph.blocks[layer]?.type === TABLE ? [layer] : [];
  const out: Row[] = [];
  for (const block of held) {
    const row = out[out.length - 1];
    // Content joins the row before it, with all it holds.
    if (spined && !is_spine(block)) {
      row?.cards.push(block.id);
      if (row) for (const id of under(graph, block.id)) row.covers.add(id);
      continue;
    }
    const covers = new Set([...within, ...under(graph, block.id)]);
    out.push({ layer, anchor: block.id, cards: [block.id], covers });
  }
  return out;
}

/** The document as markdown, one segment per block that writes any, in reading order. */
export function segments(graph: Graph, layer: Id = graph.root): Segment[] {
  const out: Segment[] = [];
  for (const block of children(graph, layer)) {
    const cells = block.type === TABLE ? cells_of(graph, block.id) : null;
    const text = cells ? table_text(cells) : markdown_of(block);
    if (text) out.push({ id: block.id, text, ...(cells ? { cells } : {}) });
    if (block.type !== TABLE) out.push(...segments(graph, block.id));
  }
  return out;
}


/** A table's cells, from its grid: the schema's fields as its header, a line per row of values. */
function cells_of(graph: Graph, id: Id): string[][] | null {
  const grid = children(graph, id).find((block) => block.grid)?.grid;
  const fields = grid?.schema ? graph.defs[grid.schema]?.fields ?? [] : [];
  if (!grid || !fields.length) return null;
  const values = (grid.values ?? []).slice(1).map((row) => fields.map((_, n) => row[n] ?? ""));
  return [fields.map((field) => field.name), ...values];
}

/** Whether a block sits in the backbone column rather than in a row. */
function is_spine(block: Block): boolean {
  return [HEADING, FRONT, LEAD].includes(block.type ?? "");
}

/** What one block writes. A container and a lead write nothing of their own. */
function markdown_of(block: Block): string {
  if (block.type === MORE || block.type === LEAD) return "";
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

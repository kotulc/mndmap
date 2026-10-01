/** The held graph, back in reading order: what a pick covers, and the document's markdown.
 *
 *  Both walk the graph as it is now, not as it was read, so a block moved in the explorer is read
 *  in its new place. A section covers every block grouped in it, however deep. */

import { children, type Block, type Graph, type Id } from "@mnd/kit";
import { marked, type Tokens } from "marked";
import { FRONT, HEADING, IMAGE, SECTION, TABLE } from "./packages/markdown.js";

/** One block's markdown, as the page writes it. A table also carries its cells, header first, and
 *  a section its heading's level. */
export interface Segment {
  id: Id;
  text: string;
  cells?: string[][];
  level?: number;
  /** Where an image lives, which the kit's markdown does not draw. */
  image?: string;
}

/** The deepest heading markdown writes. */
const LEVELS = 6;


/** Every block a pick covers: each picked block, and all a picked section groups. */
export function covered(graph: Graph, picked: readonly Id[]): Set<Id> {
  return new Set(picked.flatMap((id) => members(graph, id)));
}

/** The section a block sits in, where it sits in one. */
export function section_of(graph: Graph, id: Id | undefined): Id | null {
  const group = graph.blocks[id ?? ""]?.group;
  return graph.blocks[group ?? ""]?.type === SECTION ? group! : null;
}

/** The document as markdown, one segment per block that writes any, in reading order. A heading's
 *  level is how deep its section sits, so moving one re-levels it; a section writes nothing of its
 *  own. */
export function segments(graph: Graph, layer: Id = graph.root): Segment[] {
  return children(graph, layer).flatMap((block): Segment[] => {
    if (block.type === SECTION) return [];
    const level = block.type === HEADING ? Math.min(depth(graph, block.id), LEVELS) : 0;
    const cells = block.type === TABLE ? cells_of(block) : null;
    const text = cells ? table_text(cells)
      : level ? `${"#".repeat(level)} ${(block.body ?? "").replace(/^#+\s*/, "")}`
      : markdown_of(block);
    const image = block.type === IMAGE && block.source ? { image: block.source } : {};
    const own = text ? [{ id: block.id, text, ...(cells ? { cells } : {}),
                          ...(level ? { level } : {}), ...image }] : [];
    return [...own, ...segments(graph, block.id)];
  });
}


/** A block and every block grouped in it, however deep. */
function members(graph: Graph, id: Id): Id[] {
  const held = Object.values(graph.blocks).filter((block) => block.group === id);
  return [id, ...held.flatMap((block) => members(graph, block.id))];
}

/** How many sections a block sits in. */
function depth(graph: Graph, id: Id): number {
  const up = section_of(graph, id);
  return up ? 1 + depth(graph, up) : 0;
}

/** A table's cells: its header as the page wrote it, a line per row of its grid's values. */
function cells_of(block: Block): string[][] | null {
  const grid = block.grid;
  const fields = block.fields ?? [];
  if (!grid || !fields.length) return null;
  const values = (grid.values ?? []).slice(1).map((row) => fields.map((_, n) => row[n] ?? ""));
  return [head_of(block.body, fields.map((field) => field.name)), ...values];
}

/** A table's header as written, where its body still has one a cell per field; else its names. */
function head_of(body: string | undefined, names: string[]): string[] {
  const [token] = marked.lexer(body ?? "");
  const cells = token?.type === "table" ? (token as Tokens.Table).header.map((cell) => cell.text) : [];
  return cells.length === names.length ? cells : names;
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

/** The held graph, back in reading order: what a pick covers, and the document's markdown.
 *
 *  Both walk the graph as it is now, not as it was read, so a block moved in the explorer is read
 *  in its new place. A section covers every block grouped in it, however deep. */

import { children, type Block, type Graph, type Id } from "@mnd/kit";
import { HEADING, SECTION } from "./packages/markdown.js";

/** One block's markdown, as the page writes it, and a heading's level. */
export interface Segment {
  id: Id;
  text: string;
  level?: number;
}

/** The deepest heading markdown writes. */
const LEVELS = 6;


/** Every block a pick covers: each picked block, and all a picked section groups. */
export function covered(graph: Graph, picked: readonly Id[]): Set<Id> {
  return new Set(picked.flatMap((id) => members(graph, id)));
}

/** The section a block sits in, where it sits in one. */
export function section_of(graph: Graph, id: Id | undefined): Id | null {
  const up = graph.blocks[id ?? ""]?.parent;
  return up && graph.blocks[up]?.type === SECTION ? up : null;
}

/** The document as markdown, one segment per block that writes any, in reading order. A heading's
 *  level is how deep its section sits, so moving one re-levels it; a section writes nothing of its
 *  own. */
export function segments(graph: Graph, layer: Id = graph.root): Segment[] {
  return children(graph, layer).flatMap((block): Segment[] => {
    if (block.type === SECTION) return segments(graph, block.id);
    const level = block.type === HEADING ? Math.min(depth(graph, block.id), LEVELS) : 0;
    const text = level ? `${"#".repeat(level)} ${(block.body ?? "").replace(/^#+\s*/, "")}`
      : written(block);
    const own = text ? [{ id: block.id, text, ...(level ? { level } : {}) }] : [];
    return [...own, ...segments(graph, block.id)];
  });
}


/** A block and every block it holds, however deep. */
function members(graph: Graph, id: Id): Id[] {
  return [id, ...children(graph, id).flatMap((block) => members(graph, block.id))];
}

/** How many sections a block sits in. */
function depth(graph: Graph, id: Id): number {
  const up = section_of(graph, id);
  return up ? 1 + depth(graph, up) : 0;
}

/** What one block writes: its element, as the page wrote it. */
function written(block: Block): string {
  return (block.body ?? "").trim();
}

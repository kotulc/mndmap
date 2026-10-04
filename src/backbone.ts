/** A flat layer laid out as a backbone: its headed groups down the page as a staircase.
 *
 *  Each group is a box holding its head, its other members in rows `across` cards wide beside the
 *  head, and under them its own groups, stepped `INDENT` right. A flow line runs to each head from
 *  its parent's or the sibling's before it, and from a head through its members in order. What
 *  sits in no group reads in a row at the top. The page draws a document so, and stores neither a
 *  place nor a line. */

import { UNITS, children, group_head, headed_group, is_group, size_of, type Block, type Graph,
         type Id } from "@mnd/kit";

/** How far a group's own groups step right inside it, in units, past its box's margin. */
const INDENT = 2;


/** A layer placed as a backbone, its blocks already sized; `line` is the relation its flow lines
 *  are, and `label` names each group's box by how many members sit beside its head. */
export function staircase(graph: Graph, layer: Id, across: number, line: Id,
                          label: (group: Block, n: number) => string): Graph {
  const air = UNITS.unit;
  const gap = UNITS.gap * air;
  const one = { w: UNITS.block.w * air, h: UNITS.block.h * air };
  const wide = across * one.w + (across - 1) * gap;
  /** The column members start in, right of a head. */
  const lane = one.w + air * 2;
  const blocks = { ...graph.blocks };
  const edges = { ...graph.edges };
  const kin = children(graph, layer);
  const size = (id: Id) => size_of(graph, id);
  const put = (id: Id, x: number, y: number) => { blocks[id] = { ...blocks[id]!, x, y }; };
  /** A directed flow line, from one block to the next it reads to. */
  const flow = (from: Id, to: Id) => {
    const id = `${line}:${to}`;
    edges[id] = { id, from, to, type: line, dir: "forward" };
  };

  /** Blocks in a row from `x`, wrapping `across` cards wide back to it, flowed in order from
   *  `from`; how far down they reach. */
  const row = (held: Block[], x: number, y: number, from: Id | null): number => {
    let at = x;
    let top = y;
    let tall = 0;
    for (const block of held) {
      const { w, h } = size(block.id);
      if (at > x && at + w > x + wide) { top += tall + air; at = x; tall = 0; }
      put(block.id, at, top);
      if (from) flow(from, block.id);
      from = block.id;
      at += w + gap;
      tall = Math.max(tall, h);
    }
    return held.length ? top + tall : y;
  };

  /** A group placed by hand from its own corner: its head, its members beside it, and its own
   *  groups under them. How tall it is, inside its box. */
  const group = (id: Id): number => {
    const held = kin.filter((block) => block.group === id);
    const head = held.find((block) => block.id === group_head(graph, id));
    const rest = held.filter((block) => block !== head && !is_group(graph, block.id));
    if (head) put(head.id, 0, 0);
    const reach = row(rest, head ? lane : 0, 0, head?.id ?? null);
    let y = Math.max(head ? size(head.id).h : 0, reach) + air * 2;
    for (const sub of held.filter((block) => is_group(graph, block.id))) {
      const h = group(sub.id);
      put(sub.id, INDENT * air, y);
      y += h + gap * 2 + air * 2;
    }
    blocks[id] = { ...blocks[id]!, arrangement: "free", name: label(graph.blocks[id]!, rest.length) };
    return y - air * 2;
  };

  // What sits in no group in a row at the top, then each group down the page.
  const tops = kin.filter((block) => !block.group && is_group(graph, block.id));
  const heights = new Map(tops.map((block) => [block.id, group(block.id) + gap * 2]));
  const loose = kin.filter((block) => !block.group && !is_group(graph, block.id));
  let y = loose.length ? row(loose, 0, 0, null) + air * 2 : 0;
  for (const block of tops) {
    put(block.id, 0, y);
    y += heights.get(block.id)! + air * 2;
  }

  // The backbone: each head flowed to from its parent's, or the sibling's before it.
  const spine: { id: Id; depth: number }[] = loose[0] ? [{ id: loose[0].id, depth: 0 }] : [];
  for (const block of kin.filter((each) => headed_group(graph, each.id))) {
    const deep = depth(graph, block.id) - 1;
    const from = spine.findLast((each) => each.depth <= deep);
    if (from) flow(from.id, block.id);
    spine.push({ id: block.id, depth: deep });
  }
  return { ...graph, blocks, edges };
}


/** How many groups a block sits in. */
function depth(graph: Graph, id: Id): number {
  const group = graph.blocks[id]?.group;
  return group ? 1 + depth(graph, group) : 0;
}

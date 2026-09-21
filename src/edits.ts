/** The six gestures, as edits on a held graph.
 *
 *  Every gesture is a field written and nothing else: no session, no log and
 *  no actions. An edit that would not validate is refused with the fault and
 *  the graph it was applied to is kept, so the stack never holds a broken
 *  one. */

import { children, validate, type Block, type Graph, type Id } from "@mnd/kit";
import { with_field, PAGE } from "./doc.js";
import type { Suggestions } from "./types.js";


export type Edit =
  /** Re-parent, and land at a place among the new siblings. */
  | { do: "move"; id: Id; parent: Id; at?: number }
  /** Re-order among the siblings it already has. */
  | { do: "order"; id: Id; at: number }
  /** Hold these under one holder in their layer, or let them go. */
  | { do: "group"; ids: Id[]; name: string | null }
  | { do: "rename"; id: Id; name: string }
  | { do: "tag"; id: Id; tags: string[] }
  /** Take one of the sidecar's candidates for a block or a relation. */
  | { do: "pick"; id: Id; of: "name" | "tags" | "group" | "type"; value: string };

export interface Applied {
  graph: Graph;
  faults: string[];
}

/** The front matter key a page's name is written to, so a rename survives
 *  the round trip instead of living only on the block. */
const TITLE = "title";


/** One gesture. The graph handed back is a new one; the one passed in is
 *  untouched, which is what makes the stack cheap. */
export function apply(graph: Graph, edit: Edit): Applied {
  const next = clone(graph);
  const fault = run(next, edit);
  if (fault) return { graph, faults: [fault] };
  const faults = validate(next).map((entry) => entry.what);
  return faults.length ? { graph, faults } : { graph: next, faults: [] };
}

/** A suggestion turned into the gesture that takes it. */
export function take(
  suggestions: Suggestions,
  id: Id,
  of: "name" | "tags" | "group" | "type",
  at = 0,
): Edit | null {
  const value = suggestions[id]?.[of]?.[at];
  return value === undefined ? null : { do: "pick", id, of, value };
}


function run(graph: Graph, edit: Edit): string | null {
  switch (edit.do) {
    case "move": {
      const block = graph.blocks[edit.id];
      if (!block) return `nothing here is called ${edit.id}`;
      if (!graph.blocks[edit.parent]) return `there is nowhere called ${edit.parent}`;
      if (holds(graph, edit.id, edit.parent)) return `${name_of(graph, edit.id)} cannot hold itself`;
      block.parent = edit.parent;
      /** A block that leaves its layer leaves the holder it sat in. */
      delete block.group;
      delete block.cell;
      seat(graph, edit.parent, edit.id, edit.at);
      return null;
    }
    case "order": {
      const block = graph.blocks[edit.id];
      if (!block?.parent) return `nothing here is called ${edit.id}`;
      seat(graph, block.parent, edit.id, edit.at);
      return null;
    }
    case "group": {
      for (const id of edit.ids) if (!graph.blocks[id]) return `nothing here is called ${id}`;
      if (edit.name === null) {
        for (const id of edit.ids) delete graph.blocks[id]!.group;
        return null;
      }
      const parent = graph.blocks[edit.ids[0]!]?.parent;
      if (!parent) return "a group needs a layer to sit in";
      /** A holder is not a block: it is drawn in the layer and holds what
       *  sits there without owning it. */
      const id = `held:${edit.ids[0]}`;
      graph.holders[id] = {
        id, parent, of: parent, name: edit.name, arrangement: "free",
        order: children(graph, parent).length + 1,
      };
      for (const each of edit.ids) graph.blocks[each]!.group = id;
      return null;
    }
    case "rename": {
      const block = graph.blocks[edit.id];
      if (!block) return `nothing here is called ${edit.id}`;
      if (!edit.name.trim()) return "a name cannot be blank";
      block.name = edit.name;
      /** A page's name is its front matter title, so a rename lands there. */
      if (block.type === PAGE) {
        block.fields = with_field(block.fields, { name: TITLE, form: "text", value: edit.name });
      }
      return null;
    }
    case "tag": {
      const block = graph.blocks[edit.id];
      if (!block) return `nothing here is called ${edit.id}`;
      const tags = [...new Set(edit.tags.map((tag) => tag.trim()).filter(Boolean))];
      if (tags.length) block.tags = tags; else delete block.tags;
      return null;
    }
    case "pick": {
      if (edit.of === "type") {
        const relation = graph.edges[edit.id];
        if (!relation) return `nothing here is called ${edit.id}`;
        relation.type = edit.value;
        /** Retyped, so the body no longer says all of what it means. */
        relation.tags = (relation.tags ?? []).filter((tag) => tag !== "body");
        return null;
      }
      if (edit.of === "name") return run(graph, { do: "rename", id: edit.id, name: edit.value });
      if (edit.of === "tags") {
        const held = graph.blocks[edit.id];
        if (!held) return `nothing here is called ${edit.id}`;
        return run(graph, { do: "tag", id: edit.id, tags: [...held.tags ?? [], edit.value] });
      }
      return run(graph, { do: "group", ids: [edit.id], name: edit.value });
    }
  }
}


/** Put a block at a place among its siblings, and renumber the rest around
 *  it so the order the emitter reads is the order the tree shows. */
function seat(graph: Graph, parent: Id, id: Id, at?: number): void {
  const held = children(graph, parent).filter((block) => block.id !== id).map((block) => block.id);
  const landing = at === undefined || at < 0 || at > held.length ? held.length : at;
  held.splice(landing, 0, id);
  held.forEach((each, index) => { graph.blocks[each]!.order = index + 1; });
}

/** Whether moving into `parent` would put a block inside itself. */
function holds(graph: Graph, id: Id, parent: Id): boolean {
  let at: Id | null = parent;
  while (at) {
    if (at === id) return true;
    const block: Block | undefined = graph.blocks[at];
    at = block?.parent ?? null;
  }
  return false;
}

function name_of(graph: Graph, id: Id): string {
  return graph.blocks[id]?.name ?? id;
}

function clone(graph: Graph): Graph {
  const copied = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).map(([id, held]) => [id, { ...held }]));
  return {
    root: graph.root,
    blocks: copied(graph.blocks),
    edges: copied(graph.edges),
    holders: copied(graph.holders),
    defs: graph.defs,
    packages: graph.packages,
  };
}


/** The graphs behind the one being looked at. Bounded, because a run is one
 *  sitting and nothing is kept between them. */
export class Stack {
  private readonly held: Graph[] = [];
  private readonly cap: number;

  constructor(cap = 50) {
    this.cap = cap;
  }

  push(graph: Graph): void {
    this.held.push(graph);
    if (this.held.length > this.cap) this.held.shift();
  }

  pop(): Graph | undefined {
    return this.held.pop();
  }

  get depth(): number {
    return this.held.length;
  }
}

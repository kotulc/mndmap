/** Tree gestures, as edits on a held graph.
 *
 *  Every gesture is a field written and nothing else. An edit that would not
 *  validate is refused with the fault and the graph it was applied to is kept,
 *  so the stack never holds a broken one. */

import { children, validate, type Block, type Graph, type Id } from "@mnd/kit";

export type Edit =
  /** Re-parent, and land at a place among the new siblings. */
  | { do: "move"; id: Id; parent: Id; at?: number }
  /** Re-order among the siblings it already has. */
  | { do: "order"; id: Id; at: number }
  | { do: "rename"; id: Id; name: string }
  /** A file or folder under a parent, named in the explorer. */
  | { do: "create"; parent: Id; name: string; type?: "folder" }
  /** Drop a block and everything it holds. */
  | { do: "delete"; id: Id };

export interface Applied {
  graph: Graph;
  faults: string[];
}


/** One gesture. The graph handed back is a new one; the one passed in is
 *  untouched, which is what makes the stack cheap. */
export function apply(graph: Graph, edit: Edit): Applied {
  const next = clone(graph);
  const fault = run(next, edit);
  if (fault) return { graph, faults: [fault] };
  const faults = validate(next).map((entry) => entry.what);
  return faults.length ? { graph, faults } : { graph: next, faults: [] };
}

function run(graph: Graph, edit: Edit): string | null {
  switch (edit.do) {
    case "move": {
      const block = graph.blocks[edit.id];
      if (!block) return `nothing here is called ${edit.id}`;
      if (!graph.blocks[edit.parent]) return `there is nowhere called ${edit.parent}`;
      if (holds(graph, edit.id, edit.parent)) return `${name_of(graph, edit.id)} cannot hold itself`;
      block.parent = edit.parent;
      seat(graph, edit.parent, edit.id, edit.at);
      return null;
    }
    case "order": {
      const block = graph.blocks[edit.id];
      if (!block?.parent) return `nothing here is called ${edit.id}`;
      seat(graph, block.parent, edit.id, edit.at);
      return null;
    }
    case "rename": {
      const block = graph.blocks[edit.id];
      if (!block) return `nothing here is called ${edit.id}`;
      if (!edit.name.trim()) return "a name cannot be blank";
      block.name = edit.name;
      return null;
    }
    case "create": {
      const parent = graph.blocks[edit.parent];
      if (!parent) return `there is nowhere called ${edit.parent}`;
      const name = edit.name.trim();
      if (!name) return "a name cannot be blank";
      const folder = edit.type === "folder";
      const source = parent.source ? `${parent.source}/${name}` : name;
      const id = mint(graph, `${folder ? "dir" : "file"}:${source}`);
      graph.blocks[id] = {
        id,
        parent: edit.parent,
        type: folder ? "folder" : "block",
        name,
        source,
        order: children(graph, edit.parent).length + 1,
      };
      return null;
    }
    case "delete": {
      if (!graph.blocks[edit.id]) return `nothing here is called ${edit.id}`;
      if (edit.id === graph.root) return "the workspace root cannot be deleted";
      const drop = new Set<Id>();
      const walk = (id: Id) => {
        drop.add(id);
        for (const child of children(graph, id)) walk(child.id);
      };
      walk(edit.id);
      for (const id of drop) delete graph.blocks[id];
      return null;
    }
  }
}


/** Put a block at a place among its siblings, and renumber the rest around it
 *  so the order the tree shows is the order the graph holds. */
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

/** An unused id with this stem, so a second "notes" does not collide. */
function mint(graph: Graph, stem: Id): Id {
  if (!graph.blocks[stem]) return stem;
  let n = 2;
  while (graph.blocks[`${stem}-${n}`]) n += 1;
  return `${stem}-${n}`;
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
  /** Undone graphs, newest last, so a new edit can drop them. */
  private readonly ahead: Graph[] = [];
  private readonly cap: number;

  constructor(cap = 50) {
    this.cap = cap;
  }

  /** Remember the graph an edit replaced. A new edit ends the redo run. */
  push(graph: Graph): void {
    this.ahead.length = 0;
    this.held.push(graph);
    if (this.held.length > this.cap) this.held.shift();
  }

  /** Step back. `current` becomes the redo. */
  undo(current: Graph): Graph | undefined {
    const back = this.held.pop();
    if (!back) return undefined;
    this.ahead.push(current);
    return back;
  }

  /** Step forward again. `current` goes back on the undo stack. */
  redo(current: Graph): Graph | undefined {
    const next = this.ahead.pop();
    if (!next) return undefined;
    this.held.push(current);
    if (this.held.length > this.cap) this.held.shift();
    return next;
  }

  get depth(): number {
    return this.held.length;
  }

  /** How many undone steps a redo would walk. */
  get forward(): number {
    return this.ahead.length;
  }
}

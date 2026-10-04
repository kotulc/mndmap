/** Tree gestures, as edits on a held graph.
 *
 *  Every gesture is a field written and nothing else. Reorganizing is meant to
 *  be free, so only what cannot be done is refused — a block that is not there,
 *  or one moved inside itself — and the graph it was applied to is kept. */

import { children, type Block, type Graph, type Id } from "@mnd/kit";

export type Edit =
  /** Re-parent, and land together, in order, at a place among the new siblings. What is not
   *  grouped by another of them joins the group named, or none. */
  | { do: "move"; ids: Id[]; parent: Id; at?: number; group?: Id | null }
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
  /** The block the gesture leaves in hand: the one made or moved. */
  made: Id | null;
}


/** One gesture. The graph handed back is a new one; the one passed in is
 *  untouched, which is what makes the stack cheap. */
export function apply(graph: Graph, edit: Edit): Applied {
  const next = clone(graph);
  const fault = run(next, edit);
  if (fault) return { graph, faults: [fault], made: null };
  return { graph: next, faults: [], made: made_of(graph, next, edit) };
}

/** What a gesture leaves in hand: the block moved, or the one block that was not there before. */
function made_of(before: Graph, after: Graph, edit: Edit): Id | null {
  if (edit.do === "move") return edit.ids[0] ?? null;
  if (edit.do !== "create") return null;
  return Object.keys(after.blocks).find((id) => !before.blocks[id]) ?? null;
}

function run(graph: Graph, edit: Edit): string | null {
  switch (edit.do) {
    case "move": {
      if (!graph.blocks[edit.parent]) return `there is nowhere called ${edit.parent}`;
      if (edit.group && edit.ids.includes(edit.group)) return "a group cannot hold itself";
      const collected = in_collection(graph, edit.parent);
      for (const id of edit.ids) {
        if (!graph.blocks[id]) return `nothing here is called ${id}`;
        if (holds(graph, id, edit.parent)) return `${name_of(graph, id)} cannot hold itself`;
        /** A file or folder stays in the collection, and content in a document. */
        if (!!graph.blocks[id]!.def !== collected) {
          return graph.blocks[id]!.def ? `${name_of(graph, id)} belongs in the collection`
            : `${name_of(graph, id)} belongs in a document`;
        }
      }
      // What the moved blocks group among themselves stays so; the rest join where they land.
      const top = edit.ids.filter((id) => !edit.ids.includes(graph.blocks[id]!.group ?? ""));
      for (const id of edit.ids) graph.blocks[id]!.parent = edit.parent;
      for (const id of top) {
        if (edit.group) graph.blocks[id]!.group = edit.group;
        else if (edit.group === null) delete graph.blocks[id]!.group;
      }
      const held = children(graph, edit.parent).map((block) => block.id)
        .filter((id) => !edit.ids.includes(id));
      const at = edit.at === undefined || edit.at < 0 || edit.at > held.length ? held.length : edit.at;
      held.splice(at, 0, ...edit.ids);
      held.forEach((id, n) => { graph.blocks[id]!.order = n + 1; });
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
      /** In the collection a file or folder is a definition; inside a document, content. */
      const collected = in_collection(graph, edit.parent);
      graph.blocks[id] = {
        id,
        parent: edit.parent,
        type: folder ? "folder" : "block",
        name,
        source,
        order: children(graph, edit.parent).length + 1,
        ...(collected ? { def: {} } : {}),
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

/** Whether a place is the collection's — its root or a folder in it — rather than a document's. */
function in_collection(graph: Graph, at: Id): boolean {
  const block = graph.blocks[at];
  return block?.parent === null || (!!block?.def && block.type === "folder");
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

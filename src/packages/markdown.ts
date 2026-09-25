/** The markdown package: what each kind of content in a document *is*.
 *
 *  The parser decides where a block starts and stops. This decides what it
 *  means and how it draws — so adding an element is a definition here, not a
 *  branch in the reader. Every definition extends one of the kit's bases, so
 *  a document opens in mndflow with its look already on it. */

import { isa, type Definition, type Graph, type Id } from "@mnd/kit";

/** The package every definition below belongs to. */
export const MD = "md";

export const HEADING = "md.heading";
export const TEXT = "md.text";
export const LIST = "md.list";
export const ITEM = "md.item";
export const CODE = "md.code";
export const QUOTE = "md.quote";
export const TABLE = "md.table";
export const ROW = "md.row";
export const IMAGE = "md.image";
export const RULE = "md.rule";
export const FRONT = "md.front";

/** The one field the package declares: which column of a table names its rows.
 *  Everything else markdown says — a heading's level, a fence's language, a
 *  task's tick — is written in the block's body, as the page writes it. */
export const KEY = "key";


/** Every definition in the package, in reading order. */
export const DEFS: Definition[] = [
  {
    id: HEADING, from: MD, group: "block", extends: "block", name: "heading",
    about: "A section heading. Its level is in its body, as the page writes it.",
  },
  {
    id: TEXT, from: MD, group: "block", extends: "block", name: "text",
    about: "A paragraph of prose, held whole on the block's body.",
  },
  {
    id: LIST, from: MD, group: "block", extends: "folder", name: "list",
    about: "An ordered, unordered or task list. Holds its items.",
  },
  {
    id: ITEM, from: MD, group: "block", extends: "block", name: "item",
    about: "One entry in a list. A task's tick is in its body.",
  },
  {
    id: CODE, from: MD, group: "block", extends: "block", name: "code",
    about: "A fenced block, fence and all. Its language names it."
  },
  {
    id: QUOTE, from: MD, group: "block", extends: "block", name: "quote",
    about: "A block quote, however deeply nested.",
  },
  {
    id: TABLE, from: MD, group: "block", extends: "folder", name: "table",
    about: "A table. Holds one row per record; its key column names each row.",
    fields: [{ name: KEY, form: "text" }],
  },
  {
    id: ROW, from: MD, group: "block", extends: "block", name: "row",
    about: "One record. Each table's header extends this with a field per column.",
  },
  {
    id: IMAGE, from: MD, group: "block", extends: "reference", name: "image",
    about: "An image. Its source is where it lives; its alt text names it.",
  },
  {
    id: RULE, from: MD, group: "block", extends: "note", name: "rule",
    about: "A thematic break.",
  },
  {
    id: FRONT, from: MD, group: "block", extends: "note", name: "front matter",
    about: "The document's own metadata, as it was written.",
  },
];

/** Whether a block's type is a row — `md.row`, or a table's own schema over it. */
export function is_row(graph: Graph, type: Id | undefined): boolean {
  return isa(graph, type).some((d) => d.id === ROW);
}

/** The package as the graph files it. */
export const PACKAGE = { id: MD, name: "markdown" };

/** A graph with the markdown package registered in it. */
export function with_markdown<T extends {
  defs: Record<Id, Definition>;
  packages: Record<Id, { id: Id; name: string }>;
}>(graph: T): T {
  const defs = { ...graph.defs };
  for (const definition of DEFS) defs[definition.id] = definition;
  return { ...graph, defs, packages: { ...graph.packages, [MD]: PACKAGE } };
}

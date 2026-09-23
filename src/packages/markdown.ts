/** The markdown package: what each kind of content in a document *is*.
 *
 *  The parser decides where a block starts and stops. This decides what it
 *  means and how it draws — so adding an element is a definition here, not a
 *  branch in the reader. Every definition extends one of the kit's bases, so
 *  a document opens in mndflow with its look already on it. */

import type { Definition, Id } from "@mnd/kit";

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

/** Fields a block carries, by the definition that declares them. */
export const LEVEL = "level";
export const LANG = "lang";
export const ORDERED = "ordered";
export const DONE = "done";
export const SRC = "src";
export const ALT = "alt";

/** A heading's level, a fence's language — machine fields the tray does not
 *  list as metadata, because the definition already says what they are. */
export const MACHINE = new Set([LEVEL, LANG, ORDERED, DONE, SRC, ALT]);


/** Every definition in the package, in reading order. */
export const DEFS: Definition[] = [
  {
    id: HEADING, from: MD, group: "block", extends: "block", name: "heading",
    about: "A section heading. Its level is a field, not a nesting.",
    fields: [{ name: LEVEL, form: "number", value: "1" }],
  },
  {
    id: TEXT, from: MD, group: "block", extends: "block", name: "text",
    about: "A paragraph of prose, held whole on the block's body.",
  },
  {
    id: LIST, from: MD, group: "block", extends: "folder", name: "list",
    about: "An ordered, unordered or task list. Holds its items.",
    fields: [{ name: ORDERED, form: "flag", value: "false" }],
  },
  {
    id: ITEM, from: MD, group: "block", extends: "block", name: "item",
    about: "One entry in a list. A task item also carries whether it is done.",
    fields: [{ name: DONE, form: "flag" }],
  },
  {
    id: CODE, from: MD, group: "block", extends: "block", name: "code",
    about: "A fenced block. The fence's word is its language.",
    fields: [{ name: LANG, form: "text" }],
  },
  {
    id: QUOTE, from: MD, group: "block", extends: "block", name: "quote",
    about: "A block quote, however deeply nested.",
    fields: [{ name: LEVEL, form: "number", value: "1" }],
  },
  {
    id: TABLE, from: MD, group: "block", extends: "folder", name: "table",
    about: "A table. Holds one row block per record, and names its columns.",
  },
  {
    id: ROW, from: MD, group: "block", extends: "block", name: "row",
    about: "One record: a field per column, named by the table's header.",
  },
  {
    id: IMAGE, from: MD, group: "block", extends: "reference", name: "image",
    about: "An image. It stands for something outside the document.",
    fields: [{ name: SRC, form: "link" }, { name: ALT, form: "text" }],
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

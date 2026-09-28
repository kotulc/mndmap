/** The markdown package: what each kind of content in a document *is*.
 *
 *  The parser decides where a block starts and stops. This decides what it
 *  means and how it draws — so adding an element is a definition here, not a
 *  branch in the reader. Every definition extends one of the kit's bases, so
 *  a document opens in mndflow with its look already on it. */

import { BASE_PACKAGE, type Definition, type Id, type Package } from "@mnd/kit";

/** The package every definition below belongs to. */
export const MD = "md";

export const HEADING = "md.heading";
export const TEXT = "md.text";
export const LIST = "md.list";
export const CODE = "md.code";
export const QUOTE = "md.quote";
export const TABLE = "md.table";
export const COLUMN = "md.column";
export const SCHEMA = "md.schema";
export const IMAGE = "md.image";
export const FRONT = "md.front";
export const FLOW = "md.flow";
export const MEMBER = "md.member";
export const ALLOCATES = "md.allocates";

/* The package declares no fields. What markdown says — a heading's level, a fence's language, a
 * task's tick — is written in the block's body, as the page writes it. A table carries its own:
 * a field per column, with the form its cells read as, and its key column marked. */

/** How each kind of card draws: its icon, and what it shows under its divider. Prose is its body
 *  alone and grows to fit it; a fence or a list keeps its name over its body; a table lists its
 *  columns. */
const ICON = (icon: string) => ({ card: { icon } });
const PROSE = (icon: string) => ({ card: { icon, name: "hide", body: "show", height: "fit" } });
const NAMED = (icon: string) => ({ card: { icon, body: "show", height: "fit" } });
const LISTED = (icon: string) => ({ card: { icon, fields: "show", height: "free" } });


/** Every definition in the package, in reading order. */
export const DEFS: Definition[] = [
  {
    id: HEADING, from: MD, group: "block", extends: "block", name: "heading",
    about: "A section heading. Its level is in its body, as the page writes it.",
    components: { card: { icon: "content_heading", align: "center" } },
  },
  {
    id: TEXT, from: MD, group: "block", extends: "block", name: "text",
    about: "A paragraph of prose, held whole on the block's body.",
    components: PROSE("content_text"),
  },
  {
    id: LIST, from: MD, group: "block", extends: "block", name: "list",
    about: "An ordered, unordered or task list. Its items are its body, as written.",
    components: NAMED("content_list"),
  },
  {
    id: CODE, from: MD, group: "block", extends: "block", name: "code",
    about: "A fenced block, fence and all. Its language names it.",
    components: NAMED("content_code"),
  },
  {
    id: QUOTE, from: MD, group: "block", extends: "block", name: "quote",
    about: "A block quote, however deeply nested.",
    components: PROSE("content_quote"),
  },
  {
    id: TABLE, from: MD, group: "block", extends: "grid", name: "table",
    about: "A table. One grid of its rows' values, headed by their schema; its key column names "
      + "each row.",
    components: LISTED("role_table"),
  },
  {
    id: COLUMN, from: MD, group: "block", extends: "block", name: "column",
    about: "A table's column, as a block type: each distinct column name is one, extending this. "
      + "A header allocates it rather than using it, so it adds no block to the document.",
    components: ICON("header_col"),
  },
  {
    id: SCHEMA, from: MD, group: "block", extends: "block", name: "schema",
    about: "A table's columns and the forms its cells read as, drawn beside it when it is opened. "
      + "Its own, never a definition.",
    components: LISTED("data"),
  },
  {
    id: IMAGE, from: MD, group: "block", extends: "reference", name: "image",
    about: "An image. Its source is where it lives; its alt text names it.",
    components: ICON("content_image"),
  },
  {
    id: FRONT, from: MD, group: "block", extends: "note", name: "frontmatter",
    about: "The document's own metadata, as it was written.",
    components: ICON("data"),
  },
  {
    id: FLOW, from: MD, group: "relation", extends: "line", name: "flow",
    about: "Down the page, from one backbone block to the next.",
    components: { line: { name: "hide" } },
  },
  {
    id: MEMBER, from: MD, group: "relation", extends: "line", name: "member",
    about: "Across a row, from a backbone block through the content it introduces.",
    components: { line: { name: "hide" } },
  },
  {
    id: ALLOCATES, from: MD, group: "relation", extends: "line", name: "allocates",
    about: "From a column's definition to the table whose header allocates it.",
    components: { line: { name: "hide" }, style: { border_style: "dashed" } },
  },
];

/** What each block definition is, for reading them grouped: a document's structure, its prose,
 *  its data, or its media. */
export const KINDS: Record<Id, string> = {
  [HEADING]: "structure", [FRONT]: "structure",
  [TEXT]: "prose", [QUOTE]: "prose", [LIST]: "prose", [CODE]: "prose",
  [TABLE]: "data", [COLUMN]: "data", [SCHEMA]: "data",
  [IMAGE]: "media",
};

/** The package as the graph files it: built on the base package, never written into. */
export const PACKAGE: Package = { id: MD, name: "markdown", extends: BASE_PACKAGE };

/** A graph with the markdown package registered in it. */
export function with_markdown<T extends {
  defs: Record<Id, Definition>;
  packages: Record<Id, Package>;
}>(graph: T): T {
  const defs = { ...graph.defs };
  for (const definition of DEFS) defs[definition.id] = definition;
  return { ...graph, defs, packages: { ...graph.packages, [MD]: PACKAGE } };
}

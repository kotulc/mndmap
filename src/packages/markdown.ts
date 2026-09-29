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

/** The hue each kind paints itself with: each folder of kinds a colour of its own — structure
 *  blue, prose rose, data violet, media yellow — and the kinds in it shades of it, the one most
 *  read strongest. Each stands off the dark ground; plain text, the page's bulk, the least. */
const TINT = (hue: number, intensity = 0.65, more: Record<string, string | number> = {}) =>
  ({ style: { hue, intensity, ...more } });

/** What a kind built on a faint base undoes to stand out as the rest do: a grid's faint name, and
 *  a note's all but clear fill. */
const PLAIN_NAME = { name_contrast: "strong", border_contrast: "soft" };
const SOLID = { fill: "solid", opacity: 1, name_contrast: "strong" };


/** Every definition in the package, in reading order. */
export const DEFS: Definition[] = [
  {
    id: HEADING, from: MD, group: "block", extends: "block", name: "heading",
    about: "A section heading. Its level is in its body, as the page writes it.",
    components: { card: { icon: "content_heading", align: "center" }, ...TINT(235, 0.9) },
  },
  {
    id: TEXT, from: MD, group: "block", extends: "block", name: "text",
    about: "A paragraph of prose, held whole on the block's body.",
    components: { ...PROSE("content_text"), ...TINT(350, 0.6) },
  },
  {
    id: LIST, from: MD, group: "block", extends: "block", name: "list",
    about: "An ordered, unordered or task list. Its items are its body, as written.",
    components: { ...NAMED("content_list"), ...TINT(5, 0.8) },
  },
  {
    id: CODE, from: MD, group: "block", extends: "block", name: "code",
    about: "A fenced block, fence and all. Its language names it.",
    components: { ...NAMED("content_code"), ...TINT(340, 0.95) },
  },
  {
    id: QUOTE, from: MD, group: "block", extends: "block", name: "quote",
    about: "A block quote, however deeply nested.",
    components: { ...PROSE("content_quote"), ...TINT(330, 0.75) },
  },
  {
    id: TABLE, from: MD, group: "block", extends: "grid", name: "table",
    about: "A table. One grid of its rows' values, headed by their schema; its key column names "
      + "each row.",
    components: { ...LISTED("role_table"), ...TINT(285, 0.95, PLAIN_NAME) },
  },
  {
    id: COLUMN, from: MD, group: "block", extends: "block", name: "column",
    about: "A table's column, as a block type: each distinct column name is one, extending this. "
      + "A header allocates it rather than using it, so it adds no block to the document.",
    components: { ...ICON("header_col"), ...TINT(270, 0.75) },
  },
  {
    id: SCHEMA, from: MD, group: "block", extends: "block", name: "schema",
    about: "A table's columns and the forms its cells read as, drawn beside it when it is opened. "
      + "Its own, never a definition.",
    components: { ...LISTED("define"), ...TINT(300, 0.6) },
  },
  {
    id: IMAGE, from: MD, group: "block", extends: "block", name: "image",
    about: "An image. Its source is where it lives, previewed on its card; its alt text names it.",
    components: { card: { icon: "content_image", preview: "show" }, ...TINT(90, 0.85) },
  },
  {
    id: FRONT, from: MD, group: "block", extends: "note", name: "frontmatter",
    about: "The document's own metadata, as it was written.",
    components: { ...ICON("content_front"), ...TINT(220, 0.6, SOLID) },
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

/** How the package files its block definitions: a document's structure, its prose, its data and
 *  its media, a folder each. */
const FOLDERS: [string, Id[]][] = [
  ["structure", [HEADING, FRONT]], ["prose", [TEXT, QUOTE, LIST, CODE]],
  ["data", [TABLE, COLUMN, SCHEMA]], ["media", [IMAGE]],
];

/** The package as the graph files it: built on the base package, never written into, its
 *  definitions filed in its folders. */
export const PACKAGE: Package = {
  id: MD, name: "markdown", extends: BASE_PACKAGE,
  shelf: FOLDERS.flatMap(([name, ids]) => [
    { id: `${MD}:${name}`, group: "block" as const, name },
    ...ids.map((id) => ({ id, group: "block" as const, in: `${MD}:${name}` })),
  ]),
};

/** A graph with the markdown package registered in it. */
export function with_markdown<T extends {
  defs: Record<Id, Definition>;
  packages: Record<Id, Package>;
}>(graph: T): T {
  const defs = { ...graph.defs };
  for (const definition of DEFS) defs[definition.id] = definition;
  return { ...graph, defs, packages: { ...graph.packages, [MD]: PACKAGE } };
}

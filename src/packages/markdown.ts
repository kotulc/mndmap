/** The markdown package: what each kind of content in a document *is*.
 *
 *  The parser decides where a block starts and stops. This decides what it means, how it draws,
 *  and which content group it belongs to — so adding an element is a definition here, not a branch
 *  in the reader. Every definition extends one of the kit's bases, so a document opens in mndflow
 *  with its look already on it.
 *
 *  A package is a vocabulary *and* how it is projected. Its tags say what each kind of content is —
 *  structure, prose, data, media — and every block carries its definition's. */

import { BASE_PACKAGE, type Block, type Definition } from "@mnd/kit";

/** The package every definition below belongs to: its root's id. */
export const MD = "md";

/** The groups that organize the package's domain, by what its definitions are. */
const BLOCKS = `${MD}.blocks`;
const RELATIONS = `${MD}.relations`;
const TAGGED = `${MD}.tags`;

export const DOCUMENT = "md.document";
export const SECTION = "md.section";
export const HEADING = "md.heading";
export const TEXT = "md.text";
export const LIST = "md.list";
export const CODE = "md.code";
export const TABLE = "md.table";
export const IMAGE = "md.image";
export const FRONT = "md.front";
export const FLOW = "md.flow";

/** The package's tags, which say what each kind of content is. */
export const STRUCTURE_TAG = "md.structure";
export const PROSE_TAG = "md.prose";
export const DATA_TAG = "md.data";
export const MEDIA_TAG = "md.media";

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

/** The hue each kind paints itself with: each tag a colour of its own — structure
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
    id: DOCUMENT, parent: MD, group: BLOCKS, type: "block", def: {}, name: "document",
    tags: [STRUCTURE_TAG],
    body: "A markdown file: a root structure whose contents are read under it, as the page "
      + "writes them. Read when it is first opened.",
    settings: { ...ICON("content_lead"), ...TINT(235, 0.5) },
  },
  {
    id: SECTION, parent: MD, group: BLOCKS, type: "group", def: {}, name: "section",
    tags: [STRUCTURE_TAG],
    body: "A heading and what it heads, until a heading as high: a group of its heading, its "
      + "content and its own sections, headed by its heading. Named by the heading as written.",
    settings: { ...ICON("content_heading"), ...TINT(235, 0.9), allows: { heads: [HEADING] } },
  },
  {
    id: HEADING, parent: MD, group: BLOCKS, type: "block", def: {}, name: "heading",
    tags: [STRUCTURE_TAG],
    body: "A section's heading, first in its section: the backbone the document reads down. Its "
      + "level is how deep its section sits.",
    settings: { card: { icon: "content_heading", align: "center" }, ...TINT(235, 0.9) },
  },
  {
    id: TEXT, parent: MD, group: BLOCKS, type: "block", def: {}, name: "text",
    tags: [PROSE_TAG],
    body: "Prose: a run of paragraphs and quotes, held whole on the block's body.",
    settings: { ...PROSE("content_text"), ...TINT(350, 0.6) },
  },
  {
    id: LIST, parent: MD, group: BLOCKS, type: "block", def: {}, name: "list",
    tags: [PROSE_TAG],
    body: "An ordered, unordered or task list. Its items are its body, as written.",
    settings: { ...NAMED("content_list"), ...TINT(5, 0.8) },
  },
  {
    id: CODE, parent: MD, group: BLOCKS, type: "block", def: {}, name: "code",
    tags: [PROSE_TAG],
    body: "A fenced block, fence and all. Its language names it.",
    settings: { ...NAMED("content_code"), ...TINT(340, 0.95) },
  },
  {
    id: TABLE, parent: MD, group: BLOCKS, type: "grid", def: {}, name: "table",
    tags: [DATA_TAG],
    body: "A table. One grid of its rows' values, headed by their schema; its key column names "
      + "each row.",
    settings: { ...LISTED("role_table"), ...TINT(285, 0.95, PLAIN_NAME) },
  },
  {
    id: IMAGE, parent: MD, group: BLOCKS, type: "block", def: {}, name: "image",
    tags: [MEDIA_TAG],
    body: "An image. Its source is where it lives, previewed on its card; its alt text names it.",
    settings: { card: { icon: "content_image", preview: "show" }, ...TINT(90, 0.85) },
  },
  {
    id: FRONT, parent: MD, group: BLOCKS, type: "note", def: {}, name: "frontmatter",
    tags: [STRUCTURE_TAG],
    body: "The document's own metadata, as it was written.",
    settings: { ...ICON("content_front"), ...TINT(220, 0.6, SOLID) },
  },
  {
    id: FLOW, parent: MD, group: RELATIONS, type: "line", def: {}, name: "flow",
    body: "The order a document reads in: section to section, and block to block inside one.",
    settings: { line: { name: "hide" } },
  },
];

/** The package's tags: what each kind of content is, in a word. A definition carries the one it
 *  belongs to, and a block carries its definition's. */
export const TAGS: Definition[] = [
  [STRUCTURE_TAG, "What a document is built of: the document, its sections and headings, its front "
    + "matter."],
  [PROSE_TAG, "What a document says: its text, lists and fences, read in order."],
  [DATA_TAG, "What a document holds as values: its tables."],
  [MEDIA_TAG, "What a document shows: its images."],
].map(([id, about]) => ({ id: id!, parent: MD, group: TAGGED, type: "tag", def: {},
                          name: id!.slice(MD.length + 1), body: about! }));

/** The package's root and the groups that organize its domain. Built on the base package, and
 *  frozen: never written into. */
const FRAME: Block[] = [
  { id: MD, parent: null, name: "markdown", uses: [BASE_PACKAGE] },
  { id: BLOCKS, parent: MD, name: "blocks", type: "group", def: {}, order: 1 },
  { id: RELATIONS, parent: MD, name: "relations", type: "group", def: {}, order: 2 },
  { id: TAGGED, parent: MD, name: "tags", type: "group", def: {}, order: 3 },
];

/** Every block of the package, ordered as it reads: what a host lays as its floor. */
export const MARKDOWN: Block[] = [...FRAME, ...[...DEFS, ...TAGS]
  .map((d, n) => ({ ...d, order: n + FRAME.length }))];

/** The markdown package: what each kind of content in a document *is*.
 *
 *  The parser decides where a block starts and stops; the package decides what it means, how it
 *  draws and which tag it carries. **Defined as JSON** (`markdown.json`), as every package is: this
 *  reads it, and names the ids the reader's code keys off. */

import type { Block, File } from "@mnd/kit";
import file from "./markdown.json" with { type: "json" };

/** The package's root, and the prefix every id in it carries. */
export const MD = "md";

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

/** Every block of the package, ordered as it reads: what a host lays as its floor. */
export const MARKDOWN: Block[] = Object.values((file as unknown as File).graph.blocks)
  .sort((a, z) => (a.order ?? 0) - (z.order ?? 0));

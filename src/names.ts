/** How markdown text becomes a name: one line of what it says, markup dropped, lowercase.
 *
 *  A name is how a card, a column or a definition is called, never the document's text: a block
 *  keeps what the page wrote in its body. */

/** How much of a block's text a card shows before it is cut. */
const LABEL = 48;


/** One line of a block's text, short enough to read on a card.
 *
 *  Inline markup is dropped: a card shows what the text says, and `**this**`
 *  is how it was written rather than part of it. The body keeps the original. */
export function clip(text: string, most = LABEL): string {
  const line = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")   // links and images, keeping the text
    .replace(/[`*_~]+/g, "")                      // emphasis, code spans, strikethrough
    .replace(/^\s*>+\s*/gm, "")                   // quote markers
    .replace(/\s+/g, " ")
    .trim();
  return line.length > most ? `${line.slice(0, most - 1)}…` : line;
}

/** A name read from markdown: clipped, and lowercase. */
export function plain(text: string): string {
  return clip(text).toLowerCase();
}

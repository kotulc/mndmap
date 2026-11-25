/** Text in drawings: escaping, and fitting monospace text to a width (whole, or cut with "…"). */


/** The type every drawing is set in, and how wide one character is. */
export const SIZE = 13;
export const SMALL = 11;
const CHAR = 0.6;


/** Text made safe for markup and attributes, and as plain text to a host that reads inline
 *  markdown inside markup (MDX): braces, emphasis, code and link marks become character
 *  references. */
export function esc(text: string): string {
  return text.replace(/[&<>"{}*_`[\]\\~]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The text cut to fit `width` at `size`, ending in "…" when cut; empty when not one letter fits. */
export function fit(text: string, width: number, size = SIZE): string {
  const room = Math.floor(width / (size * CHAR));
  if (text.length <= room) return text;
  return room < 2 ? "" : `${text.slice(0, room - 1).trimEnd()}…`;
}

/** How wide the text sets at `size`. */
export function measure(text: string, size = SIZE): number {
  return text.length * size * CHAR;
}

/** Diagram fences in a markdown page: ```` ```mermaid ```` and ```` ```sitemap ```` blocks, found
 *  with marked's lexer (so fences nested in lists count, and fences shown inside longer fences do
 *  not), and swapped for what they draw, at the fence's own indent. */

import { Lexer, type Token } from "marked";


/** A fence: its language, the words after it (`mermaid interactive`), its body, where its text
 *  sits in the page (`at`, `length`), its indent, and the line it starts on. */
export type Fence = {
  lang: string; options: string[]; body: string; at: number; length: number; indent: string; line: number;
};

/** The fence languages that draw a diagram. */
const LANGS = new Set(["mermaid", "sitemap", "cards"]);


/** Every diagram fence in a page's text, in order. */
export function fences(text: string): Fence[] {
  const found: Fence[] = [];
  let cursor = 0;
  const walk = (tokens: Token[]) => {
    for (const t of tokens) {
      if (t.type === "code" && "lang" in t) {
        const [lang = "", ...options] = String(t.lang ?? "").trim().split(/\s+/);
        const where = LANGS.has(lang.toLowerCase()) ? locate(text, t.raw.trimEnd(), cursor) : undefined;
        if (where) {
          found.push({ lang: lang.toLowerCase(), options, body: String(t.text), ...where, line: line(text, where.at) });
          cursor = where.at + where.length;
        }
      }
      const kids = (t as { tokens?: Token[] }).tokens ?? (t as { items?: Token[] }).items;
      if (kids) walk(kids);
    }
  };
  walk(new Lexer().lex(text));
  return found;
}

/** The text with each fence replaced, in order, each replacement set apart by blank lines and
 *  indented as its fence was, so a fence in a list item stays in it. */
export function swap(text: string, swaps: { fence: Fence; with: string }[]): string {
  let out = "";
  let cursor = 0;
  for (const { fence, with: html } of swaps) {
    out += `${text.slice(cursor, fence.at)}\n${fence.indent}${html}\n`;
    cursor = fence.at + fence.length;
  }
  return out + text.slice(cursor);
}


/** Where a fence's text sits from `from` on: as written, or with each line indented (marked hands
 *  back a nested fence without its list indent). */
function locate(text: string, raw: string, from: number) {
  const at = text.indexOf(raw, from);
  if (at >= 0) return { at, length: raw.length, indent: indent(text, at) };
  const lines = raw.split("\n").map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`^([ \\t]*)${lines.join("\\n[ \\t]*")}`, "gm");
  pattern.lastIndex = from;
  const m = pattern.exec(text);
  return m ? { at: m.index + m[1]!.length, length: m[0].length - m[1]!.length, indent: m[1]! } : undefined;
}

/** The whitespace before an offset on its line. */
function indent(text: string, at: number): string {
  return /[ \t]*$/.exec(text.slice(text.lastIndexOf("\n", at - 1) + 1, at))?.[0] ?? "";
}

/** The 1-based line an offset falls on. */
function line(text: string, at: number): number {
  return text.slice(0, at).split("\n").length;
}

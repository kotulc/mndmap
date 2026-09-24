/** One markdown document, cut into sections for metadata.
 *
 *  A section is a heading and its own content, up to the next heading of any
 *  level; subsections are sections of their own. Ids match `src/read.ts`: the
 *  nth top-level heading is `heading:n`, and what precedes the first is `root`.
 *
 *  Each section is flattened to plain prose — a table row becomes
 *  `header: value; header: value.`, a list item a sentence, a link its text —
 *  because taggly's models read prose, not markup. Fences are not prose: only
 *  their language is kept. Inline code, bold terms and links are collected as
 *  marks: the concepts a technical writer has already pointed at. */

import { marked } from "marked";


/** The front matter fence, as `src/read.ts` reads it. */
const FRONT = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;


/** A document's title, raw front matter and sections, in reading order. */
export function sections(text) {
  const match = FRONT.exec(text);
  const front = match ? match[1].trim() : "";
  const body = match ? text.slice(match[0].length) : text;

  const root = section("root", "", 0, null, []);
  const held = [root];
  const open = [];
  let count = 0;

  // Front matter values read as prose for the root; its keys are structure
  if (front) root.lines.push(front.replace(/^\s*[\w-]+:\s*/gm, "").replace(/\s+/g, " "));

  for (const token of marked.lexer(body)) {
    if (token.type !== "heading") {
      block(token, held[held.length - 1]);
      continue;
    }

    // A heading closes every open heading of its level or deeper
    while (open.length && open[open.length - 1].level >= token.depth) open.pop();
    const parent = open[open.length - 1] ?? root;
    const name = plain(token.tokens);
    const next = section(`heading:${++count}`, name, token.depth, parent.id, [...parent.path, name]);
    inline(token.tokens, next.marks);
    held.push(next);
    open.push(next);
  }

  const title = held.find((s) => s.level === 1)?.name ?? "";
  return { title, front, sections: held.map(finish) };
}

/** Split a passage at sentence or paragraph ends into chunks of at most `cap`
 *  characters; taggly's extractors return nothing for much longer input. */
export function chunks(text, cap) {
  if (text.length <= cap) return [text];
  const out = [];
  let run = "";
  for (const piece of text.split(/(?<=[.!?:])\s+/)) {
    if (run && run.length + piece.length + 1 > cap) { out.push(run); run = ""; }
    run = run ? `${run} ${piece}` : piece;
    while (run.length > cap) { out.push(run.slice(0, cap)); run = run.slice(cap); }
  }
  if (run) out.push(run);
  return out;
}


/** An empty section. */
function section(id, name, level, parent, path) {
  return { id, name, level, parent, path, lines: [], marks: { code: [], strong: [], links: [], langs: [] } };
}

/** A section as written out: its heading and prose as one passage, marks deduplicated. */
function finish({ lines, marks, ...rest }) {
  const text = [rest.name && sentence(rest.name), ...lines].filter(Boolean).join(" ");
  const unique = (list) => [...new Set(list)];
  const links = [...new Map(marks.links.map((link) => [link.href, link])).values()];
  return {
    ...rest, text, body: lines.join(" ").length,
    marks: { code: unique(marks.code), strong: unique(marks.strong), links, langs: unique(marks.langs) },
  };
}

/** One block token, flattened onto a section's prose. */
function block(token, into) {
  switch (token.type) {
    case "paragraph":
      inline(token.tokens, into.marks);
      into.lines.push(sentence(plain(token.tokens)));
      return;
    case "list":
      for (const item of token.items) for (const inner of item.tokens) block(inner, into);
      return;
    case "text":
      // A list item's own line; its inline tokens sit on the token itself
      inline(token.tokens ?? [], into.marks);
      into.lines.push(sentence(token.tokens ? plain(token.tokens) : token.text));
      return;
    case "blockquote":
      for (const inner of token.tokens) block(inner, into);
      return;
    case "table": {
      const headers = token.header.map((cell) => plain(cell.tokens));
      for (const row of token.rows) {
        for (const cell of row) inline(cell.tokens, into.marks);
        const pairs = row.map((cell, n) => `${headers[n] || `col ${n + 1}`}: ${plain(cell.tokens)}`);
        into.lines.push(sentence(pairs.join("; ")));
      }
      return;
    }
    case "code":
      if (token.lang) into.marks.langs.push(token.lang);
      return;
    default:
      // Rules, space, html and link definitions carry no prose.
      return;
  }
}

/** Collect code spans, bold terms and links from inline tokens. */
function inline(tokens, marks) {
  for (const token of tokens ?? []) {
    if (token.type === "codespan") marks.code.push(token.text);
    if (token.type === "strong") marks.strong.push(plain(token.tokens));
    if (token.type === "link") marks.links.push({ text: plain(token.tokens), href: token.href });
    if (token.tokens) inline(token.type === "strong" ? [] : token.tokens, marks);
  }
}

/** Inline tokens as the words they say, without their markup. */
function plain(tokens) {
  return (tokens ?? []).map((token) => {
    if (token.tokens) return plain(token.tokens);
    if (token.type === "image") return token.text;
    if (token.type === "br") return " ";
    if (token.type === "html") return "";
    return token.text ?? "";
  }).join("").replace(/\s+/g, " ").trim();
}

/** Text ending as a sentence, so flattened rows and items stay apart. */
function sentence(text) {
  const line = text.trim();
  return !line || /[.!?:]$/.test(line) ? line : `${line}.`;
}

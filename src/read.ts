/** One markdown document, read into blocks.
 *
 *  Deliberately general: it walks `marked`'s tokens and files each one under
 *  the definition that describes it. What a block *means* is the markdown
 *  package's business, not this reader's — so a new element is a definition
 *  there plus one line here, and nothing else moves.
 *
 *  Every element is its own block. A heading does not hold what follows it;
 *  only a list holds its items and a table its rows. */

import { marked, type Token, type Tokens } from "marked";
import { base_graph, type Block, type Field, type Graph, type Id } from "@mnd/kit";
import {
  ALT, CODE, DONE, FRONT, HEADING, IMAGE, ITEM, LANG, LEVEL, LIST, ORDERED,
  QUOTE, ROW, RULE, SRC, TABLE, TEXT, with_markdown,
} from "./packages/markdown.js";

/** How much of a block's text a card shows before it is cut. */
const LABEL = 48;


/** A document as a graph: the file as the root, one block per element. */
export function read(name: string, text: string): Graph {
  const graph = with_markdown(base_graph());
  const root = graph.root;
  graph.blocks[root] = { ...graph.blocks[root]!, name, source: name };

  const seen = new Map<string, number>();
  const mint = (kind: string): Id => {
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return `${kind}:${n}`;
  };

  let order = 0;
  const put = (block: Omit<Block, "order">): Block => {
    const held = { ...block, order: ++order } as Block;
    graph.blocks[held.id] = held;
    return held;
  };

  const { front, body } = split_front(text);
  if (front) {
    put({ id: mint("front"), parent: root, type: FRONT, name: "front matter", body: front });
  }

  for (const token of marked.lexer(body)) walk(token, root);
  return graph;

  /** One token, filed under `parent`. */
  function walk(token: Token, parent: Id): void {
    switch (token.type) {
      case "heading": {
        const heading = token as Tokens.Heading;
        put({
          id: mint("heading"), parent, type: HEADING, name: heading.text,
          fields: [field(LEVEL, "number", String(heading.depth))],
        });
        return;
      }
      case "paragraph": {
        const paragraph = token as Tokens.Paragraph;
        const lone = only_image(paragraph);
        if (lone) {
          put({
            id: mint("image"), parent, type: IMAGE, name: lone.text || "image",
            source: lone.href,
            fields: [field(SRC, "link", lone.href), field(ALT, "text", lone.text ?? "")],
          });
          return;
        }
        put({
          id: mint("text"), parent, type: TEXT, name: clip(paragraph.text),
          body: paragraph.text,
        });
        return;
      }
      case "code": {
        const code = token as Tokens.Code;
        put({
          id: mint("code"), parent, type: CODE, name: code.lang || "code",
          body: code.text,
          ...(code.lang ? { fields: [field(LANG, "text", code.lang)] } : {}),
        });
        return;
      }
      case "blockquote": {
        const quote = token as Tokens.Blockquote;
        put({
          id: mint("quote"), parent, type: QUOTE, name: clip(quote.text),
          body: quote.text,
          fields: [field(LEVEL, "number", String(depth_of(quote)))],
        });
        return;
      }
      case "list": {
        const list = token as Tokens.List;
        const held = put({
          id: mint("list"), parent, type: LIST,
          name: list.ordered ? "ordered list" : tasks(list) ? "tasks" : "list",
          fields: [field(ORDERED, "flag", String(Boolean(list.ordered)))],
        });
        let at = 0;
        for (const item of list.items) {
          graph.blocks[mint("item")] = {
            id: `item:${seen.get("item")}`, parent: held.id, type: ITEM,
            name: clip(item.text), body: item.text, order: ++at,
            ...(item.task ? { fields: [field(DONE, "flag", String(Boolean(item.checked)))] } : {}),
          };
        }
        return;
      }
      case "table": {
        const table = token as Tokens.Table;
        const headers = table.header.map((cell) => cell.text);
        const held = put({
          id: mint("table"), parent, type: TABLE, name: headers.join(" · ") || "table",
        });
        let at = 0;
        for (const row of table.rows) {
          graph.blocks[mint("row")] = {
            id: `row:${seen.get("row")}`, parent: held.id, type: ROW,
            name: clip(row[0]?.text ?? ""), order: ++at,
            fields: row.map((cell, n) => field(headers[n] ?? `col ${n + 1}`, "text", cell.text)),
          };
        }
        return;
      }
      case "hr":
        put({ id: mint("rule"), parent, type: RULE, name: "rule" });
        return;
      default:
        // space, def, html and anything else carry no block of their own.
        return;
    }
  }
}


/** The front matter, and the document without it. */
function split_front(text: string): { front: string; body: string } {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!match) return { front: "", body: text };
  return { front: match[1]!.trim(), body: text.slice(match[0].length) };
}

/** A paragraph that is one image and nothing else. */
function only_image(paragraph: Tokens.Paragraph): Tokens.Image | null {
  const held = (paragraph.tokens ?? []).filter((token) => token.type !== "space");
  const first = held[0];
  return held.length === 1 && first?.type === "image" ? first as Tokens.Image : null;
}

/** How deeply a quote is nested, counting itself. */
function depth_of(quote: Tokens.Blockquote): number {
  const inner = (quote.tokens ?? []).find((token) => token.type === "blockquote");
  return inner ? 1 + depth_of(inner as Tokens.Blockquote) : 1;
}

function tasks(list: Tokens.List): boolean {
  return list.items.some((item) => item.task);
}

function field(name: string, form: Field["form"], value: string): Field {
  return { name, form, value };
}

/** One line of a block's text, short enough to read on a card.
 *
 *  Inline markup is dropped: a card shows what the text says, and `**this**`
 *  is how it was written rather than part of it. The body keeps the original. */
function clip(text: string): string {
  const line = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")   // links and images, keeping the text
    .replace(/[`*_~]+/g, "")                      // emphasis, code spans, strikethrough
    .replace(/^\s*>+\s*/gm, "")                   // quote markers
    .replace(/\s+/g, " ")
    .trim();
  return line.length > LABEL ? `${line.slice(0, LABEL - 1)}…` : line;
}

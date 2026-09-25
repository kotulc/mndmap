/** One markdown document, read into blocks.
 *
 *  Deliberately general: it walks `marked`'s tokens and files each one under
 *  the definition that describes it. What a block *means* is the markdown
 *  package's business, not this reader's — so a new element is a definition
 *  there plus one line here, and nothing else moves.
 *
 *  Every element is its own block, its body the element as written. A heading
 *  holds what follows it until thin layers dissolve (see `fold`); a list holds
 *  its items, and a table its rows — each row a usage of the table's schema. */

import { marked, type Token, type Tokens } from "marked";
import { base_graph, new_id, type Block, type Field, type Graph, type Id } from "@mnd/kit";
import {
  CODE, FRONT, HEADING, IMAGE, ITEM, KEY, LIST, QUOTE, ROW, RULE, TABLE, TEXT, with_markdown,
} from "./packages/markdown.js";

/** How much of a block's text a card shows before it is cut. */
const LABEL = 48;

/** How few blocks a layer may hold before its headings dissolve into it.
 *  A layer under this is not worth descending into. */
const LEAST = 5;

/** What a whole cell must be to read as a number, a flag or a link. */
const NUMBER = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const FLAG = /^(yes|no|true|false|y|n|x|✓)$/i;
const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)$/;
const URL_ONLY = /^https?:\/\/\S+$/;


/** A document as a graph: the file as the root, one block per element.
 *
 *  `least` is how few blocks a layer may hold before it stops being worth
 *  descending into — see {@link fold}. */
export function read(name: string, text: string, least = LEAST): Graph {
  const graph = with_markdown(base_graph());
  const root = graph.root;
  graph.blocks[root] = { ...graph.blocks[root]!, name, source: name };

  /** The headings still open, outermost first. A heading holds what follows
   *  it until one of the same level or higher closes it. */
  const open: { id: Id; depth: number }[] = [];
  const under = (): Id => open[open.length - 1]?.id ?? root;

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

  /** Each unique header row is one workspace definition: a row schema, a field per column.
   *  Tables sharing a header and its forms share it, so their rows are usages of one thing. */
  const schemas = new Map<string, Id>();
  const schema_for = (headers: string[], forms: Field["form"][]): Id => {
    const sign = headers.map((name, n) => `${name}:${forms[n]}`).join("\u0000");
    const known = schemas.get(sign);
    if (known) return known;
    const id = new_id("def");
    graph.defs[id] = {
      id, group: "block", extends: ROW, name: clip(headers.join(" · ")),
      fields: headers.map((name, n) => ({ name, form: forms[n] ?? "text" })),
    };
    schemas.set(sign, id);
    return id;
  };

  const { front, body } = split_front(text);
  if (front) {
    put({ id: mint("front"), parent: root, type: FRONT, name: "front matter", body: front });
  }

  for (const token of marked.lexer(body)) walk(token);
  fold(graph, root, least);
  return graph;

  /** One token, filed under whichever heading is open. */
  function walk(token: Token): void {
    const parent = under();
    switch (token.type) {
      case "heading": {
        const heading = token as Tokens.Heading;
        while (open.length && open[open.length - 1]!.depth >= heading.depth) open.pop();
        const held = put({
          id: mint("heading"), parent: under(), type: HEADING, name: heading.text,
          body: heading.raw.trim(),
        });
        open.push({ id: held.id, depth: heading.depth });
        return;
      }
      case "paragraph": {
        const paragraph = token as Tokens.Paragraph;
        const lone = only_image(paragraph);
        if (lone) {
          put({
            id: mint("image"), parent, type: IMAGE, name: lone.text || "image",
            source: lone.href, body: paragraph.raw.trim(),
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
          body: code.raw.trim(),
        });
        return;
      }
      case "blockquote": {
        const quote = token as Tokens.Blockquote;
        put({
          id: mint("quote"), parent, type: QUOTE, name: clip(quote.text),
          body: quote.raw.trim(),
        });
        return;
      }
      case "list": {
        const list = token as Tokens.List;
        const held = put({
          id: mint("list"), parent, type: LIST,
          name: list.ordered ? "ordered list" : tasks(list) ? "tasks" : "list",
          body: list.raw.trim(),
        });
        let at = 0;
        for (const item of list.items) {
          graph.blocks[mint("item")] = {
            id: `item:${seen.get("item")}`, parent: held.id, type: ITEM,
            name: clip(item.text), body: item.raw.trim(), order: ++at,
          };
        }
        return;
      }
      case "table": {
        const table = token as Tokens.Table;
        const headers = table.header.map((cell, n) => cell.text || `col ${n + 1}`);
        const key = headers[0] ?? "";
        const held = put({
          id: mint("table"), parent, type: TABLE, name: headers.join(" · ") || "table",
          fields: [field(KEY, "text", key)],
        });
        const forms = headers.map((_, n) => form_of(table.rows.map((row) => row[n]?.text ?? "")));
        const schema = schema_for(headers, forms);
        let at = 0;
        for (const row of table.rows) {
          graph.blocks[mint("row")] = {
            id: `row:${seen.get("row")}`, parent: held.id, type: schema,
            name: clip(row[headers.indexOf(key)]?.text ?? ""), order: ++at,
            fields: row.map((cell, n) => {
              const form = forms[n] ?? "text";
              return field(headers[n] ?? `col ${n + 1}`, form, value_of(form, cell.text));
            }),
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


/** Dissolve headings on any layer too thin to be worth descending into.
 *
 *  Nesting every heading leaves a root holding one box. So a layer under
 *  `least` gives up its heading containers: their children come up beside
 *  them, in the order they were written, and the layer is measured again.
 *  A heading that has been dissolved is a plain block — the writing that
 *  introduces the content beside it, which is how the page itself reads.
 *
 *  Only headings dissolve. A list owns its items and a table its rows,
 *  whatever else is on the layer. */
function fold(graph: Graph, layer: Id, least: number): void {
  for (;;) {
    const held = kids(graph, layer);
    if (held.length >= least) break;
    const holding = held.filter(
      (block) => block.type === HEADING && kids(graph, block.id).length > 0,
    );
    if (!holding.length) break;
    for (const heading of holding) {
      for (const child of kids(graph, heading.id)) graph.blocks[child.id]!.parent = layer;
    }
  }

  // Whatever still holds something is a layer of its own, measured the same way.
  for (const block of kids(graph, layer)) {
    if (kids(graph, block.id).length) fold(graph, block.id, least);
  }
}

/** The graph with every layer stacked down the page, the way the document reads.
 *
 *  The kit rows blocks left to right when none says where it sits. A document
 *  is read downwards, so each block is seated `step` under the one before it —
 *  a card's height and one unit of air, so it follows the card size. Drawn,
 *  never stored: the held graph keeps no positions to fall out of step. */
export function stacked(graph: Graph, step: number): Graph {
  const blocks = { ...graph.blocks };
  const seat = (layer: Id) => {
    kids(graph, layer).forEach((block, at) => {
      blocks[block.id] = { ...block, x: 0, y: at * step };
      seat(block.id);
    });
  };
  seat(graph.root);
  return { ...graph, blocks };
}

/** A layer's blocks, in the order they were written. */
function kids(graph: Graph, parent: Id): Block[] {
  return Object.values(graph.blocks)
    .filter((block) => block.parent === parent)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

/** The front matter, and the document without it. */
function split_front(text: string): { front: string; body: string } {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!match) return { front: "", body: text };
  return { front: match[1]!.trim(), body: text.slice(match[0].length) };
}

/** A column's form, from its filled cells: numbers, links or yes/no where every one agrees,
 *  and text otherwise. */
function form_of(cells: string[]): Field["form"] {
  const filled = cells.map((cell) => cell.trim()).filter(Boolean);
  if (!filled.length) return "text";
  if (filled.every((cell) => NUMBER.test(cell))) return "number";
  if (filled.every((cell) => FLAG.test(cell))) return "flag";
  if (filled.every((cell) => LINK.test(cell) || URL_ONLY.test(cell))) return "link";
  return "text";
}

/** A cell's value in its column's form: a link keeps its target, a flag reads true or false. */
function value_of(form: Field["form"], text: string): string {
  const cell = text.trim();
  if (form === "link") return LINK.exec(cell)?.[2] ?? cell;
  if (form === "flag") return String(/^(yes|true|y|x|✓)$/i.test(cell));
  if (form === "number") return cell.replace(/,/g, "");
  return text;
}

/** A paragraph that is one image and nothing else. */
function only_image(paragraph: Tokens.Paragraph): Tokens.Image | null {
  const held = (paragraph.tokens ?? []).filter((token) => token.type !== "space");
  const first = held[0];
  return held.length === 1 && first?.type === "image" ? first as Tokens.Image : null;
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

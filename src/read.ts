/** One markdown document, read into blocks under its own.
 *
 *  Deliberately general: it walks `marked`'s tokens and files each one under the definition that
 *  describes it. What a block *means* is the markdown package's business, not this reader's — so
 *  a new element is a definition there plus one line here, and nothing else moves. How each draws
 *  and how big is the package's too: the kit's faces and layouts place it.
 *
 *  A document is one layer under its document block. A heading is a section holding what follows
 *  it, and a section under it is a section inside it: each held by `parent`. Content is split where
 *  its kind changes — a run of paragraphs and quotes is one text block, and each list, fence,
 *  table and image its own — and read in order. Its frontmatter is its card source: what it is,
 *  its tags and its values. */

import { marked, type Token, type Tokens } from "marked";
import { all_defs, children, is_tag, names_in, read_card, said_as, subtree, type Block,
         type Graph, type Id, type Value } from "@mnd/kit";
import { CODE, HEADING, IMAGE, LIST, SECTION, TABLE, TEXT } from "./packages/markdown.js";
import { plain } from "./names.js";

/** What a paragraph-like token is: prose, a run of it one text block. */
const PROSE: readonly string[] = ["paragraph", "blockquote", "html", "def"];

/** The frontmatter keys a document says itself with; any other is a value. */
const OWN = ["name", "type", "tags", "source"];


/** The graph with a document's text — read from its file when it is opened — put into blocks
 *  under it, one per element, each in its section. Ids are the document's own, so a document
 *  reads the same blocks every time; what it held before is read again. */
export function read(source: Graph, doc: Id, text: string): Graph {
  const graph: Graph = { ...source, blocks: { ...source.blocks } };
  for (const id of subtree(graph, doc)) if (id !== doc) delete graph.blocks[id];
  /** The sections still open, outermost first. A heading holds what follows it until one of the
   *  same level or higher closes it. */
  const open: { id: Id; depth: number }[] = [];
  /** The text block a paragraph or quote joins, while nothing else has come between. */
  let prose: Id | null = null;

  const seen = new Map<string, number>();
  const mint = (kind: string): Id => {
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return `${doc}#${kind}:${n}`;
  };

  // After anything already put under it before it was read.
  let order = Math.max(0, ...children(graph, doc).map((block) => block.order ?? 0));
  const put = (block: Omit<Block, "id" | "parent" | "order">, kind: string): Block => {
    const parent = open[open.length - 1]?.id ?? doc;
    const held = { ...block, id: mint(kind), parent, order: ++order } as Block;
    graph.blocks[held.id] = held;
    return held;
  };

  const { front, body } = card(text);
  graph.blocks[doc] = carded(graph, graph.blocks[doc]!, front);
  for (const token of marked.lexer(body)) walk(token);
  return graph;

  /** One token, put in whichever section is open. */
  function walk(token: Token): void {
    if (token.type === "space") return;
    const image = token.type === "paragraph" ? only_image(token as Tokens.Paragraph) : null;
    if (image || !PROSE.includes(token.type)) prose = null;
    const raw = token.raw.trim();
    switch (token.type) {
      case "heading": {
        const heading = token as Tokens.Heading;
        while (open.length && open[open.length - 1]!.depth >= heading.depth) open.pop();
        // A section, named as the page heads it, and its heading first inside it.
        const said = `${"#".repeat(heading.depth)} ${heading.text}`;
        const held = put({ type: SECTION, name: said }, "section");
        open.push({ id: held.id, depth: heading.depth });
        put({ type: HEADING, name: plain(heading.text), body: said }, "heading");
        return;
      }
      case "paragraph":
      case "blockquote":
      case "html":
      case "def": {
        if (image) {
          put({ type: IMAGE, name: plain(image.text) || "image", source: image.href, body: raw },
              "image");
          return;
        }
        // A run of prose is one block: each paragraph or quote joins the one before it.
        const joined = prose ? graph.blocks[prose] : null;
        if (joined) { joined.body = `${joined.body}\n\n${raw}`; return; }
        const said = (token as { text?: string }).text ?? raw;
        prose = put({ type: TEXT, name: plain(said), body: raw }, "text").id;
        return;
      }
      case "code": {
        const code = token as Tokens.Code;
        put({ type: CODE, name: plain(code.lang ?? "") || "code", body: raw }, "code");
        return;
      }
      case "list": {
        // Its items are content, not parts: they live in its body, as written.
        const list = token as Tokens.List;
        put({ type: LIST, name: `list (${list.items.length} items)`, body: raw }, "list");
        return;
      }
      case "table": {
        // Content, as written: named by its rows by its columns, its body the table.
        const table = token as Tokens.Table;
        put({ type: TABLE, body: raw,
              name: `table (${table.rows.length}x${table.header.length} items)` }, "table");
        return;
      }
      default:
        // A rule and anything else carry no block of their own. Html and a link definition are
        // prose, as written, so nothing the page says is lost.
        return;
    }
  }
}


/** A document's text split into its card source and its body. Frontmatter that does not read is
 *  left as the page wrote it. */
function card(text: string): { front: Record<string, unknown>; body: string } {
  try { return read_card(text); }
  catch { return { front: {}, body: text }; }
}

/** A document as its frontmatter says: its name, what it is and its tags, where something loaded
 *  holds them, and every other key a value. A word nothing holds stays a value, since a viewer
 *  makes no definitions. */
function carded(graph: Graph, doc: Block, front: Record<string, unknown>): Block {
  const values: Value[] = Object.entries(front).filter(([k]) => !OWN.includes(k))
    .map(([name, v]) => ({ name, value: said_as(v) }));
  const word = said_as(front["type"]).trim();
  const type = word ? all_defs(graph).find((d) => d.name === word && !is_tag(graph, d.id)) : null;
  if (word && !type) values.unshift({ name: "type", value: word });
  const words = names_in(front["tags"]);
  const tags = words.map((t) => all_defs(graph).find((d) => d.name === t && is_tag(graph, d.id))?.id)
    .filter((t): t is Id => !!t);
  if (tags.length < words.length) values.push({ name: "tags", value: words.join(", ") });
  const name = said_as(front["name"]).trim();
  return { ...doc, ...(name ? { name } : {}), ...(type ? { type: type.id } : {}),
           ...(tags.length ? { tags } : {}), ...(values.length ? { values } : {}) };
}

/** A paragraph that is one image and nothing else. */
function only_image(paragraph: Tokens.Paragraph): Tokens.Image | null {
  const held = (paragraph.tokens ?? []).filter((token) => token.type !== "space");
  const first = held[0];
  return held.length === 1 && first?.type === "image" ? first as Tokens.Image : null;
}

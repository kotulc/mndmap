/** Markdown in, mdast out.
 *
 *  The one place remark is named. It parses and nothing else: no selectors,
 *  no filesystem and no crypto, so the same function runs in node and in the
 *  browser. What the tree becomes is the reader's business. */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import YAML from "yaml";


/** mdast is not typed here: the reader walks it by `type`, and importing the
 *  whole node union to name six of them buys nothing. */
export type Node = any;

export interface Parsed {
  path: string;
  text: string;
  tree: Node;
  frontmatter: Record<string, unknown>;
  /** The slice the front matter occupied, so prose can start after it. */
  body_at: number;
}

const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);
const mdx = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]).use(remarkMdx);


export function parse(path: string, text: string): Parsed {
  const tree = (path.toLowerCase().endsWith(".mdx") ? mdx : markdown).parse(text);
  let frontmatter: Record<string, unknown> = {};
  let body_at = 0;

  for (const node of (tree as Node).children ?? []) {
    if (node.type !== "yaml") continue;
    const parsed = YAML.parse(node.value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    }
    body_at = node.position.end.offset;
    break;
  }

  return { path, text, tree, frontmatter, body_at };
}

/** A node's text with every mark dropped. */
export function plain(node: Node): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(plain).join("");
}

/** The source a node was written as, verbatim. */
export function slice(node: Node, text: string): string {
  return text.slice(node.position.start.offset, node.position.end.offset);
}

export function starts_at(node: Node): number {
  return node.position.start.offset as number;
}

export function ends_at(node: Node): number {
  return node.position.end.offset as number;
}

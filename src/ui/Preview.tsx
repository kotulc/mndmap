/** The tray's preview tab: a block's own text, rendered as the page renders it.
 *
 *  What a block is, carries and holds are the kit tray's own tabs; this is the one thing they do
 *  not show — the markdown read as markdown. mndmap hands it to the tray as an extra tab. */

import { marked } from "marked";
import { useMemo } from "react";
import { children, type Block, type Graph, type Id } from "@mnd/kit";
import { FRONT, KEY, TABLE, is_row } from "../packages/markdown.js";
import { is_markdown } from "../scan.js";

export function Preview({ graph, picked }: { graph: Graph; picked: Id | null }) {
  const block = picked ? graph.blocks[picked] : undefined;
  const row = is_row(graph, block?.type);
  const html = useMemo(() => markdown_of(block, row), [block, row]);

  if (!block) return <p className="mm-empty">Pick a block in the tree or the drawing.</p>;

  return (
    <div className="mm-content">
      <p className="mm-path">{about(graph, block)}</p>
      {html ? (
        <div className="mm-prose" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="mm-empty">Nothing to preview; its fields and contents are in their tabs.</p>
      )}
    </div>
  );
}


/** What the block is, in a few words: its kind, and what qualifies it. */
function about(graph: Graph, block: Block): string {
  const kind = block.type ? graph.defs[block.type]?.name ?? block.type : "block";
  const key = block.fields?.find((each) => each.name === KEY)?.value;
  const held = children(graph, block.id).length;
  const parts = [kind];
  if (key) parts.push(`keyed by ${key}`);
  if (block.source) parts.push(block.source);
  if (held) parts.push(held === 1 ? "1 inside" : `${held} inside`);
  return parts.join(" · ");
}

/** The block's own text as HTML, where it has text worth rendering. */
function markdown_of(block: Block | undefined, row: boolean): string {
  if (!block) return "";
  // A file block carries the whole file; a content block carries its element, as written.
  const text = block.type === undefined || block.type === "block" || block.type === "folder"
    ? (is_markdown(block.source) ? without_front(block.body ?? "") : "")
    : block.type === TABLE || row
      ? ""
      : block.type === FRONT
        ? "```yaml\n" + (block.body ?? "") + "\n```"
        : block.body ?? "";
  return text.trim() ? marked.parse(text, { async: false }) as string : "";
}

/** The body without its front matter, which is metadata rather than content. */
function without_front(text: string): string {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length).trim() : text.trim();
}

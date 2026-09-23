/** The tray's Content tab: what the picked block holds.
 *
 *  A content block shows its own text, rendered. A file block shows the file.
 *  A block that holds others says what is in it. */

import { marked } from "marked";
import { useMemo } from "react";
import { children, type Block, type Graph, type Id } from "@mnd/kit";
import { CODE, FRONT, LANG, MACHINE, ROW, TABLE, TEXT } from "../packages/markdown.js";
import { is_markdown } from "../scan.js";

export type TrayTab = "Content";

export function Tray({ graph, picked }: { graph: Graph; picked: Id | null }) {
  const block = picked ? graph.blocks[picked] : undefined;
  const html = useMemo(() => markdown_of(block), [block]);

  if (!block) return <p className="mm-empty">Pick a block in the tree or the drawing.</p>;

  const fields = (block.fields ?? []).filter((each) => !MACHINE.has(each.name));
  const held = children(graph, block.id);

  return (
    <div className="mm-content">
      <p className="mm-path">{about(graph, block)}</p>

      {/* A row's cells are its whole content, so they read as a record. */}
      {block.type === ROW && fields.length ? (
        <dl className="mm-record">
          {fields.map((each) => (
            <div key={each.name}>
              <dt>{each.name}</dt>
              <dd>{each.value ?? ""}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {block.type === CODE ? (
        <pre className="mm-code"><code>{block.body ?? ""}</code></pre>
      ) : html ? (
        <div className="mm-prose" dangerouslySetInnerHTML={{ __html: html }} />
      ) : null}

      {held.length ? (
        <ul className="mm-holds">
          {held.map((each) => <li key={each.id}>{each.name || each.id}</li>)}
        </ul>
      ) : null}

      {!html && !held.length && block.type !== ROW ? (
        <p className="mm-empty">Nothing in this block.</p>
      ) : null}
    </div>
  );
}


/** What the block is, in a few words: its kind, and what qualifies it. */
function about(graph: Graph, block: Block): string {
  const kind = block.type ? graph.defs[block.type]?.name ?? block.type : "block";
  const language = block.fields?.find((each) => each.name === LANG)?.value;
  const held = children(graph, block.id).length;
  const parts = [kind];
  if (language) parts.push(language);
  if (block.source) parts.push(block.source);
  if (held) parts.push(held === 1 ? "1 inside" : `${held} inside`);
  return parts.join(" · ");
}

/** The block's own text as HTML, where it has text worth rendering. */
function markdown_of(block: Block | undefined): string {
  if (!block) return "";
  // A file block carries the whole file; a content block carries its element.
  const text = block.type === undefined || block.type === "block" || block.type === "folder"
    ? (is_markdown(block.source) ? without_front(block.body ?? "") : "")
    : block.type === TABLE || block.type === ROW || block.type === CODE
      ? ""
      : block.type === FRONT
        ? "```yaml\n" + (block.body ?? "") + "\n```"
        : block.body ?? (block.type === TEXT ? "" : block.name ?? "");
  return text.trim() ? marked.parse(text, { async: false }) as string : "";
}

/** The body without its front matter, which is metadata rather than content. */
function without_front(text: string): string {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length).trim() : text.trim();
}

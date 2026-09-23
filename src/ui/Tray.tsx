/** The tray's Content tab: the picked block's file, rendered. */

import { marked } from "marked";
import { useMemo } from "react";
import type { Graph, Id } from "@mnd/kit";
import { is_markdown } from "../scan.js";

export type TrayTab = "Content";

export function Tray({ graph, picked }: { graph: Graph; picked: Id | null }) {
  const block = picked ? graph.blocks[picked] : undefined;
  const markdown = block && is_markdown(block.source) ? block.body ?? "" : "";
  const html = useMemo(() => {
    const text = without_front(markdown);
    return text ? marked.parse(text, { async: false }) as string : "";
  }, [markdown]);

  if (!block) return <p className="mm-empty">Pick a file in the tree or the drawing.</p>;
  if (block.type === "folder") {
    return <p className="mm-empty">{count(graph, block.id)} inside {block.name}.</p>;
  }
  if (!is_markdown(block.source)) return <p className="mm-empty">{block.name} is not markdown.</p>;
  if (!html) return <p className="mm-empty">{block.name} is empty.</p>;

  return (
    <div className="mm-content">
      <p className="mm-path">{block.source}</p>
      <div className="mm-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/** The body without its front matter, which is metadata rather than content —
 *  markdown would otherwise draw the fence as a rule and the keys as a list. */
function without_front(text: string): string {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length).trim() : text.trim();
}

function count(graph: Graph, id: Id): string {
  const held = Object.values(graph.blocks).filter((block) => block.parent === id).length;
  return held === 1 ? "1 block" : `${held} blocks`;
}

/** The tray's markdown tab: a block's own text in full, rendered as its card previews it.
 *
 *  What a block is, carries and holds are the kit tray's own tabs; this is the one thing they do
 *  not show — the markdown read as markdown. mndmap hands it to the tray as its first tab. While
 *  reading, it is the whole document instead, with the row being read lit. */

import { useEffect, useMemo, useRef } from "react";
import { Inline, Markdown } from "@mnd/kit/react";
import { children, type Block, type Graph, type Id } from "@mnd/kit";
import { FRONT, KEY, TABLE } from "../packages/markdown.js";
import { is_markdown } from "../scan.js";
import { covered, segments, type Row, type Segment } from "../series.js";

export function Preview({ graph, picked }: { graph: Graph; picked: Id | null }) {
  const block = picked ? graph.blocks[picked] : undefined;
  const text = useMemo(() => markdown_of(block), [block]);

  if (!block) return <p className="mm-empty">Pick a block in the tree or the drawing.</p>;

  return (
    <div className="mm-content">
      <p className="mm-path">{about(graph, block)}</p>
      {text ? (
        <Markdown className="mm-prose" text={text} />
      ) : (
        <p className="mm-empty">Nothing to preview; its fields and contents are in their tabs.</p>
      )}
    </div>
  );
}


/** The whole document, as the graph now orders it: the row being read lit, what the canvas picked
 *  outlined as one group, and both kept in view. What a pick covers is read as it is drawn. */
export function Document({ graph, view, row, picked }: {
  graph: Graph; view: Graph; row: Row | null; picked: readonly Id[];
}) {
  const parts = useMemo(() => segments(graph), [graph]);
  const chosen = useMemo(() => covered(view, picked), [view, picked]);
  const held = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = held.current?.querySelector(".mm-picked") ?? held.current?.querySelector(".mm-lit");
    seen?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [row, chosen]);

  // Consecutive picked segments share one outline; the rest stand alone.
  const runs: { picked: boolean; parts: Segment[] }[] = [];
  for (const part of parts) {
    const on = chosen.has(part.id);
    const last = runs[runs.length - 1];
    if (last && on && last.picked) last.parts.push(part);
    else runs.push({ picked: on, parts: [part] });
  }

  // A heading shows its markdown as written, so it reads apart from the content under it.
  const draw = ({ id, text, cells, level }: Segment) => {
    const lit = `mm-prose${row?.covers.has(id) ? " mm-lit" : ""}`;
    if (cells) return <Table key={id} className={lit} cells={cells} />;
    if (level) return <p key={id} className={`${lit} mm-heading`}><Inline text={text} /></p>;
    return <Markdown key={id} className={lit} text={text} />;
  };

  return (
    <div className="mm-content mm-document" ref={held}>
      {runs.map((run) => run.picked
        ? <div key={run.parts[0]!.id} className="mm-picked">{run.parts.map(draw)}</div>
        : run.parts.map(draw))}
    </div>
  );
}

/** A table, which a card draws as a grid and the kit's markdown leaves as written. */
function Table({ className, cells }: { className: string; cells: string[][] }) {
  const [head = [], ...body] = cells;
  return (
    <div className={className}>
      <table>
        <thead><tr>{head.map((cell, n) => <th key={n}><Inline text={cell} /></th>)}</tr></thead>
        <tbody>
          {body.map((line, r) => (
            <tr key={r}>{line.map((cell, n) => <td key={n}><Inline text={cell} /></td>)}</tr>
          ))}
        </tbody>
      </table>
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

/** The block's own text as markdown, where it has text worth rendering. */
function markdown_of(block: Block | undefined): string {
  if (!block) return "";
  // A file block carries the whole file; a content block carries its element, as written.
  const text = block.type === undefined || block.type === "block" || block.type === "folder"
    ? (is_markdown(block.source) ? without_front(block.body ?? "") : "")
    : block.type === TABLE
      ? ""
      : block.type === FRONT
        ? "```yaml\n" + (block.body ?? "") + "\n```"
        : block.body ?? "";
  return text.trim();
}

/** The body without its front matter, which is metadata rather than content. */
function without_front(text: string): string {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length).trim() : text.trim();
}

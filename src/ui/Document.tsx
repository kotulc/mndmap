/** The tray's document tab: the whole document a pick sits in, as the graph now orders it, with
 *  the section being read lit. What one block is, says and carries are the kit tray's own tabs.
 *
 *  Rendered by the kit's markdown, as every card is. */

import { useEffect, useMemo, useRef } from "react";
import { Inline, Markdown } from "@mnd/kit/react";
import { type Graph, type Id } from "@mnd/kit";
import { covered, segments, type Segment } from "../series.js";


/** The whole document, as the graph now orders it: the section being read lit, what the canvas
 *  picked outlined as one group, and both kept in view. */
export function Document({ graph, doc, lit, picked, onPick, onPoint }: {
  graph: Graph; doc: Id; lit: ReadonlySet<Id>; picked: readonly Id[];
  onPick: (id: Id) => void; onPoint: (id: Id | null) => void;
}) {
  const parts = useMemo(() => segments(graph, doc), [graph, doc]);
  const chosen = useMemo(() => covered(graph, picked), [graph, picked]);
  /** What is lit and picked, as one key: the view scrolls only when it changes, never on a
   *  re-render alone, such as a section pointed at. */
  const seen_key = `${[...lit].join(" ")}|${[...chosen].join(" ")}`;
  const held = useRef<HTMLDivElement>(null);
  /** Whether the pick came from here, where the section is already in view. */
  const here = useRef(false);

  useEffect(() => {
    if (here.current) { here.current = false; return; }
    const seen = held.current?.querySelector(".mm-picked") ?? held.current?.querySelector(".mm-lit");
    seen?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [seen_key]);

  // Consecutive picked segments share one outline; the rest stand alone.
  const runs: { picked: boolean; parts: Segment[] }[] = [];
  for (const part of parts) {
    const on = chosen.has(part.id);
    const last = runs[runs.length - 1];
    if (last && on && last.picked) last.parts.push(part);
    else runs.push({ picked: on, parts: [part] });
  }

  /** A section clicked picks the block it was read from. */
  const chose = (id: Id) => { here.current = true; onPick(id); };

  // A heading shows its markdown as written, so it reads apart from the content under it.
  const draw = ({ id, text, level }: Segment) => (
    <div key={id} className={`mm-section${lit.has(id) ? " mm-lit" : ""}`}
      onClick={() => chose(id)}
      onMouseEnter={() => onPoint(id)} onMouseLeave={() => onPoint(null)}>
      {level ? <p className="mm-prose mm-heading"><Inline text={text} /></p>
        : <Markdown className="mm-prose" text={text} />}
    </div>
  );

  return (
    <div className="mm-content mm-document" ref={held}>
      {runs.map((run) => run.picked
        ? <div key={run.parts[0]!.id} className="mm-picked">{run.parts.map(draw)}</div>
        : run.parts.map(draw))}
    </div>
  );
}

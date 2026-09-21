/** The collection root, read the way mndflow reads a workspace.
 *
 *  Identity is the root's name and tags. Display is this session's drawing
 *  defaults. File is what an export of the held graph would say about itself. */

import { useRef, useState, type ReactNode } from "react";
import { SCHEMA, shown_name, type Graph, type Id } from "@mnd/kit";
import { Icon } from "@mnd/kit/react";
import type { Edit } from "../edits.js";

/** The kit lays every card out at five by two. The inputs stay inside the same range. */
const CARD = { min: { w: 4, h: 2 }, max: { w: 12, h: 6 } };

export type Display = {
  card: { w: number; h: number };
  legend: boolean;
  corner: "top" | "bottom";
  /** Ruled lattice behind the cards. On by default. */
  lattice: boolean;
};

const CORNERS = [{ value: "top", word: "top" }, { value: "bottom", word: "bottom" }] as const;

export function WorkspacePanel({ graph, root, display, onEdit, onDisplay }: {
  graph: Graph;
  root: Id;
  display: Display;
  onEdit: (edit: Edit) => void;
  onDisplay: (next: Display) => void;
}) {
  const block = graph.blocks[root];
  if (!block) return <p className="mm-empty">That workspace is not here any more.</p>;

  const file = file_name(block.name);
  const packages = new Set(
    Object.values(graph.defs).map((def) => def.from).filter((id): id is Id => !!id),
  ).size;

  return (
    <div className="panel workspace">
      <div className="col identity">
        <Band label="identity" />
        <div className="rows">
          <Line label="name" tip="What this workspace is called, as the explorer and a file write it.">
            <Name value={block.name ?? ""} placeholder={shown_name(graph, root)}
              onCommit={(name) => onEdit({ do: "rename", id: root, name })} />
          </Line>
          <Line label="tags" tip="Words that say what this is like. Tags carry nothing and are never inherited.">
            <TagList tags={block.tags ?? []}
              onCommit={(tags) => onEdit({ do: "tag", id: root, tags })} />
          </Line>
        </div>
        <Band label="display" />
        <div className="rows">
          <Line label="card" className="card"
            tip="The room a card takes where its definition asked for none, in units of the lattice.">
            <Size axis="w" value={display.card.w} label="card width"
              onChange={(w) => onDisplay({ ...display, card: { ...display.card, w } })} />
            <span className="into">×</span>
            <Size axis="h" value={display.card.h} label="card height"
              onChange={(h) => onDisplay({ ...display, card: { ...display.card, h } })} />
            <span className="alias">units</span>
          </Line>
          <Line label="grid" className="key"
            tip="The ruled lattice the cards sit on.">
            <label className="check" title="Show the lattice behind the drawing">
              <input type="checkbox" checked={display.lattice}
                onChange={(event) => onDisplay({ ...display, lattice: event.target.checked })} />
              show
            </label>
          </Line>
          <Line label="legend" className="key"
            tip="Whether a layer shows what it draws and what it means, and which right-hand corner it sits in.">
            <label className="check" title="What a layer does unless it says otherwise">
              <input type="checkbox" checked={display.legend}
                onChange={(event) => onDisplay({ ...display, legend: event.target.checked })} />
              show
            </label>
            {CORNERS.map((corner) => (
              <label key={corner.value} className="check">
                <input type="radio" name="legend-corner" checked={display.corner === corner.value}
                  onChange={() => onDisplay({ ...display, corner: corner.value })} />
                {corner.word}
              </label>
            ))}
          </Line>
        </div>
      </div>

      <div className="col file">
        <Band label="file" />
        <div className="rows">
          <Line label="name" tip="What an export of this workspace is called. It follows the name above, so renaming the workspace renames the file it writes.">
            <span className="read">{`${file}.json`}</span>
          </Line>
          <Line label="schema" tip="The contract a file of this workspace is written to.">
            <span className="read">{SCHEMA}</span>
          </Line>
          <Line label="packages" tip="How many vocabularies this workspace draws on. The floor counts: every workspace stands on it.">
            <span className="read">{packages}</span>
          </Line>
          <Line label="definitions" tip="Every definition the workspace can name, a package's and the floor's among its own.">
            <span className="read">{Object.keys(graph.defs).length}</span>
          </Line>
        </div>
      </div>
    </div>
  );
}

/** What an export of this workspace is called, without its extension. */
export function file_name(name: string | undefined): string {
  const said = (name ?? "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return said || "workspace";
}

function Band({ label }: { label: string }) {
  return <div className="rail"><h5>{label}</h5></div>;
}

function Line({ label, tip, className, children }: {
  label: string; tip: string; className?: string; children: ReactNode;
}) {
  return (
    <div className={["row", className].filter(Boolean).join(" ")} title={tip}>
      <label>{label}</label>
      <span className="line">{children}</span>
    </div>
  );
}

function Name({ value, placeholder, onCommit }: {
  value: string; placeholder: string; onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const skip = useRef(false);
  return (
    <input aria-label="name" value={draft ?? value} placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        if (skip.current) { skip.current = false; setDraft(null); return; }
        const next = event.currentTarget.value.trim();
        if (next && next !== value) onCommit(next);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { skip.current = true; setDraft(null); event.currentTarget.blur(); }
      }} />
  );
}

function TagList({ tags, onCommit }: { tags: string[]; onCommit: (tags: string[]) => void }) {
  const [adding, setAdding] = useState("");
  const add = (raw: string) => {
    const said = raw.split(",").map((tag) => tag.trim()).filter((tag) => tag && !tags.includes(tag));
    setAdding("");
    if (said.length) onCommit([...tags, ...said]);
  };
  return (
    <span className="tags">
      {tags.map((tag) => (
        <button key={tag} type="button" className="tag" title={`take ${tag} off`}
          onClick={() => onCommit(tags.filter((each) => each !== tag))}>
          {tag}<Icon name="remove" size={9} />
        </button>
      ))}
      <input value={adding} aria-label="add a tag" placeholder={tags.length ? "" : "add a tag"}
        onChange={(event) => setAdding(event.target.value)}
        onBlur={(event) => add(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    </span>
  );
}

function Size({ axis, value, label, onChange }: {
  axis: "w" | "h"; value: number; label: string; onChange: (next: number) => void;
}) {
  const range = axis === "w" ? { min: CARD.min.w, max: CARD.max.w } : { min: CARD.min.h, max: CARD.max.h };
  return (
    <input type="number" aria-label={label} value={value}
      min={range.min} max={range.max} step={1}
      onChange={(event) => {
        const next = Math.round(Number(event.target.value));
        if (!Number.isFinite(next)) return;
        onChange(Math.min(range.max, Math.max(range.min, next)));
      }} />
  );
}

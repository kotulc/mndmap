/** The content tray: the picked block, read.
 *
 *  mndmap's own panel, in the tray's style. A body is rendered and never
 *  edited; a name, a tag and a relation's type are the only things a gesture
 *  here may change, and each of them goes through one `onEdit`. */

import { marked } from "marked";
import { useMemo, useState } from "react";
import { children, type Graph, type Id, type Relation } from "@mnd/kit";
import { LINK } from "../doc.js";
import type { Edit } from "../edits.js";
import type { Suggestions } from "../types.js";

interface TrayProps {
  graph: Graph;
  picked: Id | null;
  suggestions: Suggestions;
  onEdit: (edit: Edit) => void;
  onLook: (layer: Id) => void;
}


export function Tray({ graph, picked, suggestions, onEdit, onLook }: TrayProps) {
  const block = picked ? graph.blocks[picked] : undefined;
  const html = useMemo(() => (block?.body ? marked.parse(block.body, { async: false }) : ""), [block?.body]);

  if (!block) return <div className="tray empty">Pick something in the tree or the drawing.</div>;

  const tags = block.tags ?? [];
  const relations = Object.values(graph.edges).filter((edge) => edge.from === block.id || edge.to === block.id);
  const held = suggestions[block.id];

  return (
    <div className="tray">
      <header>
        <Name id={block.id} name={block.name ?? ""} onEdit={onEdit} />
        <span className="kind">{graph.defs[block.type ?? ""]?.name ?? "block"}</span>
      </header>

      <Tags id={block.id} tags={tags} offered={held?.tags ?? []} onEdit={onEdit} />

      {held?.name?.length ? (
        <Chips label="name" values={held.name}
          onTake={(value) => onEdit({ do: "pick", id: block.id, of: "name", value })} />
      ) : null}

      {block.source || (block.fields ?? []).length ? (
        <dl className="fields">
          {/* Where it came from. Provenance, so it reads first and is not a
              field somebody may edit. */}
          {block.source ? <div><dt>source</dt><dd>{block.source}</dd></div> : null}
          {(block.fields ?? []).map((field) => (
            <div key={field.name}>
              <dt>{field.name}</dt>
              <dd>{field.value ?? ""}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {html ? <div className="body" dangerouslySetInnerHTML={{ __html: html }} /> : null}

      {children(graph, block.id).length ? (
        <ol className="holds">
          {children(graph, block.id).map((child) => (
            <li key={child.id}>
              <button type="button" onClick={() => onLook(child.id)}>
                {child.name || (child.body ?? "").slice(0, 60) || child.id}
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {relations.length ? (
        <ul className="relations">
          {relations.map((relation) => (
            <Line key={relation.id} graph={graph} relation={relation} here={block.id}
              offered={suggestions[relation.id]?.type ?? []} onEdit={onEdit} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}


/** A name, renamed on enter. Double-clicking the tree does the same thing. */
function Name({ id, name, onEdit }: { id: Id; name: string; onEdit: (edit: Edit) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return <h2 onDoubleClick={() => setDraft(name)} title="Double-click to rename">{name || id}</h2>;
  }
  const settle = (keep: boolean) => {
    if (keep && draft.trim() && draft !== name) onEdit({ do: "rename", id, name: draft.trim() });
    setDraft(null);
  };
  return (
    <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)}
      onBlur={() => settle(true)}
      onKeyDown={(event) => { if (event.key === "Enter") settle(true); if (event.key === "Escape") settle(false); }} />
  );
}

/** The tags a block carries, and the ones the sidecar offers. */
function Tags({ id, tags, offered, onEdit }: {
  id: Id; tags: string[]; offered: string[]; onEdit: (edit: Edit) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (tag: string) => {
    if (tag.trim()) onEdit({ do: "tag", id, tags: [...new Set([...tags, tag.trim()])] });
    setDraft("");
  };
  return (
    <div className="tags">
      {tags.map((tag) => (
        <button key={tag} type="button" className="tag"
          onClick={() => onEdit({ do: "tag", id, tags: tags.filter((each) => each !== tag) })}
          title="Click to drop">{tag}</button>
      ))}
      {offered.filter((tag) => !tags.includes(tag)).map((tag) => (
        <button key={tag} type="button" className="tag offered" onClick={() => add(tag)}
          title="Suggested">+ {tag}</button>
      ))}
      <input value={draft} placeholder="tag" onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") add(draft); }} />
    </div>
  );
}

/** One relation, and the types the sidecar offers for it. A relation is
 *  retyped and never drawn or deleted. */
function Line({ graph, relation, here, offered, onEdit }: {
  graph: Graph; relation: Relation; here: Id; offered: Id[]; onEdit: (edit: Edit) => void;
}) {
  const outward = relation.from === here;
  const other = graph.blocks[outward ? relation.to : relation.from];
  const name = graph.defs[relation.type ?? LINK]?.name ?? relation.type ?? "link";
  return (
    <li>
      <span className="way">{outward ? "→" : "←"}</span>
      <span className="type">{name}</span>
      <span className="other">{other?.name || other?.id || "gone"}</span>
      {offered.length ? (
        <Chips label="" values={offered}
          onTake={(value) => onEdit({ do: "pick", id: relation.id, of: "type", value })} />
      ) : null}
    </li>
  );
}

/** Candidates from the sidecar. Picking one writes the graph; nothing here
 *  is graph data until somebody does. */
function Chips({ label, values, onTake }: { label: string; values: string[]; onTake: (value: string) => void }) {
  return (
    <span className="chips">
      {label ? <span className="chip-label">{label}</span> : null}
      {values.map((value) => (
        <button key={value} type="button" className="chip" onClick={() => onTake(value)}>{value}</button>
      ))}
    </span>
  );
}

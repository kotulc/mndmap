/** Document tray: Content outline, Metadata, Links — mndmap meaning only. */

import { marked } from "marked";
import { useMemo, useState } from "react";
import { type Graph, type Id, type Relation } from "@mnd/kit";
import { LINK, PAGE, SET } from "../doc.js";
import type { Edit } from "../edits.js";
import type { Suggestions } from "../types.js";
import {
  documentOutline, orgChildren, pageOf, type OutlineRow,
} from "./project.js";

export type TrayTab = "Workspace" | "Content" | "Metadata" | "Links";

interface TrayProps {
  graph: Graph;
  /** Organization projection — folder child lists. */
  org: Graph;
  picked: Id | null;
  suggestions: Suggestions;
  tab: TrayTab;
  onEdit: (edit: Edit) => void;
}


export function Tray({ graph, org, picked, suggestions, tab, onEdit }: TrayProps) {
  const [focusId, setFocusId] = useState<Id | null>(null);
  const block = picked ? graph.blocks[picked] : undefined;

  if (!block) {
    return <p className="mm-empty">Pick a folder or page in the tree or the drawing.</p>;
  }

  if (tab === "Content") {
    if (block.type === SET) {
      const kids = orgChildren(org, block.id);
      return (
        <div className="mm-outline">
          {kids.length === 0
            ? <p className="mm-empty">This folder has no pages yet.</p>
            : (
              <ul className="mm-folder">
                {kids.map((child) => (
                  <li key={child.id} className={child.type === SET ? "mm-set" : "mm-page"}>
                    <span className="mm-kind">{child.type === SET ? "folder" : "page"}</span>
                    {child.name || child.id}
                  </li>
                ))}
              </ul>
            )}
        </div>
      );
    }
    if (block.type === PAGE) {
      const rows = documentOutline(graph, block.id);
      if (!rows.length) {
        return <p className="mm-empty">This page has no mapped content.</p>;
      }
      return (
        <div className="mm-outline">
          {rows.map((row) => (
            <OutlineView key={`${row.kind}:${row.id}`} row={row}
              focused={focusId === row.id}
              onFocus={() => setFocusId(row.id)}
              onEdit={onEdit} />
          ))}
        </div>
      );
    }
    const page = pageOf(graph, block.id);
    if (page) {
      const rows = documentOutline(graph, page);
      return (
        <div className="mm-outline">
          <p className="mm-note">Showing the page that holds this selection.</p>
          {rows.map((row) => (
            <OutlineView key={`${row.kind}:${row.id}`} row={row}
              focused={focusId === row.id}
              onFocus={() => setFocusId(row.id)}
              onEdit={onEdit} />
          ))}
        </div>
      );
    }
    return <p className="mm-empty">Pick a folder or page to read its content.</p>;
  }

  if (tab === "Metadata") {
    return <Metadata graph={graph} id={block.id} suggestions={suggestions} onEdit={onEdit} />;
  }

  return <Links graph={graph} id={block.id} suggestions={suggestions} onEdit={onEdit} />;
}


function OutlineView({ row, focused, onFocus, onEdit }: {
  row: OutlineRow; focused: boolean; onFocus: () => void; onEdit: (edit: Edit) => void;
}) {
  const pad = { paddingLeft: `${row.depth * 14}px` };
  const className = `mm-row mm-${row.kind}${focused ? " mm-focus" : ""}`;

  if (row.kind === "section") {
    return (
      <div className={className} style={pad} onClick={onFocus}>
        <Name id={row.id} name={row.title} onEdit={onEdit} />
      </div>
    );
  }
  if (row.kind === "prose") {
    return <Prose className={className} style={pad} markdown={row.markdown} onFocus={onFocus} />;
  }
  if (row.kind === "code") {
    return (
      <pre className={className} style={pad} onClick={onFocus}>
        {row.language ? <span className="mm-lang">{row.language}</span> : null}
        <code>{row.text}</code>
      </pre>
    );
  }
  if (row.kind === "table") {
    return (
      <div className={className} style={pad} onClick={onFocus}>
        <table className="mm-table">
          <thead>
            <tr>{row.headers.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {row.rows.map((line, i) => (
              <tr key={i}>{line.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (row.kind === "list") {
    return (
      <ul className={className} style={pad} onClick={onFocus}>
        {row.items.map((item) => (
          <li key={item.id}>
            {item.done === undefined ? null : <span className="mm-check">{item.done ? "[x]" : "[ ]"} </span>}
            {item.text}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className={className} style={pad} onClick={onFocus}>
      <div className="mm-record-label">{row.label}</div>
      <dl className="mm-fields">
        {row.fields.map((field) => (
          <div key={field.name}><dt>{field.name}</dt><dd>{field.value}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function Prose({ className, style, markdown, onFocus }: {
  className: string; style: React.CSSProperties; markdown: string; onFocus: () => void;
}) {
  const html = useMemo(
    () => (markdown ? marked.parse(markdown, { async: false }) as string : ""),
    [markdown],
  );
  return (
    <div className={className} style={style} onClick={onFocus}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}


function Metadata({ graph, id, suggestions, onEdit }: {
  graph: Graph; id: Id; suggestions: Suggestions; onEdit: (edit: Edit) => void;
}) {
  const block = graph.blocks[id]!;
  const tags = block.tags ?? [];
  const held = suggestions[id];
  const fields = (block.fields ?? []).filter((entry) =>
    !["level", "lang", "done", "row.key"].includes(entry.name));

  return (
    <div className="mm-meta">
      <Name id={id} name={block.name ?? ""} onEdit={onEdit} />
      {held?.name?.length ? (
        <Chips label="name" values={held.name}
          onTake={(value) => onEdit({ do: "pick", id, of: "name", value })} />
      ) : null}

      <Tags id={id} tags={tags} offered={held?.tags ?? []} onEdit={onEdit} />

      <dl className="mm-fields">
        {block.source ? <div><dt>source</dt><dd>{block.source}</dd></div> : null}
        {fields.map((field) => (
          <div key={field.name}>
            <dt>{field.name}</dt>
            <dd>
              {field.value ?? ""}
              {held?.group?.length && field.name === "group" ? (
                <Chips label="" values={held.group}
                  onTake={(value) => onEdit({ do: "pick", id, of: "group", value })} />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}


function Links({ graph, id, suggestions, onEdit }: {
  graph: Graph; id: Id; suggestions: Suggestions; onEdit: (edit: Edit) => void;
}) {
  const page = pageOf(graph, id) ?? (graph.blocks[id]?.type === SET ? id : null);
  const scope = page ? subtree(graph, page) : new Set([id]);
  const relations = Object.values(graph.edges).filter((edge) =>
    scope.has(edge.from) || scope.has(edge.to));

  type Group = { otherPage: Id | null; type: string; edges: Relation[] };
  const groups = new Map<string, Group>();
  for (const edge of relations) {
    const outward = scope.has(edge.from);
    const other = outward ? edge.to : edge.from;
    const otherPage = pageOf(graph, other);
    const type = edge.type ?? LINK;
    const key = `${otherPage ?? other}:${type}`;
    const held = groups.get(key) ?? { otherPage, type, edges: [] };
    held.edges.push(edge);
    groups.set(key, held);
  }

  if (!groups.size) return <p className="mm-empty">No links from this selection.</p>;

  return (
    <ul className="mm-links">
      {[...groups.values()].map((group) => {
        const other = group.otherPage ? graph.blocks[group.otherPage] : null;
        const label = other?.name || (group.otherPage ?? "gone");
        const typeName = graph.defs[group.type]?.name ?? group.type;
        return (
          <li key={`${group.otherPage}:${group.type}`} className="mm-link-group">
            <div className="mm-link-head">
              <span className="mm-type">{typeName}</span>
              <span className="mm-other">{group.otherPage ? label : "gone"}</span>
              <span className="mm-count">{group.edges.length}</span>
            </div>
            <ul className="mm-link-edges">
              {group.edges.map((edge) => {
                const outward = scope.has(edge.from);
                const otherId = outward ? edge.to : edge.from;
                const other = graph.blocks[otherId];
                const offered = suggestions[edge.id]?.type ?? [];
                return (
                  <li key={edge.id}>
                    <span className="mm-way">{outward ? "→" : "←"}</span>
                    <span className="mm-other">{other?.name || other?.id || "gone"}</span>
                    {offered.length ? (
                      <Chips label="" values={offered}
                        onTake={(value) => onEdit({ do: "pick", id: edge.id, of: "type", value })} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}


function Name({ id, name, onEdit }: { id: Id; name: string; onEdit: (edit: Edit) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return <h2 className="mm-title" onDoubleClick={() => setDraft(name)}
      title="Double-click to rename">{name || id}</h2>;
  }
  const settle = (keep: boolean) => {
    if (keep && draft.trim() && draft !== name) onEdit({ do: "rename", id, name: draft.trim() });
    setDraft(null);
  };
  return (
    <input className="mm-title-input" autoFocus value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => settle(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") settle(true);
        if (event.key === "Escape") settle(false);
      }} />
  );
}

function Tags({ id, tags, offered, onEdit }: {
  id: Id; tags: string[]; offered: string[]; onEdit: (edit: Edit) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (tag: string) => {
    if (tag.trim()) onEdit({ do: "tag", id, tags: [...new Set([...tags, tag.trim()])] });
    setDraft("");
  };
  return (
    <div className="mm-tags">
      {tags.map((tag) => (
        <button key={tag} type="button" className="mm-tag"
          onClick={() => onEdit({ do: "tag", id, tags: tags.filter((each) => each !== tag) })}
          title="Click to drop">{tag}</button>
      ))}
      {offered.filter((tag) => !tags.includes(tag)).map((tag) => (
        <button key={tag} type="button" className="mm-tag mm-offered" onClick={() => add(tag)}
          title="Suggested">+ {tag}</button>
      ))}
      <input value={draft} placeholder="tag" onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") add(draft); }} />
    </div>
  );
}

function Chips({ label, values, onTake }: { label: string; values: string[]; onTake: (value: string) => void }) {
  return (
    <span className="mm-chips">
      {label ? <span className="mm-chip-label">{label}</span> : null}
      {values.map((value) => (
        <button key={value} type="button" className="mm-chip" onClick={() => onTake(value)}>{value}</button>
      ))}
    </span>
  );
}

function subtree(graph: Graph, root: Id): Set<Id> {
  const out = new Set<Id>([root]);
  const walk = (id: Id) => {
    for (const child of Object.values(graph.blocks)) {
      if (child.parent === id && !out.has(child.id)) {
        out.add(child.id);
        walk(child.id);
      }
    }
  };
  walk(root);
  return out;
}

import type { SegmentView } from "../types.js";

interface ContentPanelProps {
  segments: SegmentView[];
  onMove: (sourceNodeId: string, position: number) => void;
  onRemove: (sourceNodeId: string) => void;
}

/** One segment, and where it sits: how deep it is nested, and where it falls
 *  among its own siblings — which is what ordering acts on. */
interface Row {
  segment: SegmentView;
  depth: number;
  index: number;
  last: number;
}

/** The page as a **linear stack**, in emitted order. Nesting is drawn as an
 *  indent rather than as a collapsed branch: a heading that holds the rest of
 *  the page would otherwise hide the whole document behind one closed row. */
function rows(segments: SegmentView[], depth = 0, out: Row[] = []): Row[] {
  segments.forEach((segment, index) => {
    out.push({ segment, depth, index, last: segments.length - 1 });
    rows(segment.children, depth + 1, out);
  });
  return out;
}

export function ContentPanel({ segments, onMove, onRemove }: ContentPanelProps) {
  if (segments.length === 0) {
    return <div className="content-panel empty-state">Select a page to see its content.</div>;
  }

  return (
    <div className="content-panel">
      <ul className="segment-list">
        {rows(segments).map((row) => (
          <SegmentBlock
            key={row.segment.id}
            row={row}
            onMoveUp={() => onMove(row.segment.sourceNodeId, Math.max(0, row.index - 1))}
            onMoveDown={() => onMove(row.segment.sourceNodeId, Math.min(row.last, row.index + 1))}
            onRemove={() => onRemove(row.segment.sourceNodeId)}
          />
        ))}
      </ul>
    </div>
  );
}

function SegmentBlock({
  row,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  row: Row;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { segment, depth, index, last } = row;
  const state = segment.resolution !== "resolved" ? segment.resolution
              : segment.overridden ? "overridden" : null;

  return (
    <li className="segment-block" style={{ marginLeft: depth * 20 }}>
      <details>
        <summary>
          <span className="segment-title">{segment.title}</span>
          <span className="badge">{segment.kind}</span>
          {state ? (
            <span className={`badge ${segment.resolution !== "resolved" ? "warn" : ""}`}>{state}</span>
          ) : null}
          <span className="segment-actions">
            <button type="button" title="move up" disabled={index === 0}
                    onClick={(event) => { event.preventDefault(); onMoveUp(); }}>↑</button>
            <button type="button" title="move down" disabled={index === last}
                    onClick={(event) => { event.preventDefault(); onMoveDown(); }}>↓</button>
            <button type="button" title="drop from this page"
                    onClick={(event) => { event.preventDefault(); onRemove(); }}>Remove</button>
          </span>
        </summary>
        {segment.body ? <pre className="body">{segment.body}</pre> : null}
      </details>
    </li>
  );
}

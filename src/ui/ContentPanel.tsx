import type { SegmentView } from "../types.js";

interface ContentPanelProps {
  segments: SegmentView[];
  onMove: (sourceNodeId: string, position: number) => void;
  onRemove: (sourceNodeId: string) => void;
}

export function ContentPanel({ segments, onMove, onRemove }: ContentPanelProps) {
  if (segments.length === 0) {
    return <div className="content-panel empty-state">Select a page to edit its segments.</div>;
  }

  return (
    <div className="content-panel">
      <SegmentList segments={segments} onMove={onMove} onRemove={onRemove} />
    </div>
  );
}

/** One level of the stack. Nesting recurses through here rather than through a
 *  block, so a child is ordered among **its own** siblings — reusing a
 *  parent's handlers would move the parent instead. */
function SegmentList({ segments, onMove, onRemove }: ContentPanelProps) {
  return (
    <ul className="segment-list">
      {segments.map((segment, index) => (
        <SegmentBlock
          key={segment.id}
          segment={segment}
          onMoveUp={() => onMove(segment.sourceNodeId, Math.max(0, index - 1))}
          onMoveDown={() => onMove(segment.sourceNodeId, Math.min(segments.length - 1, index + 1))}
          onRemove={() => onRemove(segment.sourceNodeId)}
          onMove={onMove}
          onRemoveAny={onRemove}
        />
      ))}
    </ul>
  );
}

function SegmentBlock({
  segment,
  onMoveUp,
  onMoveDown,
  onRemove,
  onMove,
  onRemoveAny,
}: {
  segment: SegmentView;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onMove: ContentPanelProps["onMove"];
  onRemoveAny: ContentPanelProps["onRemove"];
}) {
  const stateBadge = segment.resolution !== "resolved"
    ? segment.resolution
    : segment.overridden ? "overridden" : null;

  return (
    <li className="segment-block">
      <details>
        <summary>
          <span>{segment.title}</span>
          <span className="badge">{segment.kind}</span>
          {stateBadge ? <span className={`badge ${segment.resolution !== "resolved" ? "warn" : ""}`}>{stateBadge}</span> : null}
          <span className="segment-actions">
            <button type="button" onClick={(event) => { event.preventDefault(); onMoveUp(); }}>↑</button>
            <button type="button" onClick={(event) => { event.preventDefault(); onMoveDown(); }}>↓</button>
            <button type="button" onClick={(event) => { event.preventDefault(); onRemove(); }}>Remove</button>
          </span>
        </summary>
        {segment.body ? <pre className="body">{segment.body}</pre> : null}
        {segment.children.length > 0 ? (
          <SegmentList segments={segment.children} onMove={onMove} onRemove={onRemoveAny} />
        ) : null}
      </details>
    </li>
  );
}

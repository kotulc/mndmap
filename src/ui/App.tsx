import { Background, Controls, ReactFlow, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toMndflowGraph } from "../mndflow/adapter.js";
import type { ChangeView, Claim, ExportPatch, FieldValue, RecordView } from "../types.js";
import { createDashboardApi, type CollectionView, type DashboardApi } from "./api.js";

type ViewMode = "table" | "graph";

export function App({ api = createDashboardApi() }: { api?: DashboardApi }) {
  const [collections, setCollections] = useState<CollectionView[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [records, setRecords] = useState<RecordView[]>([]);
  const [recordId, setRecordId] = useState("");
  const [changes, setChanges] = useState<ChangeView[]>([]);
  const [mode, setMode] = useState<ViewMode>("table");
  const [ownerId, setOwnerId] = useState("dashboard");
  const [feedback, setFeedback] = useState("Loading ledger…");
  const [preview, setPreview] = useState<ExportPatch[]>([]);

  const collection = collections.find((item) => item.id === collectionId);
  const record = records.find((item) => item.id === recordId);

  const loadCollections = useCallback(async () => {
    try {
      const next = await api.collections();
      setCollections(next);
      setCollectionId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? "");
      setFeedback(next.length ? "" : "No collections imported.");
    } catch (error) {
      setFeedback(message(error));
    }
  }, [api]);

  const refresh = useCallback(async () => {
    if (!collectionId) return;
    try {
      const [nextRecords, nextChanges] = await Promise.all([api.records(collectionId), api.changes()]);
      setRecords(nextRecords);
      setChanges(nextChanges);
      setRecordId((current) => nextRecords.some((item) => item.id === current) ? current : nextRecords[0]?.id ?? "");
    } catch (error) {
      setFeedback(message(error));
    }
  }, [api, collectionId]);

  useEffect(() => { void loadCollections(); }, [loadCollections]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      setFeedback(success);
      await refresh();
    } catch (error) {
      setFeedback(message(error));
    }
  };

  const previewExport = async () => {
    try {
      const patches = await api.previewExport();
      setPreview(patches);
      setFeedback(patches.length ? `Preview ready: ${patches.length} file${patches.length === 1 ? "" : "s"}.` : "Nothing pending to export.");
    } catch (error) {
      setPreview([]);
      setFeedback(`Export conflict: ${message(error)}`);
    }
  };

  const applyExport = async () => {
    try {
      const patches = await api.applyExport();
      setPreview([]);
      setFeedback(`Exported ${patches.length} file${patches.length === 1 ? "" : "s"}.`);
      await refresh();
    } catch (error) {
      setFeedback(`Export conflict: ${message(error)}`);
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div><span className="eyebrow">local ledger</span><h1>mndmap</h1></div>
        <label className="owner">Claim owner<input value={ownerId} onChange={(event) => setOwnerId(event.target.value)} /></label>
      </header>

      <aside className="collections" aria-label="Collections">
        <h2>Collections</h2>
        <nav>
          {collections.map((item) => (
            <button className={item.id === collectionId ? "active" : ""} key={item.id} onClick={() => setCollectionId(item.id)}>
              <span>{item.name}</span><small>{item.fields.length} fields</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <div className="workspace-head">
          <div><span className="eyebrow">{records.length} ordered records</span><h2>{collection?.name ?? "Collection"}</h2></div>
          <div className="segmented" aria-label="View">
            <button aria-pressed={mode === "table"} onClick={() => setMode("table")}>Table</button>
            <button aria-pressed={mode === "graph"} onClick={() => setMode("graph")}>Graph</button>
          </div>
        </div>
        {collection && mode === "table"
          ? <RecordTable collection={collection} records={records} selectedId={recordId} onSelect={setRecordId} />
          : collection && <RecordGraph collection={collection} records={records} onSelect={setRecordId} />}
      </section>

      <aside className="detail">
        {record
          ? <RecordDetail record={record} collection={collection} ownerId={ownerId} api={api} run={run} />
          : <div className="empty">Select a record to inspect it.</div>}
      </aside>

      <section className="changes">
        <div className="panel-head"><div><span className="eyebrow">Review</span><h2>Pending changes</h2></div><strong>{changes.length}</strong></div>
        <div className="change-list">
          {changes.length === 0 && <p className="muted">No source-backed changes.</p>}
          {changes.map((change) => <ChangeCard change={change} key={change.id} />)}
        </div>
        <div className="export-actions">
          <button onClick={() => void previewExport()}>Preview export</button>
          <button className="primary" disabled={!changes.length} onClick={() => void applyExport()}>Export</button>
        </div>
        {preview.map((patch) => (
          <details className="patch" key={patch.document}>
            <summary>{patch.document}</summary>
            <pre>{patch.after}</pre>
          </details>
        ))}
      </section>

      <output className="status" aria-live="polite">{feedback}</output>
    </main>
  );
}

function RecordTable({ collection, records, selectedId, onSelect }: {
  collection: CollectionView; records: RecordView[]; selectedId: string; onSelect: (id: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>#</th>{collection.fields.map((field) => <th key={field.id}>{field.sourceName}</th>)}<th>State</th></tr></thead>
        <tbody>
          {records.map((record, index) => (
            <tr className={record.id === selectedId ? "selected" : ""} key={record.id} onClick={() => onSelect(record.id)}>
              <td>{index + 1}</td>
              {collection.fields.map((field) => <td key={field.id}>{renderValue(record.values[field.id])}</td>)}
              <td><StateDots record={record} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordGraph({ collection, records, onSelect }: {
  collection: CollectionView; records: RecordView[]; onSelect: (id: string) => void;
}) {
  const graph = useMemo(() => toMndflowGraph(collection, records), [collection, records]);
  const nodes: FlowNode[] = graph.elements.map((element, index) => ({
    id: element.id,
    position: { x: (index % 3) * 240, y: Math.floor(index / 3) * 120 },
    data: { label: element.label },
    className: `${element.data.staged ? "is-staged" : ""} ${element.data.claimed ? "is-claimed" : ""}`,
  }));
  const edges: FlowEdge[] = graph.edges.map((edge) => ({ ...edge, type: "smoothstep" }));
  return (
    <div className="graph">
      <ReactFlow nodes={nodes} edges={edges} fitView onNodeClick={(_, node) => onSelect(node.id)} nodesDraggable={false} nodesConnectable={false}>
        <Background gap={20} size={1} /><Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function RecordDetail({ record, collection, ownerId, api, run }: {
  record: RecordView;
  collection: CollectionView | undefined;
  ownerId: string;
  api: DashboardApi;
  run: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const ownedClaim = record.claim?.ownerId === ownerId ? record.claim : null;
  const scratchFields = collection?.scratchFields?.length
    ? collection.scratchFields
    : [{ id: "open_field", alias: "open_field" }];
  const claim = () => run(() => api.claim(ownerId, record.collectionId, record.id), `Claimed ${record.id}.`);
  const release = () => ownedClaim && run(() => api.release(ownerId, ownedClaim), `Released ${record.id}.`);

  return (
    <>
      <div className="panel-head"><div><span className="eyebrow">Record detail</span><h2>{record.id}</h2></div><StateDots record={record} /></div>
      <dl>
        {Object.entries(record.values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{renderValue(value)}</dd></div>)}
      </dl>
      <div className="claim-box">
        <span>{record.claim ? `Claimed by ${record.claim.ownerId}` : "Available to claim"}</span>
        {!record.claim && <button disabled={!ownerId.trim()} onClick={() => void claim()}>Claim</button>}
        {ownedClaim && <button onClick={() => void release()}>Release</button>}
      </div>
      {scratchFields.map((field) => (
        <ScratchEditor key={field.id} field={field} record={record} ownerId={ownerId} claim={ownedClaim} api={api} run={run} />
      ))}
      <p className="meta">Identity: {record.identityConfidence} · source order {record.order}</p>
    </>
  );
}

function ScratchEditor({ field, record, ownerId, claim, api, run }: {
  field: { id: string; alias: string };
  record: RecordView;
  ownerId: string;
  claim: Claim | null;
  api: DashboardApi;
  run: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(record.scratch[field.alias] ?? "");
  useEffect(() => setDraft(record.scratch[field.alias] ?? ""), [field.alias, record]);
  const save = () => claim && run(() => api.apply(ownerId, [{
    type: "scratch", collectionId: record.collectionId, recordId: record.id,
    token: claim.token, field: field.id, value: draft,
  }]), `${field.alias} saved.`);
  return (
    <>
      <label className="scratch">{field.alias}<textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!claim} placeholder="Claim this record to add working notes." /></label>
      <button className="primary save" disabled={!claim} onClick={() => void save()}>
        {field.alias === "open_field" ? "Save scratch" : `Save ${field.alias}`}
      </button>
    </>
  );
}

function ChangeCard({ change }: { change: ChangeView }) {
  return <article className="change-card"><div><strong>Change {change.id}</strong><small>{change.actor} · {change.createdAt}</small></div><span>{change.operations.length} operation{change.operations.length === 1 ? "" : "s"}</span></article>;
}

function StateDots({ record }: { record: RecordView }) {
  return <span className="state-dots" aria-label={`${record.claim ? "claimed" : "unclaimed"}${record.staged ? ", staged" : ""}`}>
    {record.claim && <i className="claimed" title="Claimed" />}{record.staged && <i className="staged" title="Staged" />}
  </span>;
}

function renderValue(value: FieldValue | undefined): string {
  if (Array.isArray(value)) return value.map(renderValue).join(", ");
  return value === null || value === undefined ? "—" : String(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

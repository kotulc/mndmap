import { DatabaseSync } from "node:sqlite";
import type { ChangeView, Claim, Diagnostic, FieldValue, MndmapConfig, Mutation, ParsedDocument, RecordView } from "./types.js";

export interface RecordQuery {
  sort?: string;
  direction?: "asc" | "desc";
  filters?: Record<string, FieldValue>;
  search?: string;
  claimed?: boolean;
}

export class LedgerState {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL");
    this.migrate();
  }

  close(): void { this.db.close(); }

  importDocuments(
    documents: ParsedDocument[],
    config: MndmapConfig,
    options: { afterExport?: boolean; forceClaims?: boolean } = {},
  ): void {
    this.transaction(() => {
      this.expireClaims();
      if (this.activeClaims() > 0) {
        if (options.afterExport && options.forceClaims) this.db.prepare("DELETE FROM claims").run();
        else throw new Error("Cannot import while claims are active");
      }
      const activePending = Number((this.db.prepare("SELECT count(*) n FROM pending_changes").get() as any).n);
      if (activePending && !options.afterExport) throw new Error("Cannot import while source-backed changes are pending export");
      this.db.prepare("DELETE FROM diagnostics").run();
      this.db.prepare("DELETE FROM source_documents").run();
      this.db.prepare("DELETE FROM collections").run();
      this.db.prepare("DELETE FROM records").run();
      for (const document of documents) {
        this.db.prepare("INSERT INTO source_documents(path, revision, content) VALUES (?, ?, ?)").run(document.path, document.revision, document.content);
        for (const diagnostic of document.diagnostics) {
          this.db.prepare("INSERT INTO diagnostics(code,severity,message,document,range_json) VALUES (?,?,?,?,?)")
            .run(diagnostic.code, diagnostic.severity, diagnostic.message, diagnostic.document ?? null, diagnostic.range ? JSON.stringify(diagnostic.range) : null);
        }
        for (const collection of document.collections) {
          this.db.prepare(`INSERT INTO collections(id,name,fields,capabilities,source_regions)
            VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,fields=excluded.fields,capabilities=excluded.capabilities,source_regions=excluded.source_regions`)
            .run(collection.id, collection.name, JSON.stringify(collection.fields), JSON.stringify(collection.capabilities), JSON.stringify(collection.sourceRegions));
          for (const record of collection.records) {
            this.db.prepare(`INSERT INTO records(collection_id,id,values_json,source_order,identity_confidence,locations,deleted)
              VALUES (?,?,?,?,?,?,0) ON CONFLICT(collection_id,id) DO UPDATE SET values_json=excluded.values_json,source_order=excluded.source_order,identity_confidence=excluded.identity_confidence,locations=excluded.locations,deleted=0`)
              .run(collection.id, record.id, JSON.stringify(record.values), record.order, record.identityConfidence, JSON.stringify(record.locations));
          }
        }
      }
      const valid = new Set(documents.flatMap((doc) => doc.collections.flatMap((collection) => collection.records.map((record) => `${collection.id}\0${record.id}`))));
      for (const row of this.db.prepare("SELECT collection_id,record_id FROM scratch_values").all() as any[]) {
        if (!valid.has(`${row.collection_id}\0${row.record_id}`)) {
          this.db.prepare("INSERT INTO diagnostics(code,severity,message) VALUES ('orphaned-scratch','warning',?)").run(`Scratch retained for missing record ${row.collection_id}/${row.record_id}`);
        }
      }
      this.db.prepare("DELETE FROM scratch_catalog").run();
      for (const field of config.scratchFields) this.db.prepare("INSERT INTO scratch_catalog(id,alias) VALUES (?,?)").run(field.id, field.alias);
      if (options.afterExport) this.db.prepare("DELETE FROM pending_changes").run();
    });
  }

  listCollections(): any[] {
    const scratchFields = (this.db.prepare("SELECT id,alias FROM scratch_catalog ORDER BY rowid").all() as any[])
      .map((row) => ({ id: row.id, alias: row.alias }));
    return (this.db.prepare("SELECT * FROM collections ORDER BY id").all() as any[]).map((row) => ({
      id: row.id, name: row.name, fields: JSON.parse(row.fields), capabilities: JSON.parse(row.capabilities),
      sourceRegions: JSON.parse(row.source_regions), scratchFields,
    }));
  }

  listRecords(collectionId: string, query: RecordQuery = {}): RecordView[] {
    this.expireClaims();
    let records = (this.db.prepare("SELECT * FROM records WHERE collection_id=? AND deleted=0 ORDER BY source_order,id").all(collectionId) as any[]).map((row) => this.view(row));
    if (query.filters) records = records.filter((record) => Object.entries(query.filters!).every(([field, value]) => record.values[field] === value));
    if (query.search) {
      const needle = query.search.toLowerCase();
      records = records.filter((record) => JSON.stringify({ ...record.values, ...record.scratch }).toLowerCase().includes(needle));
    }
    if (query.claimed !== undefined) records = records.filter((record) => Boolean(record.claim) === query.claimed);
    if (query.sort) {
      const field = query.sort;
      const direction = query.direction === "desc" ? -1 : 1;
      records.sort((a, b) => String(a.values[field] ?? "").localeCompare(String(b.values[field] ?? "")) * direction || a.order - b.order);
    }
    return records;
  }

  getRecord(collectionId: string, recordId: string): RecordView | null {
    this.expireClaims();
    const row = this.db.prepare("SELECT * FROM records WHERE collection_id=? AND id=? AND deleted=0").get(collectionId, recordId) as any;
    return row ? this.view(row) : null;
  }

  claim(ownerId: string, refs: Array<{ collectionId: string; recordId: string }>, leaseSeconds: number): { granted: Claim[]; denied: Array<{ collectionId: string; recordId: string }> } {
    if (!ownerId || leaseSeconds <= 0) throw new Error("ownerId and positive lease duration are required");
    return this.transaction(() => {
      this.expireClaims();
      const granted: Claim[] = [];
      const denied: Array<{ collectionId: string; recordId: string }> = [];
      for (const ref of uniqueRefs(refs)) {
        if (!this.db.prepare("SELECT 1 FROM records WHERE collection_id=? AND id=? AND deleted=0").get(ref.collectionId, ref.recordId)) {
          denied.push(ref); continue;
        }
        const existing = this.db.prepare("SELECT 1 FROM claims WHERE collection_id=? AND record_id=?").get(ref.collectionId, ref.recordId);
        if (existing) { denied.push(ref); continue; }
        this.db.prepare("UPDATE fence SET value=value+1 WHERE singleton=1").run();
        const token = Number((this.db.prepare("SELECT value FROM fence WHERE singleton=1").get() as any).value);
        const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
        this.db.prepare("INSERT INTO claims(collection_id,record_id,owner_id,token,expires_at) VALUES (?,?,?,?,?)").run(ref.collectionId, ref.recordId, ownerId, token, expiresAt);
        granted.push({ ...ref, ownerId, token, expiresAt });
      }
      return { granted, denied };
    });
  }

  renew(ownerId: string, claims: Array<{ collectionId: string; recordId: string; token: number }>, leaseSeconds: number): Claim[] {
    if (!ownerId || leaseSeconds <= 0) throw new Error("ownerId and positive lease duration are required");
    return this.transaction(() => {
      this.expireClaims();
      return claims.map((claim) => {
        const current = this.requireClaim(claim.collectionId, claim.recordId, claim.token, ownerId);
        const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
        this.db.prepare("UPDATE claims SET expires_at=? WHERE collection_id=? AND record_id=?").run(expiresAt, claim.collectionId, claim.recordId);
        return { ...current, expiresAt };
      });
    });
  }

  release(ownerId: string, claims: Array<{ collectionId: string; recordId: string; token: number }>): void {
    this.transaction(() => {
      this.expireClaims();
      for (const claim of claims) {
        const current = this.db.prepare("SELECT * FROM claims WHERE collection_id=? AND record_id=?").get(claim.collectionId, claim.recordId) as any;
        if (!current) continue;
        if (current.owner_id !== ownerId || Number(current.token) !== claim.token) throw new Error(`Stale claim for ${claim.collectionId}/${claim.recordId}`);
        this.db.prepare("DELETE FROM claims WHERE collection_id=? AND record_id=?").run(claim.collectionId, claim.recordId);
      }
    });
  }

  apply(actor: string, operations: Mutation[]): number {
    if (!actor || operations.length === 0) throw new Error("Actor and operations are required");
    const ids = operations.map((op) => `${op.collectionId}\0${op.recordId}`);
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate record IDs in one mutation batch");
    return this.transaction(() => {
      this.expireClaims();
      const before: any[] = [];
      const after: any[] = [];
      let sourceBacked = false;
      for (const operation of operations) {
        if (operation.type === "create") {
          const collection = this.collection(operation.collectionId);
          const existing = this.db.prepare("SELECT * FROM records WHERE collection_id=? AND id=?").get(operation.collectionId, operation.recordId) as any;
          if (existing && !existing.deleted) throw new Error(`Record ${operation.recordId} already exists`);
          if (!existing && !collection.capabilities.create) throw new Error(`Collection ${operation.collectionId} does not support create`);
          if (existing && existing.deleted && JSON.stringify(operation.values) !== existing.values_json) {
            throw new Error("Deleted records can only be restored with their original values");
          }
          this.validateFields(collection, operation.values);
          before.push(null);
          if (existing) {
            this.db.prepare("UPDATE records SET values_json=?,deleted=0 WHERE collection_id=? AND id=?")
              .run(JSON.stringify(operation.values), operation.collectionId, operation.recordId);
          } else {
            const order = Number((this.db.prepare("SELECT coalesce(max(source_order),-1)+1 n FROM records WHERE collection_id=?").get(operation.collectionId) as any).n);
            this.db.prepare("INSERT INTO records(collection_id,id,values_json,source_order,identity_confidence,locations,deleted) VALUES (?,?,?,?,?,?,0)")
              .run(operation.collectionId, operation.recordId, JSON.stringify(operation.values), order, "configured", "[]");
          }
          after.push(operation.values); sourceBacked = true;
        } else {
          const row = this.record(operation.collectionId, operation.recordId);
          this.requireClaim(operation.collectionId, operation.recordId, operation.token, actor);
          if (operation.type === "scratch") {
            const field = this.resolveScratch(operation.field);
            before.push(this.db.prepare("SELECT value FROM scratch_values WHERE collection_id=? AND record_id=? AND field_id=?").get(operation.collectionId, operation.recordId, field)?.value ?? null);
            this.db.prepare(`INSERT INTO scratch_values(collection_id,record_id,field_id,value) VALUES (?,?,?,?)
              ON CONFLICT(collection_id,record_id,field_id) DO UPDATE SET value=excluded.value`).run(operation.collectionId, operation.recordId, field, operation.value);
            after.push(operation.value);
          } else if (operation.type === "delete") {
            const collection = this.collection(operation.collectionId);
            if (!collection.capabilities.delete) throw new Error(`Collection ${operation.collectionId} does not support delete`);
            before.push(JSON.parse(row.values_json)); after.push(null);
            this.db.prepare("UPDATE records SET deleted=1 WHERE collection_id=? AND id=?").run(operation.collectionId, operation.recordId);
            sourceBacked = true;
          } else {
            const collection = this.collection(operation.collectionId);
            this.validateFields(collection, operation.values);
            const previous = JSON.parse(row.values_json);
            const next = { ...previous, ...operation.values };
            before.push(previous); after.push(next);
            this.db.prepare("UPDATE records SET values_json=? WHERE collection_id=? AND id=?").run(JSON.stringify(next), operation.collectionId, operation.recordId);
            sourceBacked = true;
          }
        }
      }
      const history = this.db.prepare("INSERT INTO history(actor,operations,before_json,after_json,created_at,reversed_by) VALUES (?,?,?,?,?,NULL)")
        .run(actor, JSON.stringify(operations), JSON.stringify(before), JSON.stringify(after), new Date().toISOString());
      const historyId = Number(history.lastInsertRowid);
      if (sourceBacked) this.db.prepare("INSERT INTO pending_changes(history_id) VALUES (?)").run(historyId);
      return historyId;
    });
  }

  reverse(historyId: number, actor: string, tokens: Record<string, number>): number {
    const history = this.db.prepare("SELECT * FROM history WHERE id=?").get(historyId) as any;
    if (!history || history.reversed_by) throw new Error("History entry does not exist or was already reversed");
    const operations = JSON.parse(history.operations) as Mutation[];
    const before = JSON.parse(history.before_json);
    const inverse: Mutation[] = operations.map((operation, index) => {
      const token = tokens[`${operation.collectionId}/${operation.recordId}`]!;
      if (operation.type === "create") return { type: "delete", collectionId: operation.collectionId, recordId: operation.recordId, token };
      if (operation.type === "delete") return { type: "create", collectionId: operation.collectionId, recordId: operation.recordId, values: before[index] };
      if (operation.type === "scratch") return { ...operation, token, value: before[index] ?? "" };
      return { ...operation, token, values: Object.fromEntries(Object.keys(operation.values).map((field) => [field, before[index][field]])) };
    });
    const reversalId = this.apply(actor, inverse);
    this.db.prepare("UPDATE history SET reversed_by=? WHERE id=?").run(reversalId, historyId);
    return reversalId;
  }

  pendingHistory(): ChangeView[] {
    return (this.db.prepare("SELECT h.* FROM history h JOIN pending_changes p ON p.history_id=h.id ORDER BY h.id").all() as any[]).map((row) => ({
      id: Number(row.id),
      actor: row.actor,
      operations: JSON.parse(row.operations),
      before: JSON.parse(row.before_json),
      after: JSON.parse(row.after_json),
      createdAt: row.created_at,
      reversedBy: row.reversed_by === null ? null : Number(row.reversed_by),
    }));
  }

  activeClaims(): number {
    this.expireClaims();
    return Number((this.db.prepare("SELECT count(*) n FROM claims").get() as any).n);
  }

  completeExport(documents: Array<{ path: string; revision: string; content: string }>): void {
    this.transaction(() => {
      for (const document of documents) this.db.prepare("UPDATE source_documents SET revision=?,content=? WHERE path=?").run(document.revision, document.content, document.path);
      this.db.prepare("DELETE FROM pending_changes").run();
    });
  }

  sourceDocuments(): any[] { return this.db.prepare("SELECT * FROM source_documents ORDER BY path").all() as any[]; }
  rawRecords(): any[] { return this.db.prepare("SELECT * FROM records ORDER BY collection_id,source_order").all() as any[]; }
  diagnostics(): Diagnostic[] {
    return (this.db.prepare("SELECT * FROM diagnostics ORDER BY id").all() as any[]).map((row) => ({
      code: row.code,
      severity: row.severity,
      message: row.message,
      ...(row.document === null ? {} : { document: row.document }),
      ...(row.range_json === null ? {} : { range: JSON.parse(row.range_json) }),
    }));
  }

  private view(row: any): RecordView {
    const scratch = Object.fromEntries((this.db.prepare(`SELECT c.alias,s.value FROM scratch_values s JOIN scratch_catalog c ON c.id=s.field_id
      WHERE s.collection_id=? AND s.record_id=?`).all(row.collection_id, row.id) as any[]).map((entry) => [entry.alias, entry.value]));
    const claimRow = this.db.prepare("SELECT * FROM claims WHERE collection_id=? AND record_id=?").get(row.collection_id, row.id) as any;
    const staged = (this.db.prepare(`SELECT h.operations FROM pending_changes p JOIN history h ON h.id=p.history_id`).all() as any[])
      .some((history) => (JSON.parse(history.operations) as Mutation[]).some((operation) =>
        operation.collectionId === row.collection_id && operation.recordId === row.id));
    return {
      collectionId: row.collection_id, id: row.id, values: JSON.parse(row.values_json), scratch,
      order: row.source_order, identityConfidence: row.identity_confidence, staged,
      claim: claimRow ? { collectionId: row.collection_id, recordId: row.id, ownerId: claimRow.owner_id, token: Number(claimRow.token), expiresAt: claimRow.expires_at } : null,
    };
  }

  private collection(id: string): any {
    const row = this.db.prepare("SELECT * FROM collections WHERE id=?").get(id) as any;
    if (!row) throw new Error(`Unknown collection ${id}`);
    return { ...row, fields: JSON.parse(row.fields), capabilities: JSON.parse(row.capabilities) };
  }

  private record(collectionId: string, recordId: string): any {
    const row = this.db.prepare("SELECT * FROM records WHERE collection_id=? AND id=? AND deleted=0").get(collectionId, recordId) as any;
    if (!row) throw new Error(`Unknown record ${collectionId}/${recordId}`);
    return row;
  }

  private validateFields(collection: any, values: Record<string, FieldValue>): void {
    const known = new Set(collection.fields.map((field: any) => field.id));
    const writable = new Set(collection.capabilities.writableFields);
    for (const field of Object.keys(values)) {
      if (!known.has(field)) throw new Error(`Cannot create source-backed field ${field}`);
      if (!writable.has(field)) throw new Error(`Field ${field} is read-only`);
    }
  }

  private requireClaim(collectionId: string, recordId: string, token: number, ownerId?: string): Claim {
    const row = this.db.prepare("SELECT * FROM claims WHERE collection_id=? AND record_id=?").get(collectionId, recordId) as any;
    if (!row || Number(row.token) !== token || (ownerId && row.owner_id !== ownerId)) throw new Error(`Missing or stale claim for ${collectionId}/${recordId}`);
    return { collectionId, recordId, ownerId: row.owner_id, token: Number(row.token), expiresAt: row.expires_at };
  }

  private resolveScratch(idOrAlias: string): string {
    const row = this.db.prepare("SELECT id FROM scratch_catalog WHERE id=? OR alias=?").get(idOrAlias, idOrAlias) as any;
    if (!row) throw new Error(`Unknown scratch field ${idOrAlias}`);
    return row.id;
  }

  private expireClaims(): void {
    this.db.prepare("DELETE FROM claims WHERE expires_at<=?").run(new Date().toISOString());
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_documents(path TEXT PRIMARY KEY, revision TEXT NOT NULL, content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, name TEXT NOT NULL, fields TEXT NOT NULL, capabilities TEXT NOT NULL, source_regions TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records(collection_id TEXT NOT NULL, id TEXT NOT NULL, values_json TEXT NOT NULL, source_order INTEGER NOT NULL, identity_confidence TEXT NOT NULL, locations TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(collection_id,id), FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS scratch_catalog(id TEXT PRIMARY KEY, alias TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS scratch_values(collection_id TEXT NOT NULL, record_id TEXT NOT NULL, field_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(collection_id,record_id,field_id));
      CREATE TABLE IF NOT EXISTS claims(collection_id TEXT NOT NULL, record_id TEXT NOT NULL, owner_id TEXT NOT NULL, token INTEGER NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY(collection_id,record_id));
      CREATE TABLE IF NOT EXISTS fence(singleton INTEGER PRIMARY KEY CHECK(singleton=1), value INTEGER NOT NULL);
      INSERT OR IGNORE INTO fence(singleton,value) VALUES (1,0);
      CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, operations TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL, reversed_by INTEGER);
      CREATE TABLE IF NOT EXISTS pending_changes(history_id INTEGER PRIMARY KEY REFERENCES history(id));
      CREATE TABLE IF NOT EXISTS diagnostics(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL, document TEXT, range_json TEXT);
    `);
    const diagnosticColumns = new Set((this.db.prepare("PRAGMA table_info(diagnostics)").all() as any[]).map((column) => column.name));
    if (!diagnosticColumns.has("document")) this.db.exec("ALTER TABLE diagnostics ADD COLUMN document TEXT");
    if (!diagnosticColumns.has("range_json")) this.db.exec("ALTER TABLE diagnostics ADD COLUMN range_json TEXT");
  }
}

function uniqueRefs<T extends { collectionId: string; recordId: string }>(refs: T[]): T[] {
  const seen = new Set<string>();
  return refs.filter((ref) => { const key = `${ref.collectionId}\0${ref.recordId}`; if (seen.has(key)) return false; seen.add(key); return true; });
}


import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { Exporter } from "./exporter.js";
import { parseWorkspace } from "./parser.js";
import { LedgerState, type RecordQuery } from "./state.js";
import type { ChangeView, ExportPatch, ImportResult, MndmapConfig, Mutation } from "./types.js";

export class Mndmap {
  readonly exporter: Exporter;

  private constructor(readonly root: string, readonly config: MndmapConfig, readonly state: LedgerState) {
    this.exporter = new Exporter(root, state, config);
  }

  static async open(root: string, options: { memory?: boolean; configFile?: string } = {}): Promise<Mndmap> {
    const absoluteRoot = resolve(root);
    const config = await loadConfig(absoluteRoot, options.configFile);
    let database = ":memory:";
    if (!options.memory) {
      const stateDir = join(absoluteRoot, ".mndmap");
      await mkdir(stateDir, { recursive: true });
      database = join(stateDir, "state.sqlite");
    }
    return new Mndmap(absoluteRoot, config, new LedgerState(database));
  }

  async import(): Promise<ImportResult> {
    this.state.importDocuments(await parseWorkspace(this.root, this.config), this.config);
    return {
      collections: this.collections().length,
      records: this.collections().reduce((count, collection) => count + this.records(collection.id).length, 0),
      diagnostics: this.diagnostics(),
    };
  }

  collections(): any[] { return this.state.listCollections(); }
  records(collectionId: string, query?: RecordQuery) { return this.state.listRecords(collectionId, query); }
  record(collectionId: string, recordId: string) { return this.state.getRecord(collectionId, recordId); }

  claim(ownerId: string, refs: Array<{ collectionId: string; recordId: string }>, leaseSeconds = this.config.claims.defaultLeaseSeconds) {
    return this.state.claim(ownerId, refs, leaseSeconds);
  }

  renew(ownerId: string, claims: Array<{ collectionId: string; recordId: string; token: number }>, leaseSeconds = this.config.claims.defaultLeaseSeconds) {
    return this.state.renew(ownerId, claims, leaseSeconds);
  }

  release(ownerId: string, claims: Array<{ collectionId: string; recordId: string; token: number }>) {
    return this.state.release(ownerId, claims);
  }

  apply(actor: string, operations: Mutation[]): number { return this.state.apply(actor, operations); }
  reverse(historyId: number, actor: string, tokens: Record<string, number>): number { return this.state.reverse(historyId, actor, tokens); }
  pendingChanges(): ChangeView[] { return this.state.pendingHistory(); }
  diagnostics() { return this.state.diagnostics(); }
  exportPreview(forceClaims = false): Promise<ExportPatch[]> { return this.exporter.preview({ forceClaims }); }
  exportApply(forceClaims = false): Promise<ExportPatch[]> { return this.exporter.apply({ forceClaims }); }
  close(): void { this.state.close(); }
}

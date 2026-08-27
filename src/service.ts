import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { emitApply, emitPreview, reportAbandonedStaging } from "./emit/index.js";
import { graphFile, checkVocabulary } from "./graph/builder.js";
import { parseWorkspace } from "./parser.js";
import type {
  CreateGroupInput,
  DiagramSettingsInput,
  ImportResult,
  MoveOrganizationInput,
  RenameOrganizationInput,
  ResolveReconciliationInput,
} from "./types.js";
import { WorkingStore } from "./working-store.js";

export class Mndmap {
  private constructor(
    readonly root: string,
    readonly config: Awaited<ReturnType<typeof loadConfig>>,
    readonly store: WorkingStore,
  ) {}

  static async build(root: string, options: { configFile?: string } = {}): Promise<import("./types.js").EmitPreview> {
    const absoluteRoot = resolve(root);
    const config = await loadConfig(absoluteRoot, options.configFile);
    const store = new WorkingStore(":memory:");
    const service = new Mndmap(absoluteRoot, config, store);
    try {
      await service.import();
      return await service.emitStateless();
    } finally {
      service.close();
    }
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
    const service = new Mndmap(absoluteRoot, config, new WorkingStore(database));
    await reportAbandonedStaging(service.store);
    return service;
  }

  async import(): Promise<ImportResult> {
    const documents = await parseWorkspace(this.root, this.config);
    return this.store.importScan(documents, this.config);
  }

  async rescan(): Promise<ImportResult> {
    const documents = await parseWorkspace(this.root, this.config);
    return this.store.rescan(documents, this.config);
  }

  organization() { return this.store.organizationSnapshot(); }
  sourceNodes() { return this.store.listSourceNodes(); }
  diagnostics() { return this.store.diagnostics(); }

  moveOrganization(input: MoveOrganizationInput) { return this.store.moveOrganization(input); }
  createGroup(input: CreateGroupInput) { return this.store.createGroup(input); }
  renameOrganization(input: RenameOrganizationInput) { return this.store.renameOrganization(input); }
  setDiagramSettings(input: DiagramSettingsInput) { return this.store.setDiagramSettings(input); }
  resolveReconciliation(input: ResolveReconciliationInput) { return this.store.resolveReconciliation(input); }

  snapshot() { return this.store.snapshot(this.config); }

  graphJson(workspaceId = "mndmap") {
    return graphFile(this.snapshot(), workspaceId);
  }

  graph(workspaceId = "mndmap") {
    return (JSON.parse(this.graphJson(workspaceId)) as { graph: unknown }).graph;
  }

  vocabCheck() { return checkVocabulary(this.snapshot()); }

  async emitPreview() {
    const documents = new Map(this.store.sourceDocuments().map((doc) => [doc.path, doc.content]));
    return emitPreview(this.snapshot(), documents, this.root);
  }

  async emit() {
    const documents = new Map(this.store.sourceDocuments().map((doc) => [doc.path, doc.content]));
    return emitApply(this.root, this.store, this.snapshot(), documents);
  }

  async emitStateless() {
    const documents = new Map(this.store.sourceDocuments().map((doc) => [doc.path, doc.content]));
    return emitApply(this.root, this.store, this.snapshot(), documents, { ephemeral: true });
  }

  close(): void { this.store.close(); }
}

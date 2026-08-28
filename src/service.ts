import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { block } from "@mnd/kit";
import { loadConfig } from "./config.js";
import { exportApply, exportPreview, reportAbandonedStaging } from "./export/index.js";
import { graphFile, checkVocabulary, projectLayer } from "./graph/builder.js";
import { parseWorkspace } from "./parser.js";
import type {
  CreateGroupInput,
  DiagramSettingsInput,
  ImportResult,
  MoveOrganizationInput,
  MoveSegmentInput,
  RenameOrganizationInput,
  ResolveReconciliationInput,
  SegmentOverrideInput,
} from "./types.js";
import { WorkingStore } from "./working-store.js";

export class Mndmap {
  private constructor(
    readonly root: string,
    readonly config: Awaited<ReturnType<typeof loadConfig>>,
    readonly store: WorkingStore,
  ) {}

  static async build(root: string, options: { configFile?: string } = {}): Promise<import("./types.js").ExportPreview> {
    const absoluteRoot = resolve(root);
    const config = await loadConfig(absoluteRoot, options.configFile);
    const store = new WorkingStore(":memory:");
    const service = new Mndmap(absoluteRoot, config, store);
    try {
      await service.import();
      return await service.exportStateless();
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
  pageSegments(pageId: string) { return this.store.listPageSegments(pageId); }

  moveOrganization(input: MoveOrganizationInput) { return this.store.moveOrganization(input); }
  createGroup(input: CreateGroupInput) { return this.store.createGroup(input); }
  renameOrganization(input: RenameOrganizationInput) { return this.store.renameOrganization(input); }
  setDiagramSettings(input: DiagramSettingsInput) { return this.store.setDiagramSettings(input); }
  moveSegment(input: MoveSegmentInput) { return this.store.moveSegment(input); }
  removeSegment(pageOrganizationId: string, sourceNodeId: string) { return this.store.removeSegment(pageOrganizationId, sourceNodeId); }
  overrideSegment(input: SegmentOverrideInput) { return this.store.overrideSegment(input); }
  resolveReconciliation(input: ResolveReconciliationInput) { return this.store.resolveReconciliation(input); }

  snapshot() { return this.store.snapshot(this.config); }

  graphJson(workspaceId = "mndmap") {
    return graphFile(this.snapshot(), workspaceId);
  }

  graph(workspaceId = "mndmap") {
    return (JSON.parse(this.graphJson(workspaceId)) as { graph: unknown }).graph;
  }

  graphLayer(layerId: string) {
    const { graph, layer, depth } = projectLayer(this.snapshot(), layerId);
    return block.project(graph, layer, { n: depth });
  }

  vocabCheck() { return checkVocabulary(this.snapshot()); }

  async exportPreview() {
    const documents = new Map(this.store.sourceDocuments().map((doc) => [doc.path, doc.content]));
    return exportPreview(this.snapshot(), documents, this.root);
  }

  async export() {
    const documents = new Map(this.store.sourceDocuments().map((doc) => [doc.path, doc.content]));
    return exportApply(this.root, this.store, this.snapshot(), documents);
  }

  async exportStateless() {
    const documents = new Map(this.store.sourceDocuments().map((doc) => [doc.path, doc.content]));
    return exportApply(this.root, this.store, this.snapshot(), documents, { ephemeral: true });
  }

  close(): void { this.store.close(); }
}

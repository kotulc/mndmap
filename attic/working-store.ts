import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  CreateGroupInput,
  DiagramSettingsInput,
  Diagnostic,
  ImportResult,
  MoveOrganizationInput,
  MoveSegmentInput,
  MndmapConfig,
  OrganizationNode,
  OrganizationSnapshot,
  ParsedDocument,
  RenameOrganizationInput,
  ResolveReconciliationInput,
  SegmentOverride,
  SegmentOverrideInput,
  SegmentPlacement,
  SegmentView,
  SourceNode,
  WorkingStoreSnapshot,
} from "./types.js";
import { applySelectorIdentity, describeSourceNode, extractSourceNodes } from "./source-nodes.js";
import { reconcileSourceNodes, resolveReconciliation } from "./reconciliation.js";
import { childSegments, normalizeSegmentPositions, seedPlacementsForPage, segmentsForPage } from "./segments.js";
import { stableId } from "./fingerprints.js";
import { slugifySegment } from "./routes.js";
import { tierRootLabel } from "./vocab/docs.js";

const SCHEMA_VERSION = 1;

interface SourceDocument {
  path: string;
  revision: string;
  content: string;
}

interface AbandonedStaging {
  path: string;
  reportedAt: string;
  reported: boolean;
}

interface SourceIdentity {
  id: string;
  kind: SourceNode["kind"];
  explicitKey?: string;
  sourcePath: string;
  sourceLocator: string;
  contentFingerprint: string;
  shapeFingerprint: string;
}

interface WorkspaceFile {
  version: number;
  sourceIdentity: SourceIdentity[];
  organizationNodes: OrganizationNode[];
  segmentPlacements: SegmentPlacement[];
  segmentOverrides: SegmentOverride[];
  abandonedStaging: AbandonedStaging[];
}

interface StoreState {
  documents: SourceDocument[];
  sourceNodes: SourceNode[];
  organizationNodes: OrganizationNode[];
  segmentPlacements: SegmentPlacement[];
  segmentOverrides: SegmentOverride[];
  diagnostics: Diagnostic[];
  abandonedStaging: AbandonedStaging[];
}

export class WorkingStore {
  private readonly persistPath?: string;
  private documents: SourceDocument[] = [];
  private sourceNodes: SourceNode[] = [];
  private organizationNodes: OrganizationNode[] = [];
  private segmentPlacements: SegmentPlacement[] = [];
  private segmentOverrides: SegmentOverride[] = [];
  private diagnosticsList: Diagnostic[] = [];
  private abandonedStaging: AbandonedStaging[] = [];

  constructor(persistPath?: string) {
    if (persistPath) this.persistPath = persistPath;
    if (this.persistPath) this.load();
  }

  close(): void {
    this.persist();
  }

  importScan(documents: ParsedDocument[], config: MndmapConfig): ImportResult {
    return this.transaction(() => {
      const scanId = randomUUID();
      let scanned = extractSourceNodes(documents, scanId);
      applySelectorIdentity(scanned, config);
      const prior = this.listSourceNodes();
      const reconciled = prior.length ? reconcileSourceNodes(scanned, prior) : { nodes: scanned, unresolved: [], missing: [] };
      const nodes = reconciled.nodes;

      this.documents = documents.map((document) => ({
        path: document.path,
        revision: document.revision,
        content: document.content,
      }));
      this.diagnosticsList = [];
      this.sourceNodes = [...nodes];

      for (const document of documents) {
        for (const diagnostic of document.diagnostics) this.insertDiagnostic(diagnostic);
      }
      for (const entry of reconciled.unresolved) {
        const priorNode = prior.find((node) => node.id === entry.priorId);
        this.insertDiagnostic({
          code: "ambiguous-identity",
          severity: "error",
          message: priorNode
            ? `Could not uniquely match ${describeSourceNode(priorNode)} after rescan`
            : "Could not uniquely match a saved item after rescan",
          sourceNodeId: entry.priorId,
          ...(priorNode ? { document: priorNode.sourcePath } : {}),
        });
      }
      for (const missingId of reconciled.missing) {
        const priorNode = prior.find((node) => node.id === missingId);
        this.insertDiagnostic({
          code: "missing-source-node",
          severity: "error",
          message: priorNode
            ? `${describeSourceNode(priorNode)} — no longer found in source after rescan`
            : "An item from your saved layout is no longer in source after rescan",
          sourceNodeId: missingId,
          ...(priorNode ? { document: priorNode.sourcePath } : {}),
        });
      }

      if (!this.hasOrganization()) {
        this.seedOrganization(nodes, config);
        this.seedSegmentPlacements(nodes);
      } else {
        this.reconcileNewSegmentPlacements(nodes);
      }
      return {
        sourceNodes: nodes.length,
        organizationNodes: this.organizationNodes.length,
        diagnostics: this.diagnostics(),
      };
    });
  }

  rescan(documents: ParsedDocument[], config: MndmapConfig): ImportResult {
    return this.importScan(documents, config);
  }

  listSourceNodes(): SourceNode[] {
    return [...this.sourceNodes].sort((left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) || left.sourceLocator.localeCompare(right.sourceLocator));
  }

  listOrganizationNodes(): OrganizationNode[] {
    return [...this.organizationNodes].sort((left, right) =>
      compareNullable(left.parentId, right.parentId) || left.position - right.position);
  }

  listSegmentPlacements(): SegmentPlacement[] {
    return [...this.segmentPlacements].sort((left, right) =>
      left.pageOrganizationId.localeCompare(right.pageOrganizationId) || left.position - right.position);
  }

  listSegmentOverrides(): SegmentOverride[] {
    return [...this.segmentOverrides].sort((left, right) =>
      left.sourceNodeId.localeCompare(right.sourceNodeId) || compareNullable(left.field, right.field));
  }

  listPageSegments(pageOrganizationId: string): SegmentView[] {
    const placements = this.listSegmentPlacements();
    const overrides = this.listSegmentOverrides();
    const sourceById = new Map(this.listSourceNodes().map((node) => [node.id, node]));
    const rows = segmentsForPage(pageOrganizationId, placements, overrides);

    const build = (parentSegmentId: string | null): SegmentView[] =>
      childSegments(rows, parentSegmentId).map((row) => {
        const source = sourceById.get(row.sourceNodeId);
        const placement = placements.find((entry) =>
          entry.pageOrganizationId === pageOrganizationId && entry.sourceNodeId === row.sourceNodeId)!;
        return {
          id: placement.id,
          sourceNodeId: row.sourceNodeId,
          pageOrganizationId: row.pageOrganizationId,
          parentSegmentId: row.parentSegmentId,
          position: row.position,
          kind: source?.kind ?? "section",
          title: String(source?.sourceData.title ?? source?.sourcePath ?? row.sourceNodeId),
          body: row.overrides.find((entry) => entry.field === null)?.content
            ?? String(source?.sourceData.body ?? ""),
          resolution: source?.resolution ?? "resolved",
          overridden: row.overrides.length > 0,
          children: build(placement.id),
        };
      });

    return build(null);
  }

  organizationSnapshot(): OrganizationSnapshot {
    const nodes = this.listOrganizationNodes();
    const root = nodes.find((node) => node.parentId === null);
    if (!root) throw new Error("Organization root is missing");
    return { rootId: root.id, nodes };
  }

  snapshot(config: MndmapConfig): WorkingStoreSnapshot {
    return {
      sourceNodes: this.listSourceNodes(),
      organization: this.organizationSnapshot(),
      segmentPlacements: this.listSegmentPlacements(),
      segmentOverrides: this.listSegmentOverrides(),
      diagnostics: this.diagnostics(),
      config,
    };
  }

  moveOrganization(input: MoveOrganizationInput): OrganizationNode[] {
    return this.transaction(() => {
      const node = this.requireOrganizationNode(input.id);
      const parent = this.requireOrganizationNode(input.parentId);
      this.assertValidMove(node, parent);
      const oldParentId = node.parentId;
      const siblings = this.organizationNodes.filter((entry) => entry.parentId === input.parentId && entry.id !== input.id);
      const position = Math.min(input.position ?? siblings.length, siblings.length);
      this.patchOrganization(input.id, { parentId: input.parentId, position });
      this.normalizeSiblingPositions(input.parentId);
      if (oldParentId && oldParentId !== input.parentId) this.normalizeSiblingPositions(oldParentId);
      return this.listOrganizationNodes();
    });
  }

  createGroup(input: CreateGroupInput): OrganizationNode[] {
    return this.transaction(() => {
      this.requireOrganizationNode(input.parentId);
      if (!input.title.trim()) throw new Error("A group requires a title");
      const id = stableId("org", ["group", randomUUID()]);
      const siblings = this.organizationNodes.filter((entry) => entry.parentId === input.parentId);
      const position = Math.min(input.position ?? siblings.length, siblings.length);
      this.organizationNodes.push({
        id,
        sourceNodeId: null,
        kind: "group",
        parentId: input.parentId,
        position,
        title: input.title.trim(),
        outputSlug: null,
        diagramRoot: false,
        diagramDepth: null,
      });
      if (input.nodeIds?.length) {
        const moved = input.nodeIds.map((nodeId) => this.requireOrganizationNode(nodeId));
        const oldParents = new Set(moved.map((node) => node.parentId).filter((value): value is string => Boolean(value)));
        for (const node of moved) this.assertValidMove(node, this.requireOrganizationNode(id));
        for (const [index, nodeId] of input.nodeIds.entries()) {
          this.patchOrganization(nodeId, { parentId: id, position: index });
        }
        this.normalizeSiblingPositions(id);
        for (const oldParentId of oldParents) {
          if (oldParentId !== id) this.normalizeSiblingPositions(oldParentId);
        }
      }
      this.normalizeSiblingPositions(input.parentId);
      return this.listOrganizationNodes();
    });
  }

  renameOrganization(input: RenameOrganizationInput): OrganizationNode[] {
    return this.transaction(() => {
      const node = this.requireOrganizationNode(input.id);
      if (input.title !== undefined) this.patchOrganization(input.id, { title: input.title });
      if (input.outputSlug !== undefined) this.patchOrganization(input.id, { outputSlug: input.outputSlug });
      if (input.outputSlug) this.assertUniqueOutputSlug(input.outputSlug, node.id, node.parentId);
      return this.listOrganizationNodes();
    });
  }

  setDiagramSettings(input: DiagramSettingsInput): OrganizationNode[] {
    return this.transaction(() => {
      this.requireOrganizationNode(input.id);
      if (input.diagramRoot !== undefined) this.patchOrganization(input.id, { diagramRoot: input.diagramRoot });
      if (input.diagramDepth !== undefined) this.patchOrganization(input.id, { diagramDepth: input.diagramDepth });
      return this.listOrganizationNodes();
    });
  }

  moveSegment(input: MoveSegmentInput): SegmentPlacement[] {
    return this.transaction(() => {
      const placement = this.segmentPlacements.find((entry) =>
        entry.pageOrganizationId === input.pageOrganizationId && entry.sourceNodeId === input.sourceNodeId);
      if (!placement) throw new Error(`Segment not found on page ${input.pageOrganizationId}`);
      const parentSegmentId = input.parentSegmentId ?? placement.parentSegmentId;
      placement.parentSegmentId = parentSegmentId;
      placement.position = input.position;
      const siblings = this.segmentPlacements
        .filter((entry) =>
          entry.pageOrganizationId === input.pageOrganizationId
          && entry.parentSegmentId === parentSegmentId
          && entry.id !== placement.id)
        .sort((left, right) => left.position - right.position);
      siblings.splice(Math.min(input.position, siblings.length), 0, { ...placement, parentSegmentId, position: input.position });
      siblings.forEach((entry, index) => {
        const target = this.segmentPlacements.find((row) => row.id === entry.id);
        if (target) target.position = index;
      });
      return this.listSegmentPlacements();
    });
  }

  removeSegment(pageOrganizationId: string, sourceNodeId: string): SegmentPlacement[] {
    return this.transaction(() => {
      const placement = this.segmentPlacements.find((entry) =>
        entry.pageOrganizationId === pageOrganizationId && entry.sourceNodeId === sourceNodeId);
      if (!placement) throw new Error("Segment placement not found");
      const childIds = new Set(this.collectDescendantPlacementIds(placement.id));
      this.segmentPlacements = this.segmentPlacements.filter((entry) =>
        entry.id !== placement.id && !childIds.has(entry.id));
      const parentSegmentId = placement.parentSegmentId;
      const normalized = normalizeSegmentPositions(this.listSegmentPlacements(), pageOrganizationId, parentSegmentId);
      for (const entry of normalized.filter((row) => row.pageOrganizationId === pageOrganizationId)) {
        const target = this.segmentPlacements.find((row) => row.id === entry.id);
        if (target) target.position = entry.position;
      }
      return this.listSegmentPlacements();
    });
  }

  overrideSegment(input: SegmentOverrideInput): SegmentOverride[] {
    return this.transaction(() => {
      const field = input.field ?? null;
      const existing = this.segmentOverrides.find((entry) => entry.sourceNodeId === input.sourceNodeId && entry.field === field);
      const next: SegmentOverride = {
        sourceNodeId: input.sourceNodeId,
        field,
        content: input.content,
        updatedAt: new Date().toISOString(),
      };
      if (existing) {
        existing.content = next.content;
        existing.updatedAt = next.updatedAt;
      } else {
        this.segmentOverrides.push(next);
      }
      return this.listSegmentOverrides();
    });
  }

  clearSegmentOverride(sourceNodeId: string, field: string | null = null): SegmentOverride[] {
    return this.transaction(() => {
      this.segmentOverrides = this.segmentOverrides.filter((entry) =>
        !(entry.sourceNodeId === sourceNodeId && entry.field === field));
      return this.listSegmentOverrides();
    });
  }

  resolveReconciliation(input: ResolveReconciliationInput): SourceNode[] {
    return this.transaction(() => {
      const resolved = resolveReconciliation(this.listSourceNodes(), input.priorNodeId, input.action, input.candidateId);
      this.sourceNodes = [...resolved];
      this.diagnosticsList = this.diagnosticsList.filter((entry) =>
        entry.code !== "ambiguous-identity" && entry.code !== "missing-source-node");
      for (const node of resolved.filter((entry) => entry.resolution === "missing")) {
        this.insertDiagnostic({
          code: "missing-source-node",
          severity: "error",
          message: `${describeSourceNode(node)} — removed from source`,
          sourceNodeId: node.id,
          document: node.sourcePath,
        });
      }
      return resolved;
    });
  }

  sourceDocument(path: string): SourceDocument | null {
    return this.documents.find((document) => document.path === path) ?? null;
  }

  sourceDocuments(): SourceDocument[] {
    return [...this.documents].sort((left, right) => left.path.localeCompare(right.path));
  }

  diagnostics(): Diagnostic[] {
    return [...this.diagnosticsList];
  }

  blockingDiagnostics(): Diagnostic[] {
    return this.diagnostics().filter((diagnostic) => diagnostic.severity === "error");
  }

  hasUnresolvedOrMissing(): boolean {
    return this.listSourceNodes().some((node) => node.resolution !== "resolved")
      || this.blockingDiagnostics().length > 0;
  }

  recordAbandonedStaging(path: string): void {
    this.transaction(() => {
      if (!this.abandonedStaging.some((entry) => entry.path === path)) {
        this.abandonedStaging.push({ path, reportedAt: new Date().toISOString(), reported: false });
      }
    });
  }

  unreportedAbandonedStaging(): string[] {
    return this.abandonedStaging.filter((entry) => !entry.reported).map((entry) => entry.path);
  }

  markAbandonedStagingReported(paths: string[]): void {
    this.transaction(() => {
      for (const path of paths) {
        const entry = this.abandonedStaging.find((row) => row.path === path);
        if (entry) entry.reported = true;
      }
    });
  }

  private seedOrganization(nodes: SourceNode[], config: MndmapConfig): void {
    const rootId = stableId("org", ["root"]);
    this.organizationNodes.push({
      id: rootId,
      sourceNodeId: null,
      kind: "group",
      parentId: null,
      position: 0,
      title: tierRootLabel(config),
      outputSlug: null,
      diagramRoot: false,
      diagramDepth: config.diagrams.depth,
    });

    const folders = nodes.filter((node) => node.kind === "folder");
    const pages = nodes.filter((node) => node.kind === "page");
    const orgBySource = new Map<string, string>();
    orgBySource.set("", rootId);

    for (const folder of folders.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
      const parentPath = folder.sourcePath.includes("/") ? folder.sourcePath.split("/").slice(0, -1).join("/") : "";
      const parentId = orgBySource.get(parentPath) ?? rootId;
      const id = stableId("org", ["folder", folder.id]);
      const position = this.organizationNodes.filter((node) => node.parentId === parentId).length;
      this.organizationNodes.push({
        id,
        sourceNodeId: folder.id,
        kind: "folder",
        parentId: parentId,
        position,
        title: String(folder.sourceData.title),
        outputSlug: null,
        diagramRoot: false,
        diagramDepth: null,
      });
      orgBySource.set(folder.sourcePath, id);
    }

    for (const page of pages.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
      const parentPath = page.sourcePath.includes("/") ? page.sourcePath.split("/").slice(0, -1).join("/") : "";
      const parentId = orgBySource.get(parentPath) ?? rootId;
      const id = stableId("org", ["page", page.id]);
      const position = this.organizationNodes.filter((node) => node.parentId === parentId).length;
      this.organizationNodes.push({
        id,
        sourceNodeId: page.id,
        kind: "page",
        parentId: parentId,
        position,
        title: String(page.sourceData.title),
        outputSlug: String(page.sourceData.slug ?? slugifySegment(String(page.sourceData.title))),
        diagramRoot: false,
        diagramDepth: null,
      });
      orgBySource.set(page.sourcePath, id);
    }
  }

  private seedSegmentPlacements(nodes: SourceNode[]): void {
    for (const page of this.organizationNodes.filter((node) => node.kind === "page")) {
      const source = nodes.find((node) => node.id === page.sourceNodeId);
      if (!source) continue;
      for (const placement of seedPlacementsForPage(page.id, source.sourcePath, nodes)) {
        this.segmentPlacements.push(placement);
      }
    }
  }

  private reconcileNewSegmentPlacements(nodes: SourceNode[]): void {
    const placed = new Set(this.segmentPlacements.map((placement) => placement.sourceNodeId));
    for (const page of this.organizationNodes.filter((node) => node.kind === "page")) {
      const source = nodes.find((node) => node.id === page.sourceNodeId);
      if (!source) continue;
      const fresh = seedPlacementsForPage(page.id, source.sourcePath, nodes)
        .filter((placement) => !placed.has(placement.sourceNodeId));
      for (const placement of fresh) {
        const position = this.segmentPlacements
          .filter((entry) => entry.pageOrganizationId === page.id && entry.parentSegmentId === placement.parentSegmentId)
          .length;
        this.segmentPlacements.push({ ...placement, position });
        placed.add(placement.sourceNodeId);
      }
    }
  }

  private collectDescendantPlacementIds(placementId: string): string[] {
    const children = this.segmentPlacements.filter((entry) => entry.parentSegmentId === placementId);
    return children.flatMap((child) => [child.id, ...this.collectDescendantPlacementIds(child.id)]);
  }

  private hasOrganization(): boolean {
    return this.organizationNodes.length > 0;
  }

  private insertDiagnostic(diagnostic: Diagnostic): void {
    this.diagnosticsList.push(diagnostic);
  }

  private requireOrganizationNode(id: string): OrganizationNode {
    const node = this.organizationNodes.find((entry) => entry.id === id);
    if (!node) throw new Error(`Unknown organization node ${id}`);
    return node;
  }

  private patchOrganization(id: string, patch: Partial<OrganizationNode>): void {
    const node = this.requireOrganizationNode(id);
    Object.assign(node, patch);
  }

  private assertValidMove(node: OrganizationNode, parent: OrganizationNode): void {
    if (node.parentId === null) throw new Error("The organization root cannot be moved");
    if (node.id === parent.id) throw new Error("A node cannot be moved under itself");
    if (node.kind === "page" && parent.kind === "page") throw new Error("A page cannot be nested under another page");
    let cursor: OrganizationNode | undefined = parent;
    while (cursor) {
      if (cursor.id === node.id) throw new Error("A node cannot be moved under its descendant");
      cursor = cursor.parentId ? this.requireOrganizationNode(cursor.parentId) : undefined;
    }
  }

  private assertUniqueOutputSlug(slug: string, exceptId: string, parentId: string | null): void {
    const collision = this.organizationNodes.find((node) =>
      node.parentId === parentId && node.outputSlug === slug && node.id !== exceptId);
    if (collision) throw new Error(`Output slug '${slug}' collides with ${collision.id}`);
  }

  private normalizeSiblingPositions(parentId: string): void {
    const siblings = this.organizationNodes
      .filter((node) => node.parentId === parentId)
      .sort((left, right) => left.position - right.position || left.title.localeCompare(right.title));
    siblings.forEach((node, index) => {
      node.position = index;
    });
  }

  private transaction<T>(work: () => T): T {
    const snapshot = this.capture();
    try {
      const result = work();
      this.persist();
      return result;
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  private capture(): StoreState {
    return structuredClone({
      documents: this.documents,
      sourceNodes: this.sourceNodes,
      organizationNodes: this.organizationNodes,
      segmentPlacements: this.segmentPlacements,
      segmentOverrides: this.segmentOverrides,
      diagnostics: this.diagnosticsList,
      abandonedStaging: this.abandonedStaging,
    });
  }

  private restore(snapshot: StoreState): void {
    this.documents = snapshot.documents;
    this.sourceNodes = snapshot.sourceNodes;
    this.organizationNodes = snapshot.organizationNodes;
    this.segmentPlacements = snapshot.segmentPlacements;
    this.segmentOverrides = snapshot.segmentOverrides;
    this.diagnosticsList = snapshot.diagnostics;
    this.abandonedStaging = snapshot.abandonedStaging;
  }

  private persist(): void {
    if (!this.persistPath) return;
    mkdirSync(dirname(this.persistPath), { recursive: true });
    const payload: WorkspaceFile = {
      version: SCHEMA_VERSION,
      sourceIdentity: this.sourceNodes.map(toIdentity),
      organizationNodes: this.organizationNodes,
      segmentPlacements: this.segmentPlacements,
      segmentOverrides: this.segmentOverrides,
      abandonedStaging: this.abandonedStaging,
    };
    writeFileSync(this.persistPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    const parsed = JSON.parse(readFileSync(this.persistPath, "utf8")) as WorkspaceFile;
    if (parsed.version !== SCHEMA_VERSION) {
      throw new Error("Incompatible .mndmap/workspace.json schema. Remove .mndmap/ and re-import.");
    }
    this.sourceNodes = (parsed.sourceIdentity ?? []).map(fromIdentity);
    this.organizationNodes = parsed.organizationNodes ?? [];
    this.segmentPlacements = parsed.segmentPlacements ?? [];
    this.segmentOverrides = parsed.segmentOverrides ?? [];
    this.abandonedStaging = parsed.abandonedStaging ?? [];
  }
}

function toIdentity(node: SourceNode): SourceIdentity {
  return {
    id: node.id,
    kind: node.kind,
    ...(node.explicitKey ? { explicitKey: node.explicitKey } : {}),
    sourcePath: node.sourcePath,
    sourceLocator: node.sourceLocator,
    contentFingerprint: node.contentFingerprint,
    shapeFingerprint: node.shapeFingerprint,
  };
}

function fromIdentity(entry: SourceIdentity): SourceNode {
  return {
    id: entry.id,
    kind: entry.kind,
    ...(entry.explicitKey ? { explicitKey: entry.explicitKey } : {}),
    sourcePath: entry.sourcePath,
    sourceLocator: entry.sourceLocator,
    contentFingerprint: entry.contentFingerprint,
    shapeFingerprint: entry.shapeFingerprint,
    sourceData: {},
    scanId: "",
    resolution: "resolved",
  };
}

function compareNullable(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left.localeCompare(right);
}

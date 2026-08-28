import { DatabaseSync } from "node:sqlite";
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

const SCHEMA_VERSION = 3;

export class WorkingStore {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL");
    this.migrate();
  }

  close(): void { this.db.close(); }

  importScan(documents: ParsedDocument[], config: MndmapConfig): ImportResult {
    return this.transaction(() => {
      const scanId = randomUUID();
      let scanned = extractSourceNodes(documents, scanId);
      applySelectorIdentity(scanned, config);
      const prior = this.listSourceNodes();
      const reconciled = prior.length ? reconcileSourceNodes(scanned, prior) : { nodes: scanned, unresolved: [], missing: [] };
      const nodes = reconciled.nodes;

      this.db.prepare("DELETE FROM source_documents").run();
      for (const document of documents) {
        this.db.prepare("INSERT INTO source_documents(path, revision, content) VALUES (?, ?, ?)")
          .run(document.path, document.revision, document.content);
      }

      this.db.prepare("DELETE FROM diagnostics").run();

      const existingIds = new Set(this.listSourceNodes().map((node) => node.id));
      const newIds = new Set(nodes.map((node) => node.id));
      for (const node of nodes) {
        if (existingIds.has(node.id)) {
          this.db.prepare(`UPDATE source_nodes SET kind=?, explicit_key=?, source_path=?, source_locator=?,
            content_fingerprint=?, shape_fingerprint=?, source_data=?, scan_id=?, resolution=?, candidates_json=? WHERE id=?`)
            .run(
              node.kind, node.explicitKey ?? null, node.sourcePath, node.sourceLocator,
              node.contentFingerprint, node.shapeFingerprint, JSON.stringify(node.sourceData),
              node.scanId, node.resolution, node.candidates ? JSON.stringify(node.candidates) : null, node.id,
            );
        } else {
          this.insertSourceNode(node);
        }
      }
      for (const staleId of existingIds) {
        if (!newIds.has(staleId)) {
          this.db.prepare("DELETE FROM source_nodes WHERE id=?").run(staleId);
        }
      }
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
        organizationNodes: this.listOrganizationNodes().length,
        diagnostics: this.diagnostics(),
      };
    });
  }

  rescan(documents: ParsedDocument[], config: MndmapConfig): ImportResult {
    return this.importScan(documents, config);
  }

  listSourceNodes(): SourceNode[] {
    return (this.db.prepare("SELECT * FROM source_nodes ORDER BY source_path, source_locator").all() as any[])
      .map(readSourceNode);
  }

  listOrganizationNodes(): OrganizationNode[] {
    return (this.db.prepare("SELECT * FROM organization_nodes ORDER BY parent_id, position").all() as any[])
      .map(readOrganizationNode);
  }

  listSegmentPlacements(): SegmentPlacement[] {
    return (this.db.prepare("SELECT * FROM segment_placement ORDER BY page_organization_id, position").all() as any[])
      .map(readSegmentPlacement);
  }

  listSegmentOverrides(): SegmentOverride[] {
    return (this.db.prepare("SELECT * FROM segment_override ORDER BY source_node_id, field").all() as any[])
      .map(readSegmentOverride);
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
      const siblings = this.listOrganizationNodes().filter((entry) => entry.parentId === input.parentId && entry.id !== input.id);
      const position = Math.min(input.position ?? siblings.length, siblings.length);
      this.db.prepare("UPDATE organization_nodes SET parent_id=?, position=? WHERE id=?").run(input.parentId, position, input.id);
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
      const siblings = this.listOrganizationNodes().filter((entry) => entry.parentId === input.parentId);
      const position = Math.min(input.position ?? siblings.length, siblings.length);
      this.db.prepare(`INSERT INTO organization_nodes
        (id, source_node_id, kind, parent_id, position, title, output_slug, diagram_root, diagram_depth)
        VALUES (?, NULL, 'group', ?, ?, ?, NULL, 0, NULL)`)
        .run(id, input.parentId, position, input.title.trim());
      if (input.nodeIds?.length) {
        const moved = input.nodeIds.map((nodeId) => this.requireOrganizationNode(nodeId));
        const oldParents = new Set(moved.map((node) => node.parentId).filter((value): value is string => Boolean(value)));
        for (const node of moved) this.assertValidMove(node, this.requireOrganizationNode(id));
        for (const [index, nodeId] of input.nodeIds.entries()) {
          this.db.prepare("UPDATE organization_nodes SET parent_id=?, position=? WHERE id=?").run(id, index, nodeId);
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
      if (input.title !== undefined) {
        this.db.prepare("UPDATE organization_nodes SET title=? WHERE id=?").run(input.title, input.id);
      }
      if (input.outputSlug !== undefined) {
        this.db.prepare("UPDATE organization_nodes SET output_slug=? WHERE id=?").run(input.outputSlug, input.id);
      }
      if (input.outputSlug) this.assertUniqueOutputSlug(input.outputSlug, node.id, node.parentId);
      return this.listOrganizationNodes();
    });
  }

  setDiagramSettings(input: DiagramSettingsInput): OrganizationNode[] {
    return this.transaction(() => {
      this.requireOrganizationNode(input.id);
      if (input.diagramRoot !== undefined) {
        this.db.prepare("UPDATE organization_nodes SET diagram_root=? WHERE id=?").run(input.diagramRoot ? 1 : 0, input.id);
      }
      if (input.diagramDepth !== undefined) {
        this.db.prepare("UPDATE organization_nodes SET diagram_depth=? WHERE id=?").run(input.diagramDepth, input.id);
      }
      return this.listOrganizationNodes();
    });
  }

  moveSegment(input: MoveSegmentInput): SegmentPlacement[] {
    return this.transaction(() => {
      const placement = this.listSegmentPlacements().find((entry) =>
        entry.pageOrganizationId === input.pageOrganizationId && entry.sourceNodeId === input.sourceNodeId);
      if (!placement) throw new Error(`Segment not found on page ${input.pageOrganizationId}`);
      const parentSegmentId = input.parentSegmentId ?? placement.parentSegmentId;
      this.db.prepare(`UPDATE segment_placement SET parent_segment_id=?, position=? WHERE id=?`)
        .run(parentSegmentId, input.position, placement.id);
      const siblings = this.listSegmentPlacements()
        .filter((entry) =>
          entry.pageOrganizationId === input.pageOrganizationId
          && entry.parentSegmentId === parentSegmentId
          && entry.id !== placement.id)
        .sort((left, right) => left.position - right.position);
      siblings.splice(Math.min(input.position, siblings.length), 0, { ...placement, parentSegmentId, position: input.position });
      siblings.forEach((entry, index) => {
        this.db.prepare("UPDATE segment_placement SET position=? WHERE id=?").run(index, entry.id);
      });
      return this.listSegmentPlacements();
    });
  }

  removeSegment(pageOrganizationId: string, sourceNodeId: string): SegmentPlacement[] {
    return this.transaction(() => {
      const placement = this.listSegmentPlacements().find((entry) =>
        entry.pageOrganizationId === pageOrganizationId && entry.sourceNodeId === sourceNodeId);
      if (!placement) throw new Error("Segment placement not found");
      const childIds = this.collectDescendantPlacementIds(placement.id);
      for (const id of [placement.id, ...childIds]) {
        this.db.prepare("DELETE FROM segment_placement WHERE id=?").run(id);
      }
      const parentSegmentId = placement.parentSegmentId;
      const normalized = normalizeSegmentPositions(this.listSegmentPlacements(), pageOrganizationId, parentSegmentId);
      for (const entry of normalized.filter((row) => row.pageOrganizationId === pageOrganizationId)) {
        this.db.prepare("UPDATE segment_placement SET position=? WHERE id=?").run(entry.position, entry.id);
      }
      return this.listSegmentPlacements();
    });
  }

  overrideSegment(input: SegmentOverrideInput): SegmentOverride[] {
    return this.transaction(() => {
      const field = input.field ?? null;
      this.db.prepare(`INSERT INTO segment_override(source_node_id, field, content, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source_node_id, field) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`)
        .run(input.sourceNodeId, field, input.content, new Date().toISOString());
      return this.listSegmentOverrides();
    });
  }

  clearSegmentOverride(sourceNodeId: string, field: string | null = null): SegmentOverride[] {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM segment_override WHERE source_node_id=? AND field IS ?").run(sourceNodeId, field);
      return this.listSegmentOverrides();
    });
  }

  resolveReconciliation(input: ResolveReconciliationInput): SourceNode[] {
    return this.transaction(() => {
      const nodes = this.listSourceNodes();
      const resolved = resolveReconciliation(nodes, input.priorNodeId, input.action, input.candidateId);
      const resolvedIds = new Set(resolved.map((node) => node.id));
      for (const node of resolved) {
        if (this.listSourceNodes().some((entry) => entry.id === node.id)) {
          this.db.prepare(`UPDATE source_nodes SET kind=?, explicit_key=?, source_path=?, source_locator=?,
            content_fingerprint=?, shape_fingerprint=?, source_data=?, scan_id=?, resolution=?, candidates_json=? WHERE id=?`)
            .run(
              node.kind, node.explicitKey ?? null, node.sourcePath, node.sourceLocator,
              node.contentFingerprint, node.shapeFingerprint, JSON.stringify(node.sourceData),
              node.scanId, node.resolution, node.candidates ? JSON.stringify(node.candidates) : null, node.id,
            );
        } else {
          this.insertSourceNode(node);
        }
      }
      for (const node of this.listSourceNodes()) {
        if (!resolvedIds.has(node.id)) this.db.prepare("DELETE FROM source_nodes WHERE id=?").run(node.id);
      }
      this.db.prepare("DELETE FROM diagnostics WHERE code IN ('ambiguous-identity', 'missing-source-node')").run();
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

  sourceDocument(path: string): { path: string; revision: string; content: string } | null {
    const row = this.db.prepare("SELECT * FROM source_documents WHERE path=?").get(path) as any;
    return row ? { path: row.path, revision: row.revision, content: row.content } : null;
  }

  sourceDocuments(): Array<{ path: string; revision: string; content: string }> {
    return (this.db.prepare("SELECT * FROM source_documents ORDER BY path").all() as any[])
      .map((row) => ({ path: row.path, revision: row.revision, content: row.content }));
  }

  diagnostics(): Diagnostic[] {
    return (this.db.prepare("SELECT * FROM diagnostics ORDER BY id").all() as any[]).map((row) => ({
      code: row.code,
      severity: row.severity,
      message: row.message,
      ...(row.document ? { document: row.document } : {}),
      ...(row.range_json ? { range: JSON.parse(row.range_json) } : {}),
      ...(row.organization_node_id ? { organizationNodeId: row.organization_node_id } : {}),
      ...(row.source_node_id ? { sourceNodeId: row.source_node_id } : {}),
    }));
  }

  blockingDiagnostics(): Diagnostic[] {
    return this.diagnostics().filter((diagnostic) => diagnostic.severity === "error");
  }

  hasUnresolvedOrMissing(): boolean {
    return this.listSourceNodes().some((node) => node.resolution !== "resolved")
      || this.blockingDiagnostics().length > 0;
  }

  recordAbandonedStaging(path: string): void {
    this.db.prepare("INSERT OR IGNORE INTO abandoned_staging(path, reported_at) VALUES (?, ?)").run(path, new Date().toISOString());
  }

  unreportedAbandonedStaging(): string[] {
    return (this.db.prepare("SELECT path FROM abandoned_staging WHERE reported=0").all() as any[]).map((row) => row.path);
  }

  markAbandonedStagingReported(paths: string[]): void {
    for (const path of paths) {
      this.db.prepare("UPDATE abandoned_staging SET reported=1 WHERE path=?").run(path);
    }
  }

  private seedOrganization(nodes: SourceNode[], config: MndmapConfig): void {
    const rootId = stableId("org", ["root"]);
    this.db.prepare(`INSERT INTO organization_nodes
      (id, source_node_id, kind, parent_id, position, title, output_slug, diagram_root, diagram_depth)
      VALUES (?, NULL, 'group', NULL, 0, ?, NULL, 0, ?)`)
      .run(rootId, tierRootLabel(config), config.diagrams.depth);

    const folders = nodes.filter((node) => node.kind === "folder");
    const pages = nodes.filter((node) => node.kind === "page");
    const orgBySource = new Map<string, string>();
    orgBySource.set("", rootId);

    for (const folder of folders.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
      const parentPath = folder.sourcePath.includes("/") ? folder.sourcePath.split("/").slice(0, -1).join("/") : "";
      const parentId = orgBySource.get(parentPath) ?? rootId;
      const id = stableId("org", ["folder", folder.id]);
      const position = this.listOrganizationNodes().filter((node) => node.parentId === parentId).length;
      this.db.prepare(`INSERT INTO organization_nodes
        (id, source_node_id, kind, parent_id, position, title, output_slug, diagram_root, diagram_depth)
        VALUES (?, ?, 'folder', ?, ?, ?, NULL, 0, NULL)`)
        .run(id, folder.id, parentId, position, String(folder.sourceData.title));
      orgBySource.set(folder.sourcePath, id);
    }

    for (const page of pages.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
      const parentPath = page.sourcePath.includes("/") ? page.sourcePath.split("/").slice(0, -1).join("/") : "";
      const parentId = orgBySource.get(parentPath) ?? rootId;
      const id = stableId("org", ["page", page.id]);
      const position = this.listOrganizationNodes().filter((node) => node.parentId === parentId).length;
      /** Filed by its filename, named by its document. */
      this.db.prepare(`INSERT INTO organization_nodes
        (id, source_node_id, kind, parent_id, position, title, output_slug, diagram_root, diagram_depth)
        VALUES (?, ?, 'page', ?, ?, ?, ?, 0, NULL)`)
        .run(id, page.id, parentId, position, String(page.sourceData.title),
             String(page.sourceData.slug ?? slugifySegment(String(page.sourceData.title))));
      orgBySource.set(page.sourcePath, id);
    }
  }

  private seedSegmentPlacements(nodes: SourceNode[]): void {
    for (const page of this.listOrganizationNodes().filter((node) => node.kind === "page")) {
      const source = nodes.find((node) => node.id === page.sourceNodeId);
      if (!source) continue;
      for (const placement of seedPlacementsForPage(page.id, source.sourcePath, nodes)) {
        this.insertSegmentPlacement(placement);
      }
    }
  }

  private reconcileNewSegmentPlacements(nodes: SourceNode[]): void {
    const placed = new Set(this.listSegmentPlacements().map((placement) => placement.sourceNodeId));
    for (const page of this.listOrganizationNodes().filter((node) => node.kind === "page")) {
      const source = nodes.find((node) => node.id === page.sourceNodeId);
      if (!source) continue;
      const fresh = seedPlacementsForPage(page.id, source.sourcePath, nodes)
        .filter((placement) => !placed.has(placement.sourceNodeId));
      for (const placement of fresh) {
        const position = this.listSegmentPlacements()
          .filter((entry) => entry.pageOrganizationId === page.id && entry.parentSegmentId === placement.parentSegmentId)
          .length;
        this.insertSegmentPlacement({ ...placement, position });
        placed.add(placement.sourceNodeId);
      }
    }
  }

  private collectDescendantPlacementIds(placementId: string): string[] {
    const children = this.listSegmentPlacements().filter((entry) => entry.parentSegmentId === placementId);
    return children.flatMap((child) => [child.id, ...this.collectDescendantPlacementIds(child.id)]);
  }

  private hasOrganization(): boolean {
    return Number((this.db.prepare("SELECT count(*) n FROM organization_nodes").get() as any).n) > 0;
  }

  private insertSourceNode(node: SourceNode): void {
    this.db.prepare(`INSERT INTO source_nodes
      (id, kind, explicit_key, source_path, source_locator, content_fingerprint, shape_fingerprint, source_data, scan_id, resolution, candidates_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        node.id, node.kind, node.explicitKey ?? null, node.sourcePath, node.sourceLocator,
        node.contentFingerprint, node.shapeFingerprint, JSON.stringify(node.sourceData),
        node.scanId, node.resolution, node.candidates ? JSON.stringify(node.candidates) : null,
      );
  }

  private insertSegmentPlacement(placement: SegmentPlacement): void {
    this.db.prepare(`INSERT INTO segment_placement
      (id, source_node_id, page_organization_id, parent_segment_id, position)
      VALUES (?, ?, ?, ?, ?)`)
      .run(placement.id, placement.sourceNodeId, placement.pageOrganizationId, placement.parentSegmentId, placement.position);
  }

  private insertDiagnostic(diagnostic: Diagnostic): void {
    this.db.prepare(`INSERT INTO diagnostics(code, severity, message, document, range_json, organization_node_id, source_node_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        diagnostic.code, diagnostic.severity, diagnostic.message, diagnostic.document ?? null,
        diagnostic.range ? JSON.stringify(diagnostic.range) : null,
        diagnostic.organizationNodeId ?? null, diagnostic.sourceNodeId ?? null,
      );
  }

  private requireOrganizationNode(id: string): OrganizationNode {
    const node = this.listOrganizationNodes().find((entry) => entry.id === id);
    if (!node) throw new Error(`Unknown organization node ${id}`);
    return node;
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
    const collision = this.listOrganizationNodes().find((node) =>
      node.parentId === parentId && node.outputSlug === slug && node.id !== exceptId);
    if (collision) throw new Error(`Output slug '${slug}' collides with ${collision.id}`);
  }

  private normalizeSiblingPositions(parentId: string): void {
    const siblings = this.listOrganizationNodes()
      .filter((node) => node.parentId === parentId)
      .sort((left, right) => left.position - right.position || left.title.localeCompare(right.title));
    siblings.forEach((node, index) => {
      this.db.prepare("UPDATE organization_nodes SET position=? WHERE id=?").run(index, node.id);
    });
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate(): void {
    const version = Number((this.db.prepare("PRAGMA user_version").get() as any).user_version ?? 0);
    if (version > 0 && version < SCHEMA_VERSION) {
      throw new Error("Incompatible .mndmap/state.sqlite schema. Remove .mndmap/ and re-import.");
    }
    if (version >= SCHEMA_VERSION) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_documents(path TEXT PRIMARY KEY, revision TEXT NOT NULL, content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_nodes(
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        explicit_key TEXT,
        source_path TEXT NOT NULL,
        source_locator TEXT NOT NULL,
        content_fingerprint TEXT NOT NULL,
        shape_fingerprint TEXT NOT NULL,
        source_data TEXT NOT NULL,
        scan_id TEXT NOT NULL,
        resolution TEXT NOT NULL,
        candidates_json TEXT
      );
      CREATE TABLE IF NOT EXISTS organization_nodes(
        id TEXT PRIMARY KEY,
        source_node_id TEXT,
        kind TEXT NOT NULL,
        parent_id TEXT,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        output_slug TEXT,
        diagram_root INTEGER NOT NULL DEFAULT 0,
        diagram_depth INTEGER,
        FOREIGN KEY(source_node_id) REFERENCES source_nodes(id)
      );
      CREATE TABLE IF NOT EXISTS segment_placement(
        id TEXT PRIMARY KEY,
        source_node_id TEXT NOT NULL,
        page_organization_id TEXT NOT NULL,
        parent_segment_id TEXT,
        position INTEGER NOT NULL,
        FOREIGN KEY(source_node_id) REFERENCES source_nodes(id),
        FOREIGN KEY(page_organization_id) REFERENCES organization_nodes(id)
      );
      CREATE TABLE IF NOT EXISTS segment_override(
        source_node_id TEXT NOT NULL,
        field TEXT,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(source_node_id, field)
      );
      CREATE TABLE IF NOT EXISTS diagnostics(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        document TEXT,
        range_json TEXT,
        organization_node_id TEXT,
        source_node_id TEXT
      );
      CREATE TABLE IF NOT EXISTS abandoned_staging(
        path TEXT PRIMARY KEY,
        reported_at TEXT NOT NULL,
        reported INTEGER NOT NULL DEFAULT 0
      );
    `);
    this.db.exec(`PRAGMA user_version=${SCHEMA_VERSION}`);
  }
}

function readSourceNode(row: any): SourceNode {
  return {
    id: row.id,
    kind: row.kind,
    ...(row.explicit_key ? { explicitKey: row.explicit_key } : {}),
    sourcePath: row.source_path,
    sourceLocator: row.source_locator,
    contentFingerprint: row.content_fingerprint,
    shapeFingerprint: row.shape_fingerprint,
    sourceData: JSON.parse(row.source_data),
    scanId: row.scan_id,
    resolution: row.resolution,
    ...(row.candidates_json ? { candidates: JSON.parse(row.candidates_json) } : {}),
  };
}

function readOrganizationNode(row: any): OrganizationNode {
  return {
    id: row.id,
    sourceNodeId: row.source_node_id,
    kind: row.kind,
    parentId: row.parent_id,
    position: row.position,
    title: row.title,
    outputSlug: row.output_slug,
    diagramRoot: Boolean(row.diagram_root),
    diagramDepth: row.diagram_depth,
  };
}

function readSegmentPlacement(row: any): SegmentPlacement {
  return {
    id: row.id,
    sourceNodeId: row.source_node_id,
    pageOrganizationId: row.page_organization_id,
    parentSegmentId: row.parent_segment_id,
    position: row.position,
  };
}

function readSegmentOverride(row: any): SegmentOverride {
  return {
    sourceNodeId: row.source_node_id,
    field: row.field,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

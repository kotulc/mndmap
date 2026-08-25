import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  CreateGroupInput,
  DiagramSettingsInput,
  Diagnostic,
  ImportResult,
  MoveOrganizationInput,
  MndmapConfig,
  OrganizationNode,
  OrganizationSnapshot,
  ParsedDocument,
  RenameOrganizationInput,
  ResolveReconciliationInput,
  SourceNode,
  WorkingStoreSnapshot,
} from "./types.js";
import { applySelectorIdentity, extractSourceNodes } from "./source-nodes.js";
import { reconcileSourceNodes, resolveReconciliation } from "./reconciliation.js";
import { stableId } from "./fingerprints.js";

const SCHEMA_VERSION = 2;

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
        this.insertDiagnostic({
          code: "ambiguous-identity",
          severity: "error",
          message: `Ambiguous identity match for ${entry.priorId}`,
          sourceNodeId: entry.priorId,
        });
      }
      for (const missingId of reconciled.missing) {
        this.insertDiagnostic({
          code: "missing-source-node",
          severity: "error",
          message: `Source node ${missingId} was not found in the latest scan`,
          sourceNodeId: missingId,
        });
      }

      if (!this.hasOrganization()) this.seedOrganization(nodes, config);
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
      const parent = this.requireOrganizationNode(input.parentId);
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
          message: `Source node ${node.id} is missing from source`,
          sourceNodeId: node.id,
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
      VALUES (?, NULL, 'group', NULL, 0, 'docs', NULL, 1, ?)`)
      .run(rootId, config.diagrams.depth);

    const folders = nodes.filter((node) => node.kind === "folder");
    const pages = nodes.filter((node) => node.kind === "page");
    const sections = nodes.filter((node) => node.kind === "section");
    const orgBySource = new Map<string, string>();
    orgBySource.set("", rootId);

    for (const folder of folders.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
      const parentPath = folder.sourcePath.includes("/") ? folder.sourcePath.split("/").slice(0, -1).join("/") : "";
      const parentId = orgBySource.get(parentPath) ?? rootId;
      const id = stableId("org", ["source", folder.id]);
      const position = this.listOrganizationNodes().filter((node) => node.parentId === parentId).length;
      this.db.prepare(`INSERT INTO organization_nodes
        (id, source_node_id, kind, parent_id, position, title, output_slug, diagram_root, diagram_depth)
        VALUES (?, ?, 'source', ?, ?, ?, NULL, 0, NULL)`)
        .run(id, folder.id, parentId, position, String(folder.sourceData.title));
      orgBySource.set(folder.sourcePath, id);
    }

    for (const page of pages.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
      const parentPath = page.sourcePath.includes("/") ? page.sourcePath.split("/").slice(0, -1).join("/") : "";
      const parentId = orgBySource.get(parentPath) ?? rootId;
      const id = stableId("org", ["source", page.id]);
      const position = this.listOrganizationNodes().filter((node) => node.parentId === parentId).length;
      this.db.prepare(`INSERT INTO organization_nodes
        (id, source_node_id, kind, parent_id, position, title, output_slug, diagram_root, diagram_depth)
        VALUES (?, ?, 'source', ?, ?, ?, NULL, 0, NULL)`)
        .run(id, page.id, parentId, position, String(page.sourceData.title));
      orgBySource.set(page.sourcePath, id);

      const pageSections = sections
        .filter((section) => section.sourcePath === page.sourcePath)
        .sort((left, right) => Number((left.sourceData.range as any)?.start ?? 0) - Number((right.sourceData.range as any)?.start ?? 0));
      const sectionOrgByPath = new Map<string, string>();
      for (const section of pageSections) {
        const headingPath = Array.isArray(section.sourceData.headingPath)
          ? section.sourceData.headingPath.map(String)
          : [];
        const parentHeadingPath = headingPath.slice(0, -1).join("/");
        const sectionParentId = sectionOrgByPath.get(parentHeadingPath) ?? id;
        const sectionOrgId = stableId("org", ["source", section.id]);
        const sectionPosition = this.listOrganizationNodes().filter((node) => node.parentId === sectionParentId).length;
        this.db.prepare(`INSERT INTO organization_nodes
          (id, source_node_id, kind, parent_id, position, title, output_slug, diagram_root, diagram_depth)
          VALUES (?, ?, 'source', ?, ?, ?, NULL, 0, NULL)`)
          .run(sectionOrgId, section.id, sectionParentId, sectionPosition, String(section.sourceData.title));
        sectionOrgByPath.set(headingPath.join("/"), sectionOrgId);
      }
    }
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
    if (version === 1) {
      throw new Error("Incompatible .mndmap/state.sqlite from the ledger MVP. Remove .mndmap/ and re-import.");
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

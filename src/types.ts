export type FieldValue = string | boolean | number | null | FieldValue[];

export interface SourceRange {
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  document?: string;
  range?: SourceRange;
  organizationNodeId?: string;
  sourceNodeId?: string;
}

export type SourceNodeKind =
  | "folder"
  | "page"
  | "section"
  | "table"
  | "row"
  | "list"
  | "item"
  | "term"
  | "link";

export type ResolutionState = "resolved" | "unresolved" | "missing";

export interface SourceNode {
  id: string;
  kind: SourceNodeKind;
  explicitKey?: string;
  sourcePath: string;
  sourceLocator: string;
  contentFingerprint: string;
  shapeFingerprint: string;
  sourceData: Record<string, unknown>;
  scanId: string;
  resolution: ResolutionState;
  candidates?: string[];
}

export type OrganizationKind = "folder" | "group" | "page";

export interface OrganizationNode {
  id: string;
  sourceNodeId: string | null;
  kind: OrganizationKind;
  parentId: string | null;
  position: number;
  title: string;
  outputSlug: string | null;
  diagramRoot: boolean;
  diagramDepth: number | null;
}

export interface SegmentPlacement {
  id: string;
  sourceNodeId: string;
  pageOrganizationId: string;
  parentSegmentId: string | null;
  position: number;
}

export interface SegmentOverride {
  sourceNodeId: string;
  field: string | null;
  content: string;
  updatedAt: string;
}

export interface SegmentView {
  id: string;
  sourceNodeId: string;
  pageOrganizationId: string;
  parentSegmentId: string | null;
  position: number;
  kind: SourceNodeKind;
  title: string;
  /** What the block shows when it is expanded: the override where there is
   *  one, and the source section otherwise. */
  body: string;
  resolution: ResolutionState;
  overridden: boolean;
  children: SegmentView[];
}

export interface OrganizationSnapshot {
  rootId: string;
  nodes: OrganizationNode[];
}

export interface StructuralNode {
  kind: "heading" | "section" | "table" | "list" | "list-item" | "link" | "frontmatter" | "mdx-opaque";
  range: SourceRange;
  depth?: number;
  headingPath?: string[];
  text?: string;
  destination?: string;
}

export interface ParsedDocument {
  path: string;
  content: string;
  revision: string;
  structure: StructuralNode[];
  diagnostics: Diagnostic[];
  frontmatter?: unknown;
}

export interface SelectorConfig {
  document: string;
  match: {
    kind: "table" | "list" | "section" | "frontmatter";
    under?: string[];
    headers?: string[];
    occurrence?: number;
  };
  identity?: { field: string };
  fields?: Record<string, { column?: string; label?: string; frontmatter?: string; section?: "body"; text?: boolean }>;
}

export interface MndmapConfig {
  version: 1;
  source: { root: string; include: string[]; exclude: string[] };
  destination: string;
  diagrams: { enabled: boolean; depth: number };
  mdsite?: { config?: string };
  selectors: SelectorConfig[];
}

export interface ImportResult {
  sourceNodes: number;
  organizationNodes: number;
  diagnostics: Diagnostic[];
}

export interface ReconciliationCandidate {
  sourceNodeId: string;
  priorNodeId: string;
  reason: string;
}

export interface GraphResult {
  graph: import("@mnd/kit").Graph;
  tierRootId: string;
}

export interface ExportPreview {
  files: Array<{ path: string; bytes: number }>;
  assets: string[];
  diagnostics: Diagnostic[];
}

/** @deprecated Use ExportPreview */
export type EmitPreview = ExportPreview;

export interface GroupingSuggestion {
  id: string;
  title: string;
  nodeIds: string[];
  reason: string;
}

export interface GroupingSuggester {
  suggest(snapshot: OrganizationSnapshot, signal: AbortSignal): Promise<GroupingSuggestion[]>;
}

export interface MoveOrganizationInput {
  id: string;
  parentId: string;
  position?: number;
}

export interface CreateGroupInput {
  parentId: string;
  title: string;
  position?: number;
  nodeIds?: string[];
}

export interface RenameOrganizationInput {
  id: string;
  title?: string;
  outputSlug?: string | null;
}

export interface DiagramSettingsInput {
  id: string;
  diagramRoot?: boolean;
  diagramDepth?: number | null;
}

export interface ResolveReconciliationInput {
  priorNodeId: string;
  action: "confirm" | "new" | "remove";
  candidateId?: string;
}

export interface MoveSegmentInput {
  sourceNodeId: string;
  pageOrganizationId: string;
  parentSegmentId?: string | null;
  position: number;
}

export interface SegmentOverrideInput {
  sourceNodeId: string;
  field?: string | null;
  content: string;
}

export interface WorkingStoreSnapshot {
  sourceNodes: SourceNode[];
  organization: OrganizationSnapshot;
  segmentPlacements: SegmentPlacement[];
  segmentOverrides: SegmentOverride[];
  diagnostics: Diagnostic[];
  config: MndmapConfig;
}

export type FieldValue = string | boolean | number | null | FieldValue[];

export interface SourceRange {
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface SourceLocation {
  document: string;
  region: SourceRange;
  record: SourceRange;
  fields: Record<string, SourceRange>;
  adapter: "table" | "task-list" | "labeled-list" | "plain-list" | "section" | "frontmatter";
}

export interface FieldDefinition {
  id: string;
  sourceName: string;
  sourceBacked: boolean;
  writable: boolean;
  kind: "markdown" | "boolean";
}

export interface Capabilities {
  create: boolean;
  delete: boolean;
  writableFields: string[];
}

export interface ParsedRecord {
  id: string;
  values: Record<string, FieldValue>;
  order: number;
  identityConfidence: "configured" | "explicit" | "unique" | "locator";
  locations: SourceLocation[];
}

export interface ParsedCollection {
  id: string;
  name: string;
  fields: FieldDefinition[];
  records: ParsedRecord[];
  capabilities: Capabilities;
  sourceRegions: Array<{
    document: string;
    range: SourceRange;
    generated?: { template: string; framed?: boolean };
  }>;
}

export interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  document?: string;
  range?: SourceRange;
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
  collections: ParsedCollection[];
  structure: StructuralNode[];
  diagnostics: Diagnostic[];
  frontmatter?: unknown;
}

export interface ScratchFieldConfig {
  id: string;
  alias: string;
}

export interface CollectionSourceConfig {
  document: string;
  select: {
    kind: "table" | "list" | "section" | "frontmatter";
    under?: string[];
    headers?: string[];
    occurrence?: number;
  };
  recordId?: string;
  key?: { field: string };
  fields?: Record<string, { column?: string; label?: string; frontmatter?: string; section?: "body"; text?: boolean }>;
}

export interface CollectionConfig {
  sources: CollectionSourceConfig[];
  order?: string[];
  writableFields?: string[];
  createTemplate?: string;
  generated?: Array<{
    document: string;
    template: string;
    between?: [string, string];
  }>;
}

export interface MndmapConfig {
  version: 1;
  sources: { include: string[]; exclude: string[] };
  collections: Record<string, CollectionConfig>;
  claims: { defaultLeaseSeconds: number };
  scratchFields: ScratchFieldConfig[];
}

export interface Claim {
  collectionId: string;
  recordId: string;
  ownerId: string;
  token: number;
  expiresAt: string;
}

export type Mutation =
  | { type: "update"; collectionId: string; recordId: string; token: number; values: Record<string, FieldValue> }
  | { type: "scratch"; collectionId: string; recordId: string; token: number; field: string; value: string }
  | { type: "delete"; collectionId: string; recordId: string; token: number }
  | { type: "create"; collectionId: string; recordId: string; values: Record<string, FieldValue> };

export interface RecordView {
  collectionId: string;
  id: string;
  values: Record<string, FieldValue>;
  scratch: Record<string, string>;
  order: number;
  identityConfidence: ParsedRecord["identityConfidence"];
  staged: boolean;
  claim: Claim | null;
}

export interface ExportPatch {
  document: string;
  beforeRevision: string;
  before: string;
  after: string;
}

export interface ChangeView {
  id: number;
  actor: string;
  operations: Mutation[];
  before: unknown[];
  after: unknown[];
  createdAt: string;
  reversedBy: number | null;
}

export interface ImportResult {
  collections: number;
  records: number;
  diagnostics: Diagnostic[];
}

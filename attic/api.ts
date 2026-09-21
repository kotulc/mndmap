import type { Diagnostic, OrganizationSnapshot, SegmentView, SourceNode } from "../types.js";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface EditorApi {
  import(): Promise<unknown>;
  rescan(): Promise<unknown>;
  organization(): Promise<OrganizationSnapshot>;
  graph(): Promise<unknown>;
  diagnostics(): Promise<Diagnostic[]>;
  pageSegments(pageId: string): Promise<SegmentView[]>;
  moveOrganization(input: { id: string; parentId: string; position?: number }): Promise<OrganizationSnapshot["nodes"]>;
  createGroup(input: { parentId: string; title: string; nodeIds?: string[] }): Promise<OrganizationSnapshot["nodes"]>;
  renameOrganization(input: { id: string; title?: string; outputSlug?: string | null }): Promise<OrganizationSnapshot["nodes"]>;
  setDiagramSettings(input: { id: string; diagramRoot?: boolean; diagramDepth?: number | null }): Promise<OrganizationSnapshot["nodes"]>;
  moveSegment(input: { sourceNodeId: string; pageOrganizationId: string; parentSegmentId?: string | null; position: number }): Promise<unknown>;
  removeSegment(input: { pageOrganizationId: string; sourceNodeId: string }): Promise<unknown>;
  resolveReconciliation(input: { priorNodeId: string; action: "confirm" | "new" | "remove"; candidateId?: string }): Promise<SourceNode[]>;
  exportPreview(): Promise<unknown>;
  export(): Promise<unknown>;
}

export function createEditorApi(baseUrl = "/api"): EditorApi {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("content-type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    const value = await response.json() as T | { error?: string };
    if (!response.ok) {
      const message = typeof value === "object" && value && "error" in value ? value.error : undefined;
      throw new ApiError(message || `Request failed (${response.status})`, response.status);
    }
    return value as T;
  };
  const post = <T>(path: string, value: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(value) });

  return {
    import: () => post("/import", {}),
    rescan: () => post("/rescan", {}),
    organization: () => request("/organization"),
    graph: () => request("/graph"),
    diagnostics: () => request("/diagnostics"),
    pageSegments: (pageId) => request(`/pages/${encodeURIComponent(pageId)}/segments`),
    moveOrganization: (input) => post("/organization/move", input),
    createGroup: (input) => post("/organization/group", input),
    renameOrganization: (input) => post("/organization/rename", input),
    setDiagramSettings: (input) => post("/organization/diagram", input),
    moveSegment: (input) => post("/segments/move", input),
    removeSegment: (input) => post("/segments/remove", input),
    resolveReconciliation: (input) => post("/reconciliation/resolve", input),
    exportPreview: () => post("/export/preview", {}),
    export: () => post("/export", {}),
  };
}

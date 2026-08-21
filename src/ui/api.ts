import type {
  Capabilities,
  ChangeView,
  Claim,
  ExportPatch,
  FieldDefinition,
  Mutation,
  RecordView,
  SourceRange,
} from "../types.js";

export interface CollectionView {
  id: string;
  name: string;
  fields: FieldDefinition[];
  capabilities: Capabilities;
  sourceRegions: Array<{ document: string; range: SourceRange }>;
  scratchFields?: Array<{ id: string; alias: string }>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface DashboardApi {
  collections(): Promise<CollectionView[]>;
  records(collectionId: string): Promise<RecordView[]>;
  changes(): Promise<ChangeView[]>;
  claim(ownerId: string, collectionId: string, recordId: string): Promise<Claim>;
  release(ownerId: string, claim: Claim): Promise<void>;
  apply(actor: string, operations: Mutation[]): Promise<number>;
  previewExport(forceClaims?: boolean): Promise<ExportPatch[]>;
  applyExport(forceClaims?: boolean): Promise<ExportPatch[]>;
}

export function createDashboardApi(baseUrl = "/api"): DashboardApi {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("content-type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    const value = await response.json() as T | { error?: string };
    if (!response.ok) {
      const message = typeof value === "object" && value && "error" in value ? value.error : undefined;
      throw new ApiError(message || `Request failed (${response.status})`, response.status);
    }
    return value as T;
  };
  const post = <T>(path: string, value: unknown) => request<T>(path, {
    method: "POST",
    body: JSON.stringify(value),
  });

  return {
    collections: () => request("/collections"),
    records: (collectionId) => request(`/collections/${encodeURIComponent(collectionId)}/records`),
    changes: () => request("/changes"),
    claim: async (ownerId, collectionId, recordId) => {
      const result = await post<{ granted: Claim[]; denied: unknown[] }>("/claims", {
        ownerId,
        refs: [{ collectionId, recordId }],
      });
      const claim = result.granted[0];
      if (!claim) throw new Error("Record is already claimed");
      return claim;
    },
    release: async (ownerId, claim) => {
      await post("/claims/release", { ownerId, claims: [claim] });
    },
    apply: async (actor, operations) => {
      const result = await post<{ historyId: number }>("/apply", { actor, operations });
      return result.historyId;
    },
    previewExport: (forceClaims = false) => post("/export/preview", { forceClaims }),
    applyExport: (forceClaims = false) => post("/export/apply", { forceClaims }),
  };
}

import { createHash } from "node:crypto";

export function contentFingerprint(text: string): string {
  return createHash("sha256").update(normalizeContent(text)).digest("hex").slice(0, 16);
}

export function shapeFingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
}

export function stableId(prefix: string, parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}

function normalizeContent(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function blockIdFromInternal(internalId: string): string {
  return stableId("block", [internalId]);
}

export function edgeIdFromInternal(from: string, to: string, kind = "contains"): string {
  return stableId("edge", [from, to, kind]);
}

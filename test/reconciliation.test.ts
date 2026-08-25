import { describe, expect, it } from "vitest";
import { reconcileSourceNodes } from "../src/reconciliation.js";
import type { SourceNode } from "../src/types.js";

function node(partial: Partial<SourceNode> & Pick<SourceNode, "id" | "kind" | "sourcePath">): SourceNode {
  return {
    sourceLocator: "",
    contentFingerprint: "abc",
    shapeFingerprint: "def",
    sourceData: {},
    scanId: "scan-1",
    resolution: "resolved",
    ...partial,
  };
}

describe("identity reconciliation", () => {
  it("matches explicit keys first", () => {
    const prior = [node({ id: "old", kind: "row", sourcePath: "docs/a.md", explicitKey: "R1" })];
    const scanned = [node({ id: "new", kind: "row", sourcePath: "docs/a.md", explicitKey: "R1" })];
    const result = reconcileSourceNodes(scanned, prior);
    expect(result.nodes.find((entry) => entry.explicitKey === "R1")?.id).toBe("old");
  });

  it("never auto-resolves ambiguous fingerprint matches", () => {
    const prior = [
      node({ id: "a", kind: "section", sourcePath: "docs/a.md", sourceLocator: "A/one", contentFingerprint: "same", shapeFingerprint: "shape" }),
      node({ id: "b", kind: "section", sourcePath: "docs/a.md", sourceLocator: "A/two", contentFingerprint: "same", shapeFingerprint: "shape" }),
    ];
    const scanned = [node({ id: "c", kind: "section", sourcePath: "docs/a.md", sourceLocator: "A/new", contentFingerprint: "same", shapeFingerprint: "shape" })];
    const result = reconcileSourceNodes(scanned, prior);
    expect(result.unresolved.length).toBeGreaterThan(0);
  });
});

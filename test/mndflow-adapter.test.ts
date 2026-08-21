import { describe, expect, it } from "vitest";
import { toMndflowGraph } from "../src/mndflow/adapter.js";
import type { RecordView } from "../src/types.js";

describe("mndflow envelope adapter", () => {
  it("projects records deterministically without inferring domain edges", () => {
    const records: RecordView[] = [
      record("B", 2, { Title: "Second" }, true),
      record("A", 1, { Title: "First" }, false),
    ];
    const graph = toMndflowGraph({
      id: "work",
      name: "Work",
      fields: [{ id: "Title", sourceName: "Title", sourceBacked: true, writable: true, kind: "markdown" }],
    }, records);

    expect(graph).toMatchObject({
      id: "work",
      elements: [
        { id: "A", label: "First", order: 1, data: { staged: false, claimed: false } },
        { id: "B", label: "Second", order: 2, data: { staged: true, claimed: false } },
      ],
      edges: [{ id: "order:A:B", source: "A", target: "B", kind: "order" }],
    });
    expect(records.map((item) => item.id)).toEqual(["B", "A"]);
  });
});

function record(id: string, order: number, values: Record<string, string>, staged: boolean): RecordView {
  return {
    collectionId: "work",
    id,
    values,
    scratch: {},
    order,
    identityConfidence: "unique",
    staged,
    claim: null,
  };
}

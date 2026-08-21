import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/parser.js";
import { LedgerState } from "../src/state.js";
import type { MndmapConfig } from "../src/types.js";

const config: MndmapConfig = {
  version: 1,
  sources: { include: ["**/*.md"], exclude: [] },
  collections: {},
  claims: { defaultLeaseSeconds: 900 },
  scratchFields: [{ id: "open_field", alias: "implementation_plan" }, { id: "review_notes", alias: "review_notes" }],
};

function setup() {
  const state = new LedgerState();
  const document = parseDocument("plan.md", "| ID | Status |\n| -- | -- |\n| A | queued |\n| B | queued |\n");
  state.importDocuments([document], config);
  const collectionId = document.collections[0]!.id;
  return { state, collectionId, document };
}

describe("SQLite state and fencing claims", () => {
  it("grants available subsets with monotonic fencing and expiration", () => {
    const { state, collectionId } = setup();
    const first = state.claim("agent-a", [{ collectionId, recordId: "A" }, { collectionId, recordId: "B" }], 60);
    expect(first.granted).toHaveLength(2);
    const second = state.claim("agent-b", [{ collectionId, recordId: "A" }], 60);
    expect(second.denied).toEqual([{ collectionId, recordId: "A" }]);
    state.release("agent-a", [{ collectionId, recordId: "A", token: first.granted[0]!.token }]);
    const third = state.claim("agent-b", [{ collectionId, recordId: "A" }], 60);
    expect(third.granted[0]!.token).toBeGreaterThan(first.granted[1]!.token);
    state.close();
  });

  it("atomically stages source edits, keeps scratch operational, and enforces closed fields", () => {
    const { state, collectionId } = setup();
    const claim = state.claim("agent", [{ collectionId, recordId: "A" }], 60).granted[0]!;
    const sourceHistory = state.apply("agent", [{ type: "update", collectionId, recordId: "A", token: claim.token, values: { Status: "active" } }]);
    expect(sourceHistory).toBe(1);
    expect(state.pendingHistory()).toHaveLength(1);
    state.apply("agent", [{ type: "scratch", collectionId, recordId: "A", token: claim.token, field: "implementation_plan", value: "Use module X" }]);
    expect(state.pendingHistory()).toHaveLength(1);
    expect(state.getRecord(collectionId, "A")!.scratch).toEqual({ implementation_plan: "Use module X" });
    expect(() => state.apply("agent", [{ type: "update", collectionId, recordId: "A", token: claim.token, values: { NewField: "no" } }])).toThrow("Cannot create source-backed field");
    expect(state.getRecord(collectionId, "A")!.values.Status).toBe("active");
    state.close();
  });

  it("rejects an entire duplicate or stale batch", () => {
    const { state, collectionId } = setup();
    const claim = state.claim("agent", [{ collectionId, recordId: "A" }], 60).granted[0]!;
    expect(() => state.apply("agent", [
      { type: "update", collectionId, recordId: "A", token: claim.token, values: { Status: "active" } },
      { type: "scratch", collectionId, recordId: "A", token: claim.token, field: "open_field", value: "duplicate" },
    ])).toThrow("Duplicate record IDs");
    expect(state.getRecord(collectionId, "A")!.values.Status).toBe("queued");
    state.close();
  });

  it("records and reverses updates and deletions", () => {
    const { state, collectionId } = setup();
    const claims = state.claim("agent", [{ collectionId, recordId: "A" }, { collectionId, recordId: "B" }], 60).granted;
    const update = state.apply("agent", [{ type: "update", collectionId, recordId: "A", token: claims[0]!.token, values: { Status: "active" } }]);
    state.reverse(update, "agent", { [`${collectionId}/A`]: claims[0]!.token });
    expect(state.getRecord(collectionId, "A")!.values.Status).toBe("queued");
    const deletion = state.apply("agent", [{ type: "delete", collectionId, recordId: "B", token: claims[1]!.token }]);
    expect(state.getRecord(collectionId, "B")).toBeNull();
    state.reverse(deletion, "agent", {});
    expect(state.getRecord(collectionId, "B")!.values.Status).toBe("queued");
    state.close();
  });

  it("marks staged state by exact collection and record identity", () => {
    const state = new LedgerState();
    const first = parseDocument("first.md", "| ID | Status |\n| -- | -- |\n| A% | queued |\n");
    const second = parseDocument("second.md", "| ID | Status |\n| -- | -- |\n| A% | queued |\n");
    state.importDocuments([first, second], config);
    const firstId = first.collections[0]!.id;
    const secondId = second.collections[0]!.id;
    const claim = state.claim("agent", [{ collectionId: firstId, recordId: "A%" }], 60).granted[0]!;
    state.apply("agent", [{
      type: "update", collectionId: firstId, recordId: "A%", token: claim.token, values: { Status: "active" },
    }]);

    expect(state.getRecord(firstId, "A%")!.staged).toBe(true);
    expect(state.getRecord(secondId, "A%")!.staged).toBe(false);
    state.close();
  });

  it("reverses deletion for adapters that cannot create new records", () => {
    const state = new LedgerState();
    const document = parseDocument("tasks.md", "- [ ] First\n- [x] Second\n");
    state.importDocuments([document], config);
    const collectionId = document.collections[0]!.id;
    const recordId = document.collections[0]!.records[0]!.id;
    const claim = state.claim("agent", [{ collectionId, recordId }], 60).granted[0]!;
    const deletion = state.apply("agent", [{ type: "delete", collectionId, recordId, token: claim.token }]);

    state.reverse(deletion, "agent", {});

    expect(state.getRecord(collectionId, recordId)!.values).toEqual({ $checked: false, $text: "First" });
    state.close();
  });
});

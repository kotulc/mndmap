import { describe, expect, it } from "vitest";
import { open } from "@mnd/kit";
import { checkVocabulary, graphFile } from "../src/graph/builder.js";
import { WorkingStore } from "../src/working-store.js";
import { parseDocument } from "../src/parser.js";
import type { MndmapConfig } from "../src/types.js";

const config: MndmapConfig = {
  version: 1,
  source: { root: "docs", include: ["**/*.md"], exclude: [] },
  destination: "site",
  diagrams: { enabled: true, depth: 3 },
  selectors: [],
};

describe("graph builder", () => {
  it("builds deterministic graph output", () => {
    const store = new WorkingStore();
    store.importScan([parseDocument("a.md", "# A\n\n## Section\n\nBody.\n", config)], config);
    const snapshot = store.snapshot(config);
    const first = graphFile(snapshot, "fixture");
    const second = graphFile(snapshot, "fixture");
    expect(first).toBe(second);
    expect(open(first).faults).toEqual([]);
  });

  it("passes vocabulary validate and review for representative docs", () => {
    const store = new WorkingStore();
    store.importScan([parseDocument("a.md", "# A\n\n## Section\n\nBody.\n", config)], config);
    const result = checkVocabulary(store.snapshot(config));
    expect(result.faults).toEqual([]);
    expect(result.notes).toEqual([]);
  });
});

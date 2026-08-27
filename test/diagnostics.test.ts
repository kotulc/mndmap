import { describe, expect, it } from "vitest";
import { describeSourceNode } from "../src/source-nodes.js";
import { formatDiagnosticsForDisplay } from "../src/ui/format-diagnostics.js";

describe("describeSourceNode", () => {
  it("labels pages and sections with paths and titles", () => {
    expect(describeSourceNode({
      kind: "page",
      sourcePath: "docs/getting-started.md",
      sourceLocator: "",
      sourceData: { title: "Getting Started" },
    })).toBe('page "Getting Started" (docs/getting-started.md)');

    expect(describeSourceNode({
      kind: "section",
      sourcePath: "docs/getting-started.md",
      sourceLocator: "Prerequisites",
      sourceData: { title: "Prerequisites" },
    })).toBe('section "Prerequisites" in docs/getting-started.md');
  });
});

describe("formatDiagnosticsForDisplay", () => {
  it("summarizes many missing-source-node errors", () => {
    const text = formatDiagnosticsForDisplay([
      {
        code: "missing-source-node",
        severity: "error",
        message: 'section "A" in docs/a.md — no longer found in docs after rescan',
      },
      {
        code: "missing-source-node",
        severity: "error",
        message: 'section "B" in docs/b.md — no longer found in docs after rescan',
      },
    ]);

    expect(text).toContain("2 items from your saved layout are no longer in docs/");
    expect(text).toContain('section "A" in docs/a.md');
    expect(text).toContain('section "B" in docs/b.md');
  });
});

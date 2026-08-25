import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/parser.js";
import type { MndmapConfig } from "../src/types.js";

describe("structural parsing", () => {
  it("extracts sections, links, lists, and MDX diagnostics", () => {
    const source = `---
title: Example
---
# Plan

| ID | Status |
| -- | ------ |
| A  | queued |

- [ ] First task
- [x] Second task

## Plain list

- apples
- oranges

<Widget value={1} />
`;
    const parsed = parseDocument("docs/plan.mdx", source);
    expect(parsed.frontmatter).toEqual({ title: "Example" });
    expect(parsed.structure.some((entry) => entry.kind === "section" && entry.headingPath?.[0] === "Plan")).toBe(true);
    expect(parsed.structure.some((entry) => entry.kind === "table")).toBe(true);
    expect(parsed.structure.some((entry) => entry.kind === "list-item")).toBe(true);
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["opaque-mdx"]));
  });

  it("reports selector cardinality errors", () => {
    const config: MndmapConfig = {
      version: 1,
      sources: { include: ["docs/**/*.md"], exclude: [] },
      destination: "site",
      diagrams: { depth: 3 },
      selectors: [{
        document: "docs/work.md",
        match: { kind: "table", under: ["Missing"], headers: ["ID"] },
      }],
    };
    const parsed = parseDocument("docs/work.md", "# Work\n\n| ID |\n| -- |\n| A |\n", config);
    expect(parsed.diagnostics.some((diagnostic) => diagnostic.code === "selector-cardinality")).toBe(true);
  });
});

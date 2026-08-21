import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/parser.js";
import type { MndmapConfig } from "../src/types.js";

describe("structural parsing", () => {
  it("infers tables and task lists with source maps and conservative lists", () => {
    const source = `---
title: Example
---
# Plan

| ID | Status |
| -- | ------ |
| A  | queued |
| B  | [done](./done.md) |

- [ ] First task
- [x] Second task

## Plain list

- apples
- oranges

<Widget value={1} />
`;
    const parsed = parseDocument("docs/plan.mdx", source);
    expect(parsed.frontmatter).toEqual({ title: "Example" });
    expect(parsed.collections).toHaveLength(2);
    expect(parsed.structure).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "section", headingPath: ["Plan"] }),
      expect.objectContaining({ kind: "link", destination: "./done.md" }),
      expect.objectContaining({ kind: "list-item" }),
    ]));
    const table = parsed.collections[0]!;
    expect(table.records.map((record) => record.id)).toEqual(["A", "B"]);
    expect(table.records[0]!.values).toEqual({ ID: "A", Status: "queued" });
    const statusRange = table.records[0]!.locations[0]!.fields.Status!;
    expect(source.slice(statusRange.start, statusRange.end).trim()).toBe("queued");
    const tasks = parsed.collections[1]!;
    expect(tasks.records[1]!.values).toEqual({ $checked: true, $text: "Second task" });
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "ambiguous-list", "opaque-mdx", "unstable-record-identity",
    ]));
  });

  it("infers repeated labeled children and applies configured mappings", () => {
    const source = `# Work
- Alpha
  - ID: A
  - Status: queued
- Beta
  - ID: B
  - Status: done
`;
    const config: MndmapConfig = {
      version: 1,
      sources: { include: ["**/*.md"], exclude: [] },
      claims: { defaultLeaseSeconds: 10 },
      scratchFields: [{ id: "open_field", alias: "plan" }],
      collections: {
        work: {
          sources: [{
            document: "work.md",
            select: { kind: "list", under: ["Work"] },
            key: { field: "ID" },
            fields: { id: { label: "ID" }, status: { label: "Status" } },
          }],
        },
      },
    };
    const parsed = parseDocument("work.md", source, config);
    expect(parsed.collections).toHaveLength(1);
    expect(parsed.collections[0]!.id).toBe("work");
    expect(parsed.collections[0]!.records[0]).toMatchObject({ id: "A", values: { id: "A", status: "queued" }, identityConfidence: "configured" });
  });
});

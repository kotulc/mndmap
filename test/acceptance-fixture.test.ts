import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseDocument } from "../src/parser.js";
import { Mndmap } from "../src/service.js";

const services: Mndmap[] = [];
const planFixture = new URL("./fixtures/mndflow-plan.md", import.meta.url);
const landedFixture = new URL("./fixtures/mndflow-landed.md", import.meta.url);

afterEach(() => {
  for (const service of services.splice(0)) service.close();
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mndmap-acceptance-"));
  await writeFile(join(root, "plan.md"), await readFile(planFixture, "utf8"));
  await writeFile(join(root, "landed.md"), await readFile(landedFixture, "utf8"));
  await writeFile(join(root, "mndmap.yaml"), `version: 1
sources:
  include:
    - plan.md
    - landed.md
collections:
  work:
    sources:
      - document: plan.md
        select:
          kind: table
          under: [Plan excerpt, Rows]
          headers: [Does, Owns, Waits]
        key:
          field: $column1
        fields:
          id:
            column: $column1
          does:
            column: Does
          owns:
            column: Owns
          waits:
            column: Waits
      - document: landed.md
        select:
          kind: table
          under: [Landed excerpt, Archived]
          headers: [Does, Owns, Waits]
        key:
          field: $column1
        fields:
          id:
            column: $column1
          does:
            column: Does
          owns:
            column: Owns
          waits:
            column: Waits
    writable_fields: [waits]
scratch_fields:
  default:
    alias: implementation_plan
  additional:
    - id: proposed_modules
      alias: proposed_modules
`);
  const service = await Mndmap.open(root);
  services.push(service);
  return { root, service };
}

describe("phase 8 acceptance fixture", () => {
  it("imports representative tables, lists, glyphs, and conservative diagnostics", async () => {
    const source = await readFile(planFixture, "utf8");
    const parsed = parseDocument("plan.md", source);
    expect(parsed.collections).toHaveLength(3);
    const table = parsed.collections.find((collection) => collection.fields.some((field) => field.id === "$column1"))!;
    expect(table.fields[0]).toMatchObject({ id: "$column1", sourceName: "$column1", writable: true });
    expect(JSON.stringify(table.records.map((record) => record.values))).toContain("◐");
    expect(JSON.stringify(table.records.map((record) => record.values))).toContain("◆");
    expect(JSON.stringify(table.records.map((record) => record.values))).toContain("⚠");
    expect(JSON.stringify(table.records.map((record) => record.values))).toContain("✓");
    expect(JSON.stringify(table.records.map((record) => record.values))).toContain("✗");
    const list = parsed.collections.find((collection) => collection.records[0]?.locations[0]?.adapter === "labeled-list")!;
    expect(list.records.map((record) => record.values)).toEqual([
      { ID: "agent-a", Status: "queued" },
      { ID: "agent-b", Status: "landed" },
    ]);
    expect(parsed.collections.find((collection) => collection.fields.some((field) => field.id === "And also (2)"))).toBeDefined();
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "unnamed-table-header",
      "duplicate-table-header",
      "ambiguous-list",
    ]));
  });

  it("claims, scratches, edits, and exports a repeated record at every source location", async () => {
    const { root, service } = await fixture();
    const imported = await service.import();
    expect(imported.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "unnamed-table-header",
      "ambiguous-list",
      "conflicting-representation",
    ]));
    const repeatedId = "**B.5 ◐**";
    const repeated = service.record("work", repeatedId)!;
    expect(repeated.identityConfidence).toBe("configured");
    expect(service.records("work").map((record) => record.id)).toEqual([
      "**B.5 ◐**", "**C.8 ◆**", "**W.1 ⚠**", "**P.1 ✓**", "**ST.1 ✗**", "**N.2**",
    ]);

    const claim = service.claim("acceptance-agent", [{ collectionId: "work", recordId: repeatedId }], 60).granted[0]!;
    service.apply("acceptance-agent", [{
      type: "scratch", collectionId: "work", recordId: repeatedId, token: claim.token,
      field: "implementation_plan", value: "Implement through the shared parser.",
    }]);
    service.apply("acceptance-agent", [{
      type: "scratch", collectionId: "work", recordId: repeatedId, token: claim.token,
      field: "proposed_modules", value: "`src/parser.ts`, `src/exporter.ts`",
    }]);
    service.apply("acceptance-agent", [{
      type: "update", collectionId: "work", recordId: repeatedId, token: claim.token,
      values: { waits: "B.4" },
    }]);
    expect(service.record("work", repeatedId)).toMatchObject({
      scratch: {
        implementation_plan: "Implement through the shared parser.",
        proposed_modules: "`src/parser.ts`, `src/exporter.ts`",
      },
      staged: true,
    });
    await expect(service.exportPreview()).rejects.toThrow("active claims");
    service.release("acceptance-agent", [{ collectionId: "work", recordId: repeatedId, token: claim.token }]);

    const patches = await service.exportApply();
    expect(patches.map((patch) => patch.document).sort()).toEqual(["landed.md", "plan.md"]);
    const plan = await readFile(join(root, "plan.md"), "utf8");
    const landed = await readFile(join(root, "landed.md"), "utf8");
    expect(plan).toContain("| **B.5 ◐** | Derive containment | `src/graph/` | B.4 |");
    expect(landed).toContain("| **B.5 ◐** | Historical containment wording | `src/graph/` | B.4 |");
    expect(plan).toContain("Keep unrelated prose intact.");
    expect(landed).toContain("Archive tail prose stays byte-for-byte unchanged.");
    expect(service.record("work", repeatedId)!.scratch).toMatchObject({
      implementation_plan: "Implement through the shared parser.",
      proposed_modules: "`src/parser.ts`, `src/exporter.ts`",
    });
    expect(service.pendingChanges()).toEqual([]);
  });

  it("refuses repeated-record export after either source revision changes", async () => {
    const { root, service } = await fixture();
    await service.import();
    const repeatedId = "**B.5 ◐**";
    const claim = service.claim("acceptance-agent", [{ collectionId: "work", recordId: repeatedId }], 60).granted[0]!;
    service.apply("acceptance-agent", [{
      type: "update", collectionId: "work", recordId: repeatedId, token: claim.token,
      values: { waits: "B.4" },
    }]);
    service.release("acceptance-agent", [{ collectionId: "work", recordId: repeatedId, token: claim.token }]);
    await writeFile(join(root, "plan.md"), `${await readFile(join(root, "plan.md"), "utf8")}\nExternal edit.\n`);
    await expect(service.exportPreview()).rejects.toThrow("plan.md changed since import");
  });
});

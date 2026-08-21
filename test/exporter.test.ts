import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Mndmap } from "../src/service.js";

const services: Mndmap[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.close();
});

async function fixture(source = "# Plan\n\n| ID | Status | Notes |\n|:---|:-------|:------|\n| A  | queued | **keep** |\n| B  | done   | untouched |\n\nTail prose.\n") {
  const root = await mkdtemp(join(tmpdir(), "mndmap-"));
  await writeFile(join(root, "work.md"), source);
  await writeFile(join(root, "mndmap.yaml"), "version: 1\nsources:\n  include: work.md\n");
  const service = await Mndmap.open(root);
  services.push(service);
  await service.import();
  return { root, service, collectionId: service.collections()[0]!.id };
}

describe("format-preserving export", () => {
  it("previews and writes the smallest source ranges, then establishes a new baseline", async () => {
    const { root, service, collectionId } = await fixture();
    const claim = service.claim("agent", [{ collectionId, recordId: "A" }], 60).granted[0]!;
    service.apply("agent", [{ type: "update", collectionId, recordId: "A", token: claim.token, values: { Status: "active" } }]);
    service.release("agent", [{ collectionId, recordId: "A", token: claim.token }]);
    const preview = await service.exporter.preview();
    expect(preview).toHaveLength(1);
    expect(preview[0]!.after).toContain("| A  | active | **keep** |");
    expect(preview[0]!.after).toContain("| B  | done   | untouched |");
    await service.exporter.apply();
    expect(await readFile(join(root, "work.md"), "utf8")).toBe(preview[0]!.after);
    expect(service.pendingChanges()).toHaveLength(0);
  });

  it("refuses stale files and active claims", async () => {
    const { root, service, collectionId } = await fixture();
    const claim = service.claim("agent", [{ collectionId, recordId: "A" }], 60).granted[0]!;
    service.apply("agent", [{ type: "update", collectionId, recordId: "A", token: claim.token, values: { Status: "active" } }]);
    await expect(service.exporter.preview()).rejects.toThrow("active claims");
    service.release("agent", [{ collectionId, recordId: "A", token: claim.token }]);
    await writeFile(join(root, "work.md"), `${await readFile(join(root, "work.md"), "utf8")}\nExternal edit\n`);
    await expect(service.exporter.preview()).rejects.toThrow("changed since import");
  });

  it("forces export atomically and invalidates active claims", async () => {
    const { root, service, collectionId } = await fixture();
    const claim = service.claim("agent", [{ collectionId, recordId: "A" }], 60).granted[0]!;
    service.apply("agent", [{ type: "update", collectionId, recordId: "A", token: claim.token, values: { Status: "active" } }]);

    const patches = await service.exportApply(true);

    expect(patches).toHaveLength(1);
    expect(await readFile(join(root, "work.md"), "utf8")).toContain("| A  | active |");
    expect(service.pendingChanges()).toEqual([]);
    expect(service.record(collectionId, "A")!.claim).toBeNull();
    expect(() => service.apply("agent", [{
      type: "update", collectionId, recordId: "A", token: claim.token, values: { Status: "stale" },
    }])).toThrow("Missing or stale claim");
  });

  it("deletes table rows without disturbing surrounding content", async () => {
    const { root, service, collectionId } = await fixture();
    const claim = service.claim("agent", [{ collectionId, recordId: "A" }], 60).granted[0]!;
    service.apply("agent", [{ type: "delete", collectionId, recordId: "A", token: claim.token }]);
    service.release("agent", [{ collectionId, recordId: "A", token: claim.token }]);
    await service.exporter.apply();
    const output = await readFile(join(root, "work.md"), "utf8");
    expect(output).not.toContain("| A  |");
    expect(output).toContain("| B  | done   | untouched |");
    expect(output).toContain("Tail prose.");
  });

  it("creates a table row when the source has no trailing newline", async () => {
    const { root, service, collectionId } = await fixture("| ID | Status | Notes |\n| -- | -- | -- |\n| A | queued | old |");
    service.apply("agent", [{ type: "create", collectionId, recordId: "B", values: { ID: "B", Status: "new", Notes: "added" } }]);
    await service.exporter.apply();
    expect(await readFile(join(root, "work.md"), "utf8")).toBe("| ID | Status | Notes |\n| -- | -- | -- |\n| A | queued | old |\n| B | new | added |");
  });

  it("completes net-zero staged history without rewriting files", async () => {
    const { service, collectionId } = await fixture();
    const claim = service.claim("agent", [{ collectionId, recordId: "A" }], 60).granted[0]!;
    const history = service.apply("agent", [{ type: "update", collectionId, recordId: "A", token: claim.token, values: { Status: "active" } }]);
    service.reverse(history, "agent", { [`${collectionId}/A`]: claim.token });
    service.release("agent", [{ collectionId, recordId: "A", token: claim.token }]);
    expect(await service.exporter.apply()).toEqual([]);
    expect(service.pendingChanges()).toEqual([]);
  });
});

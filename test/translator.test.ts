import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Mndmap } from "../src/service.js";

const services: Mndmap[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.close();
});

export async function fixtureWorkspace(content: Record<string, string>, config = "") {
  const root = await mkdtemp(join(tmpdir(), "mndmap-"));
  await mkdir(join(root, "docs"), { recursive: true });
  for (const [path, body] of Object.entries(content)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, body, "utf8");
  }
  if (config) await writeFile(join(root, "mndmap.yaml"), config, "utf8");
  const service = await Mndmap.open(root, { memory: true });
  services.push(service);
  return { root, service };
}

describe("translator workspace", () => {
  it("imports docs into source and organization nodes", async () => {
    const { service } = await fixtureWorkspace({
      "docs/guide.md": "# Guide\n\n## Intro\n\nHello world.\n",
    });
    const result = await service.import();
    expect(result.sourceNodes).toBeGreaterThan(0);
    expect(result.organizationNodes).toBeGreaterThan(1);
    expect(service.sourceNodes().every((node) => node.resolution === "resolved")).toBe(true);
  });

  it("rejects ledger-era configuration keys", async () => {
    const { root } = await fixtureWorkspace({ "docs/a.md": "A\n" });
    await writeFile(join(root, "mndmap.yaml"), "version: 1\ncollections: {}\n", "utf8");
    await expect(Mndmap.open(root, { memory: true })).rejects.toThrow("archive.md");
  });

  it("preserves organization across rescan", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/a.md": "# A\n\n## One\n\nFirst.\n",
    });
    await service.import();
    const rootOrg = service.organization().rootId;
    await writeFile(join(root, "docs/a.md"), "# A\n\n## One\n\nFirst edited.\n", "utf8");
    await service.rescan();
    expect(service.organization().rootId).toBe(rootOrg);
  });

  it("emits a site tree without modifying source", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/readme.md": "# Readme\n\nSee [guide](guide.md).\n",
      "docs/guide.md": "# Guide\n\nTarget.\n",
    });
    const before = await readFile(join(root, "docs/readme.md"), "utf8");
    await service.import();
    await service.emit();
    const after = await readFile(join(root, "docs/readme.md"), "utf8");
    expect(after).toBe(before);
    const emitted = await readFile(join(root, "site/docs/readme.md"), "utf8");
    expect(emitted).toContain("# Readme");
  });
});

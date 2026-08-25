import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  it("physically moves a section between emitted pages", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/a.md": "# A\n\n## Move Me\n\nMoved body.\n\n## Stay\n\nStayed body.\n",
      "docs/b.md": "# B\n\nTarget body.\n",
    });
    await service.import();
    const sources = service.sourceNodes();
    const organization = service.organization();
    const movedSource = sources.find((node) => node.kind === "section" && node.sourceData.title === "Move Me")!;
    const targetSource = sources.find((node) => node.kind === "page" && node.sourcePath === "docs/b.md")!;
    const moved = organization.nodes.find((node) => node.sourceNodeId === movedSource.id)!;
    const target = organization.nodes.find((node) => node.sourceNodeId === targetSource.id)!;
    service.moveOrganization({ id: moved.id, parentId: target.id });

    await service.emit();

    const a = await readFile(join(root, "site/docs/a.md"), "utf8");
    const b = await readFile(join(root, "site/docs/b.md"), "utf8");
    expect(a).not.toContain("Move Me");
    expect(a).toContain("Stay");
    expect(b).toContain("## Move Me");
    expect(b).toContain("Moved body.");
  });

  it("rewrites moved links and local MDX assets", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/a.mdx": "import Widget from './widget.ts'\n\n# A\n\n![diagram](./diagram.svg)\n\nSee [target](b.md#Target).\n",
      "docs/b.md": "# B\n\n## Target\n\nFound.\n",
      "docs/widget.ts": "export default function Widget() { return null }\n",
      "docs/diagram.svg": "<svg></svg>\n",
    });
    await service.import();
    await service.emit();

    const emitted = await readFile(join(root, "site/docs/a.mdx"), "utf8");
    expect(emitted).toContain("from '../_assets/widget.ts'");
    expect(emitted).toContain("![diagram](../_assets/diagram.svg)");
    expect(emitted).toContain("[target](/docs/b#target)");
    expect(await readFile(join(root, "site/_assets/widget.ts"), "utf8")).toContain("Widget");
    expect(await readFile(join(root, "site/_assets/diagram.svg"), "utf8")).toContain("<svg>");
  });

  it("preserves the previous destination when planning fails", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/a.md": "# A\n\n![missing](./missing.png)\n",
    });
    await mkdir(join(root, "site"), { recursive: true });
    await writeFile(join(root, "site/keep.txt"), "previous", "utf8");
    await service.import();

    await expect(service.emit()).rejects.toThrow("missing.png");
    expect(await readFile(join(root, "site/keep.txt"), "utf8")).toBe("previous");
    await expect(access(join(root, "site/docs/a.md"))).rejects.toThrow();
  });
});

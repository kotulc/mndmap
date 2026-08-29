import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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

import type { SegmentView } from "../src/types.js";

function flattenSegments(segments: SegmentView[]): SegmentView[] {
  return segments.flatMap((segment) => [segment, ...flattenSegments(segment.children)]);
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
    expect(service.sourceNodes().some((node) => node.sourcePath === "guide.md")).toBe(true);
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

  it("exports a site tree without modifying source", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/readme.md": "# Readme\n\nSee [guide](guide.md).\n",
      "docs/guide.md": "# Guide\n\nTarget.\n",
    });
    const before = await readFile(join(root, "docs/readme.md"), "utf8");
    await service.import();
    await service.export();
    const after = await readFile(join(root, "docs/readme.md"), "utf8");
    expect(after).toBe(before);
    const emitted = await readFile(join(root, "site/readme.md"), "utf8");
    expect(emitted).toContain("# Readme");
  });

  it("reorders sections within an emitted page", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/a.md": "# A\n\n## First\n\nOne.\n\n## Second\n\nTwo.\n",
    });
    await service.import();
    const organization = service.organization();
    const page = organization.nodes.find((node) => node.kind === "page")!;
    const segments = flattenSegments(service.pageSegments(page.id));
    const second = segments.find((segment) => segment.title === "Second")!;
    const firstParent = segments.find((segment) => segment.title === "A")!;
    service.moveSegment({
      sourceNodeId: second.sourceNodeId,
      pageOrganizationId: page.id,
      parentSegmentId: firstParent.id,
      position: 0,
    });
    await service.export();
    const emitted = await readFile(join(root, "site/a.md"), "utf8");
    expect(emitted.indexOf("## Second")).toBeLessThan(emitted.indexOf("## First"));
  });

  it("removes a section from a page without touching source", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/a.md": "# A\n\n## Drop\n\nGone.\n\n## Keep\n\nStay.\n",
    });
    const before = await readFile(join(root, "docs/a.md"), "utf8");
    await service.import();
    const page = service.organization().nodes.find((node) => node.kind === "page")!;
    const drop = flattenSegments(service.pageSegments(page.id)).find((segment) => segment.title === "Drop")!;
    service.removeSegment(page.id, drop.sourceNodeId);
    await service.export();
    const emitted = await readFile(join(root, "site/a.md"), "utf8");
    expect(emitted).not.toContain("Drop");
    expect(emitted).toContain("Keep");
    expect(await readFile(join(root, "docs/a.md"), "utf8")).toBe(before);
  });

  it("rewrites moved links and local MDX assets", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/a.mdx": "import Widget from './widget.ts'\n\n# A\n\n![diagram](./diagram.svg)\n\nSee [target](b.md#Target).\n",
      "docs/b.md": "# B\n\n## Target\n\nFound.\n",
      "docs/widget.ts": "export default function Widget() { return null }\n",
      "docs/diagram.svg": "<svg></svg>\n",
    });
    await service.import();
    await service.export();

    const emitted = await readFile(join(root, "site/a.mdx"), "utf8");
    expect(emitted).toContain("from './_assets/widget.ts'");
    expect(emitted).toContain("![diagram](./_assets/diagram.svg)");
    expect(emitted).toContain("[target](/b#target)");
    expect(await readFile(join(root, "site/_assets/widget.ts"), "utf8")).toContain("Widget");
    expect(await readFile(join(root, "site/_assets/diagram.svg"), "utf8")).toContain("<svg>");
  });

  it("writes mdsite.yaml with nav_order and fill-only frontmatter on build", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/readme.md": "# Readme\n\nIntro paragraph for description.\n",
    });
    await service.import();
    await service.export();
    const config = await readFile(join(root, "site/mdsite.yaml"), "utf8");
    expect(config).toContain("nav_order:");
    expect(config).toContain("content: .");
    const page = await readFile(join(root, "site/readme.md"), "utf8");
    expect(page).toContain("reading_time:");
    expect(page).toContain("description:");
    expect(page).not.toContain("compose:");
  });

  it("stateless build leaves no .mndmap directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-build-"));
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs/a.md"), "# A\n\nBuild test.\n", "utf8");
    await Mndmap.build(root);
    expect(await readFile(join(root, "site/a.md"), "utf8")).toContain("# A");
    await expect(access(join(root, ".mndmap"))).rejects.toThrow();
  });

  it("produces byte-identical output across two stateless builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-byte-"));
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs/a.md"), "# A\n\nStable.\n", "utf8");
    await Mndmap.build(root);
    const first = await readFile(join(root, "site/a.md"), "utf8");
    await Mndmap.build(root);
    const second = await readFile(join(root, "site/a.md"), "utf8");
    expect(second).toBe(first);
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(hash(second)).toBe(hash(first));
  });

  it("preserves the previous destination when planning fails", async () => {
    const { root, service } = await fixtureWorkspace({
      "docs/a.md": "# A\n\n![missing](./missing.png)\n",
    });
    await mkdir(join(root, "site"), { recursive: true });
    await writeFile(join(root, "site/keep.txt"), "previous", "utf8");
    await service.import();

    await expect(service.export()).rejects.toThrow("missing.png");
    expect(await readFile(join(root, "site/keep.txt"), "utf8")).toBe("previous");
    await expect(access(join(root, "site/a.md"))).rejects.toThrow();
  });

  it("persists organization to workspace.json across reopen", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-persist-"));
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs/a.md"), "# A\n\nKept.\n", "utf8");
    const first = await Mndmap.open(root);
    services.push(first);
    first.createGroup({ parentId: first.organization().rootId, title: "Custom" });
    first.close();

    const saved = JSON.parse(await readFile(join(root, ".mndmap/workspace.json"), "utf8")) as {
      version: number;
      organizationNodes: Array<{ title: string }>;
    };
    expect(saved.version).toBe(1);
    expect(saved.organizationNodes.some((node) => node.title === "Custom")).toBe(true);
    await expect(access(join(root, ".mndmap/state.sqlite"))).rejects.toThrow();

    const second = await Mndmap.open(root);
    services.push(second);
    expect(second.organization().nodes.some((node) => node.title === "Custom")).toBe(true);
    const page = second.organization().nodes.find((node) => node.kind === "page");
    expect(page).toBeDefined();
    expect(second.pageSegments(page!.id).length).toBeGreaterThan(0);
  });
});

import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listenRest } from "../src/rest.js";
import { serializeGraph, verifyPublication, writePublication } from "../src/publish/index.js";
import { renderGraphSvg } from "../src/publish/layout.js";
import type { Graph, GraphCollection } from "../src/mndflow/adapter.js";
import type { RecordView } from "../src/types.js";
import { Mndmap } from "../src/service.js";

const graph: Graph = {
  id: "work",
  elements: [
    { id: "A", kind: "record", label: "Alpha & <one>", order: 0, data: { collectionId: "work", values: { Status: "queued" }, scratch: {}, claimed: false, staged: false } },
    { id: "B", kind: "record", label: "Beta", order: 1, data: { collectionId: "work", values: { Status: "done" }, scratch: {}, claimed: true, staged: true } },
  ],
  edges: [{ id: "order:A:B", source: "A", target: "B", kind: "order" }],
};

describe("phase 10 publication", () => {
  it("serializes JSON and SVG byte-for-byte deterministically", () => {
    expect(serializeGraph(graph)).toBe(serializeGraph(structuredClone(graph)));
    const first = renderGraphSvg(graph);
    expect(first).toBe(renderGraphSvg(structuredClone(graph)));
    expect(first).toContain("Alpha &amp; &lt;one&gt;");
    expect(first).toContain('viewBox="0 0 560 128"');
    expect(first).not.toContain("undefined");
  });

  it("writes a verifiable self-contained bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-publication-"));
    const embed = join(root, "embed");
    const output = join(root, "output");
    await mkdir(embed);
    await writeFile(join(embed, "index.html"), "<div>embed</div>");
    const collection: GraphCollection = {
      id: "work",
      name: "Work",
      fields: [{ id: "Title", sourceName: "Title", sourceBacked: true, writable: true, kind: "markdown" }],
    };
    const records: RecordView[] = graph.elements.map((element) => ({
      collectionId: "work",
      id: element.id,
      values: { Title: element.label },
      scratch: {},
      order: element.order,
      identityConfidence: "unique",
      staged: element.data.staged,
      claim: null,
    }));
    const manifest = await writePublication(output, [collection], () => records, embed);
    expect(await verifyPublication(output)).toEqual(manifest);
    expect(await readFile(join(output, manifest.collections[0]!.path, "index.html"), "utf8")).toContain("embed");
    expect(JSON.parse(await readFile(join(output, manifest.collections[0]!.path, "graph.json"), "utf8"))).toMatchObject({ id: "work" });
  });

  it("serves the dashboard SPA and API from one production server", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-static-"));
    const staticDirectory = join(root, "ui");
    await mkdir(staticDirectory);
    await writeFile(join(staticDirectory, "index.html"), "<main>dashboard</main>");
    await writeFile(join(root, "work.md"), "| ID | Status |\n| -- | -- |\n| A | queued |\n");
    await writeFile(join(root, "mndmap.yaml"), "version: 1\nsources:\n  include: work.md\n");
    const service = await Mndmap.open(root);
    await service.import();
    const { server, url } = await listenRest(service, { port: 0, staticDirectory });
    try {
      expect(await (await fetch(`${url}/dashboard/route`)).text()).toContain("dashboard");
      const collections = await (await fetch(`${url}/api/collections`)).json() as unknown[];
      expect(collections).toHaveLength(1);
      expect((await fetch(`${url}/api/missing`)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.close();
    }
  });
});

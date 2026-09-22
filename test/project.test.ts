/** Organization and document projections. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { open, children, type Graph } from "@mnd/kit";
import { CODE, ITEM, LINK, PAGE, SECTION, SET, TIER_ROOT } from "../src/doc.js";
import { KEY } from "../src/read.js";
import {
  documentOutline, organizationGraph, contentGraph, viewingGraph, pageOf, LATTICE,
} from "../src/ui/project.js";

function tiny(): Graph {
  return {
    root: "ws",
    blocks: {
      ws: { id: "ws", parent: null, name: "workspace", type: "folder", order: 1 },
      [TIER_ROOT]: { id: TIER_ROOT, parent: "ws", type: SET, name: "docs", order: 1 },
      "page:a": { id: "page:a", parent: TIER_ROOT, type: PAGE, name: "A", order: 1 },
      "sec:1": {
        id: "sec:1", parent: "page:a", type: SECTION, name: "Intro", order: 1,
        fields: [{ name: "level", value: "1" }],
      },
      "item:1": { id: "item:1", parent: "sec:1", type: ITEM, body: "Hello", order: 1 },
      "code:1": {
        id: "code:1", parent: "sec:1", type: CODE, body: "x = 1", order: 2,
        fields: [{ name: "lang", value: "js" }],
      },
    },
    edges: {},
    holders: {},
    defs: {},
    packages: {},
  };
}

describe("organizationGraph", () => {
  it("keeps only sets and pages, re-rooted at doc", () => {
    const org = organizationGraph(tiny());
    expect(org.root).toBe(TIER_ROOT);
    expect(Object.keys(org.blocks).sort()).toEqual([TIER_ROOT, "page:a"].sort());
    expect(org.blocks["page:a"]!.parent).toBe(TIER_ROOT);
    expect(org.blocks[TIER_ROOT]!.parent).toBeNull();
    expect(org.edges).toEqual({});
    expect(org.holders).toEqual({});
  });

  it("drops sections and items from a real fixture", () => {
    const graph = open(readFileSync("fixtures/map/workspace.json", "utf8")).graph;
    const org = organizationGraph(graph);
    for (const block of Object.values(org.blocks)) {
      expect([SET, PAGE]).toContain(block.type);
    }
    expect(Object.values(org.blocks).some((b) => b.type === SECTION)).toBe(false);
    expect(Object.values(org.blocks).some((b) => b.type === ITEM)).toBe(false);
  });
});

describe("documentOutline", () => {
  it("returns empty for an empty page", () => {
    const graph = tiny();
    graph.blocks["page:empty"] = {
      id: "page:empty", parent: TIER_ROOT, type: PAGE, name: "Empty", order: 2,
    };
    expect(documentOutline(graph, "page:empty")).toEqual([]);
  });

  it("nests sections and emits prose, code", () => {
    const rows = documentOutline(tiny(), "page:a");
    expect(rows.map((r) => r.kind)).toEqual(["section", "prose", "code"]);
    expect(rows[0]).toMatchObject({ kind: "section", title: "Intro", depth: 0 });
    expect(rows[1]).toMatchObject({ kind: "prose", markdown: "Hello", depth: 1 });
    expect(rows[2]).toMatchObject({ kind: "code", language: "js", text: "x = 1", depth: 1 });
  });

  it("emits a list from done items and a table from keyed rows", () => {
    const graph = tiny();
    graph.blocks["page:b"] = { id: "page:b", parent: TIER_ROOT, type: PAGE, name: "B", order: 2 };
    graph.blocks["item:t1"] = {
      id: "item:t1", parent: "page:b", type: ITEM, body: "one", order: 1,
      fields: [{ name: "done", value: "false" }],
    };
    graph.blocks["item:t2"] = {
      id: "item:t2", parent: "page:b", type: ITEM, body: "two", order: 2,
      fields: [{ name: "done", value: "true" }],
    };
    graph.blocks["row:1"] = {
      id: "row:1", parent: "page:b", type: ITEM, order: 3,
      fields: [{ name: KEY, value: "r1" }, { name: "Name", value: "Alpha" }],
    };
    graph.blocks["row:2"] = {
      id: "row:2", parent: "page:b", type: ITEM, order: 4,
      fields: [{ name: KEY, value: "r2" }, { name: "Name", value: "Beta" }],
    };
    const rows = documentOutline(graph, "page:b");
    expect(rows[0]?.kind).toBe("list");
    expect(rows[1]?.kind).toBe("table");
    if (rows[1]?.kind === "table") {
      expect(rows[1].headers).toEqual(["Name"]);
      expect(rows[1].rows).toEqual([["Alpha"], ["Beta"]]);
    }
  });
});

describe("contentGraph", () => {
  it("puts sections and bodies on the page lattice", () => {
    const graph = open(readFileSync("fixtures/map/workspace.json", "utf8")).graph;
    const pageId = "page:index.md";
    const view = contentGraph(graph, pageId);
    expect(view).not.toBeNull();
    expect(view!.root).toBe(pageId);
    expect(view!.blocks[pageId]?.parent).toBeNull();
    const sections = Object.values(view!.blocks).filter((b) => b.type === SECTION);
    expect(sections.length).toBeGreaterThan(0);
    expect(Object.values(view!.holders).some((h) => h.arrangement === "grid")).toBe(true);
    expect(Object.values(view!.holders).some((h) => h.arrangement === "free")).toBe(false);

    const top = children(view!, pageId);
    expect(top.map((b) => b.name)).toEqual([
      "Lists", "Lists", "Tasks", "Tasks", "Fences", "Fences",
      "Tables", "Tables", "Reference",
    ]);
    const listsSec = top.find((b) => b.type === SECTION && b.name === "Lists")!;
    const listsBody = view!.blocks[`body:${listsSec.id}`]!;
    expect(listsBody.parent).toBe(pageId);
    expect(listsSec.y).toBe(listsBody.y);
    expect(listsBody.x).toBe(LATTICE.STRIDE_X);

    const lists = children(view!, listsBody.id);
    expect(lists.map((b) => b.name)).toEqual([
      "first member with a [link](guide/detail.md)",
      "second member",
      "third member",
    ]);
    expect(lists.every((b) => b.x === 0)).toBe(true);
    expect(lists.map((b) => b.y)).toEqual([0, LATTICE.STRIDE_Y, LATTICE.STRIDE_Y * 2]);
  });
});

describe("viewingGraph", () => {
  it("lattices the tiny page: section and body share a row", () => {
    const graph = tiny();
    /** Level 2 so the sole heading is not hoisted away. */
    graph.blocks["sec:1"]!.fields = [{ name: "level", value: "2" }];
    const view = viewingGraph(graph);
    const pageId = "page:a";
    expect(view.blocks[pageId]?.parent).toBe(TIER_ROOT);
    expect(view.blocks[pageId]?.x).toBeUndefined();
    expect(view.blocks[TIER_ROOT]?.x).toBeUndefined();

    const section = view.blocks["sec:1"]!;
    const body = view.blocks["body:sec:1"]!;
    expect(section.parent).toBe(pageId);
    expect(body.parent).toBe(pageId);
    expect(section.y).toBe(body.y);
    expect(body.x).toBe(section.x! + LATTICE.STRIDE_X);
    expect(children(view, body.id).map((b) => b.id).sort()).toEqual(["code:1", "item:1"]);
    expect(view.edges["contains:sec:1"]).toMatchObject({
      from: "sec:1", to: "body:sec:1", type: LINK, dir: "forward",
    });
  });

  it("packs three list members in one column under their body", () => {
    const graph = open(readFileSync("fixtures/map/workspace.json", "utf8")).graph;
    const view = viewingGraph(graph);
    const bodyId = "body:sec:index.md#map-fixture/lists";
    const lists = children(view, bodyId);
    expect(lists).toHaveLength(3);
    expect(lists.every((b) => b.x === 0)).toBe(true);
    expect(lists.map((b) => b.y)).toEqual([0, LATTICE.STRIDE_Y, LATTICE.STRIDE_Y * 2]);
  });

  it("keeps grid holders with cells that have no x/y", () => {
    const graph = open(readFileSync("fixtures/map/workspace.json", "utf8")).graph;
    const view = viewingGraph(graph);
    const holder = Object.values(view.holders).find((h) => h.arrangement === "grid")!;
    expect(holder.rows).toBeGreaterThan(0);
    expect(holder.cols).toBeGreaterThan(0);
    expect(typeof holder.x).toBe("number");
    expect(typeof holder.y).toBe("number");
    const cells = Object.values(view.blocks).filter((b) => b.group === holder.id);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.x).toBeUndefined();
      expect(cell.y).toBeUndefined();
      expect(cell.cell).toBeDefined();
    }
  });

  it("stands in for an off-layer requirement link target", () => {
    const graph = open(readFileSync("samples/req.json", "utf8")).graph;
    const view = viewingGraph(graph);
    const bodyId = "body:sec:index.md#payload-handling/requirements";
    const req = view.blocks["row:sec:index.md#payload-handling/requirements:1"]!;
    expect(req.parent).toBe(bodyId);
    expect(req.x).toBe(0);

    const stands = children(view, bodyId).filter((b) => b.id.startsWith("stand:"));
    expect(stands.length).toBeGreaterThanOrEqual(2);
    const beside = stands.filter((b) => b.y === req.y);
    expect(beside.length).toBeGreaterThanOrEqual(2);
    expect(beside.every((b) => (b.x ?? 0) > 0)).toBe(true);
    expect(beside.every((b) => b.of === undefined)).toBe(true);

    const edge = Object.values(view.edges).find((e) => e.id === "link:0")!;
    expect([edge.from, edge.to]).toContain(req.id);
    expect([edge.from, edge.to].some((id) => String(id).startsWith("stand:"))).toBe(true);
  });
});

describe("pageOf", () => {
  it("walks to the owning page", () => {
    expect(pageOf(tiny(), "item:1")).toBe("page:a");
    expect(pageOf(tiny(), "page:a")).toBe("page:a");
    expect(pageOf(tiny(), TIER_ROOT)).toBeNull();
  });
});

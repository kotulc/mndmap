// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Vitest runs without globals, so nothing unmounts a render on its own. */
afterEach(cleanup);

vi.mock("@mnd/kit/react", () => ({
  Explorer: ({ graph, onAct }: { graph: Graph; onAct: (n: string, a?: object) => void }) => (
    <div data-testid="explorer">
      {Object.values(graph.blocks).map((block) => (
        <button key={block.id} type="button"
                onClick={() => onAct("reveal", { id: block.id })}>{block.label}</button>
      ))}
    </div>
  ),
  Viewer: ({ picked }: { picked?: readonly string[] }) => (
    <div data-testid="viewer" data-picked={(picked ?? []).join(",")} />
  ),
}));

import { App } from "../src/ui/App.js";
import type { EditorApi } from "../src/ui/api.js";
import type { Graph } from "@mnd/kit";

const graph = {
  root: "ws",
  defs: {},
  blocks: {
    ws: { id: "ws", parent: null, label: "workspace", type: "folder" },
    block_docs: { id: "block_docs", parent: "ws", label: "docs", type: "doc.set", num: 1 },
    org_page: { id: "org_page", parent: "block_docs", label: "Overview", type: "doc.page", num: 1 },
    org_section: { id: "org_section", parent: "org_page", label: "Intro", type: "doc.section", num: 1 },
  },
  edges: {},
} satisfies Graph;

const organization = {
  rootId: "block_docs",
  nodes: [{
    id: "org_page", sourceNodeId: "sn_page", kind: "page" as const, parentId: "block_docs",
    position: 0, title: "Overview", outputSlug: "overview", diagramRoot: false, diagramDepth: null,
  }],
};

function stubApi(over: Partial<EditorApi> = {}): EditorApi {
  return {
    import: vi.fn(async () => ({})),
    rescan: vi.fn(async () => ({})),
    organization: async () => organization,
    graph: async () => graph,
    diagnostics: async () => [],
    pageSegments: async () => [],
    moveOrganization: vi.fn(),
    createGroup: vi.fn(),
    renameOrganization: vi.fn(),
    setDiagramSettings: vi.fn(),
    moveSegment: vi.fn(),
    removeSegment: vi.fn(),
    resolveReconciliation: vi.fn(),
    exportPreview: vi.fn(),
    export: vi.fn(),
    ...over,
  } as EditorApi;
}

describe("editor ui", () => {
  it("loads graph and triggers rescan", async () => {
    const rescan = vi.fn(async () => ({}));
    render(<App api={stubApi({ rescan })} />);
    await waitFor(() => expect(screen.getByTestId("explorer")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Rescan" }));
    await waitFor(() => expect(rescan).toHaveBeenCalled());
  });

  it("lists no section in the tree", async () => {
    render(<App api={stubApi()} />);
    await waitFor(() => expect(screen.getByTestId("explorer")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Intro" })).toBeNull();
    expect(screen.getByRole("button", { name: "Overview" })).toBeTruthy();
  });

  /** The click the kit actually sends is `reveal` with an id, and revealing a
   *  page opens that page — not the one picked before it. */
  it("opens the page a reveal names", async () => {
    const pageSegments = vi.fn(async () => []);
    render(<App api={stubApi({ pageSegments })} />);
    await waitFor(() => expect(screen.getByTestId("explorer")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Overview" }));
    await waitFor(() => expect(pageSegments).toHaveBeenCalledWith("org_page"));
  });
});

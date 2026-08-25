// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mnd/kit/react", () => ({
  Explorer: () => <div data-testid="explorer" />,
  Viewer: () => <div data-testid="viewer" />,
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
  },
  edges: {},
} satisfies Graph;

describe("editor ui", () => {
  it("loads graph and triggers rescan", async () => {
    const rescan = vi.fn(async () => ({}));
    const api: EditorApi = {
      import: vi.fn(async () => ({})),
      rescan,
      organization: async () => ({ rootId: "org_root", nodes: [] }),
      graph: async () => graph,
      diagnostics: async () => [],
      moveOrganization: vi.fn(),
      createGroup: vi.fn(),
      renameOrganization: vi.fn(),
      setDiagramSettings: vi.fn(),
      resolveReconciliation: vi.fn(),
      emitPreview: vi.fn(),
      emit: vi.fn(),
    };

    render(<App api={api} />);
    await waitFor(() => expect(screen.getByTestId("explorer")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Rescan" }));
    await waitFor(() => expect(rescan).toHaveBeenCalled());
  });
});

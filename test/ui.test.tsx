// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/ui/App.js";
import type { DashboardApi } from "../src/ui/api.js";

describe("dashboard", () => {
  it("shows ordered records and saves open_field through shared operations", async () => {
    const apply = vi.fn(async () => 8);
    const api: DashboardApi = {
      collections: async () => [{
        id: "work",
        name: "Work",
        fields: [{ id: "Title", sourceName: "Title", sourceBacked: true, writable: true, kind: "markdown" }],
        capabilities: { create: true, delete: true, writableFields: ["Title"] },
        sourceRegions: [],
        scratchFields: [{ id: "open_field", alias: "implementation_plan" }],
      }],
      records: async () => [{
        collectionId: "work",
        id: "A",
        values: { Title: "First" },
        scratch: { implementation_plan: "Initial note" },
        order: 0,
        identityConfidence: "unique",
        staged: true,
        claim: { collectionId: "work", recordId: "A", ownerId: "dashboard", token: 4, expiresAt: "2099-01-01T00:00:00.000Z" },
      }],
      changes: async () => [{
        id: 7, actor: "agent", operations: [], before: [], after: [],
        createdAt: "2026-08-21T00:00:00.000Z", reversedBy: null,
      }],
      claim: vi.fn(),
      release: vi.fn(),
      apply,
      previewExport: async () => { throw new Error("work.md changed since import"); },
      applyExport: vi.fn(),
    };

    render(<App api={api} />);
    const user = userEvent.setup();
    expect((await screen.findAllByText("First")).length).toBe(2);
    expect(screen.getByText("Pending changes")).toBeTruthy();
    const scratch = screen.getByLabelText("implementation_plan");
    await user.clear(scratch);
    await user.type(scratch, "Implementation notes");
    await user.click(screen.getByRole("button", { name: "Save implementation_plan" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith("dashboard", [{
      type: "scratch",
      collectionId: "work",
      recordId: "A",
      token: 4,
      field: "open_field",
      value: "Implementation notes",
    }]));

    await user.click(screen.getByRole("button", { name: "Preview export" }));
    expect(await screen.findByText(/Export conflict: work\.md changed since import/)).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { pageRoute, sectionAnchor, sourceLink } from "../src/routes.js";

describe("mdsite route and anchor parity", () => {
  it("matches mdsite page URLs", () => {
    expect(pageRoute("readme.md")).toBe("/readme");
    expect(pageRoute("features/overview.md")).toBe("/features/overview");
    expect(pageRoute("index.md")).toBe("/");
  });

  it("matches mdsite section anchors", () => {
    expect(sectionAnchor("How It Works")).toBe("how-it-works");
    expect(sectionAnchor("API (v2)")).toBe("api-v2");
  });

  it("builds navigable source links", () => {
    expect(sourceLink("guide.md", "Getting Started")).toBe("/guide#getting-started");
  });
});

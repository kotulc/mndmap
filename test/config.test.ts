import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { Mndmap } from "../src/service.js";

describe("configuration", () => {
  it("loads non-default source.root and destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-config-"));
    await mkdir(join(root, "content"), { recursive: true });
    await writeFile(join(root, "content/readme.md"), "# Readme\n", "utf8");
    await writeFile(join(root, "mndmap.yaml"), `version: 1
source:
  root: content
  include:
    - "**/*.md"
destination: output
`, "utf8");
    const config = await loadConfig(root);
    expect(config.source.root).toBe("content");
    expect(config.destination).toBe("output");
    await Mndmap.build(root, { configFile: "mndmap.yaml" });
  });

  it("rejects overlapping source.root and destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-config-"));
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "mndmap.yaml"), `version: 1
source:
  root: docs
destination: docs/out
`, "utf8");
    await expect(loadConfig(root)).rejects.toThrow("overlaps");
  });
});

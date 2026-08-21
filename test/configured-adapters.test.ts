import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Mndmap } from "../src/service.js";

const services: Mndmap[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.close();
});

describe("configured source and generated adapters", () => {
  it("writes frontmatter, sections, plain lists, generated regions, and generated files", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-configured-"));
    await writeFile(join(root, "work.md"), `---
title: Original title
tags:
  - one
  - two
---
# Project

## Overview

Original **section** body.

## Ideas

- Alpha
- Beta

<!-- ideas:start -->
stale projection
<!-- ideas:end -->
`);
    await writeFile(join(root, "mndmap.yaml"), `version: 1
sources:
  include: work.md
collections:
  metadata:
    sources:
      - document: work.md
        select:
          kind: frontmatter
        record_id: metadata
        fields:
          title:
            frontmatter: title
          tags:
            frontmatter: tags
    writable_fields: [title, tags]
  overview:
    sources:
      - document: work.md
        select:
          kind: section
          under: [Project, Overview]
        record_id: overview
        fields:
          body:
            section: body
    writable_fields: [body]
  ideas:
    sources:
      - document: work.md
        select:
          kind: list
          under: [Project, Ideas]
        key:
          field: $text
        fields:
          text:
            text: true
    writable_fields: [text]
    create_template: "- {{text}}"
    generated:
      - document: work.md
        between: ["<!-- ideas:start -->", "<!-- ideas:end -->"]
        template: "> {{text}}"
      - document: generated/ideas.md
        template: "* {{text}}"
`);

    const service = await Mndmap.open(root);
    services.push(service);
    expect(await service.import()).toMatchObject({ collections: 3, records: 4 });
    expect(service.collections().find((collection) => collection.id === "ideas")!.capabilities)
      .toEqual({ create: true, delete: true, writableFields: ["text"] });

    const metadata = service.claim("agent", [{ collectionId: "metadata", recordId: "metadata" }], 60).granted[0]!;
    service.apply("agent", [{
      type: "update", collectionId: "metadata", recordId: "metadata", token: metadata.token,
      values: { title: "Updated title", tags: ["one", "three"] },
    }]);
    service.release("agent", [metadata]);

    const overview = service.claim("agent", [{ collectionId: "overview", recordId: "overview" }], 60).granted[0]!;
    service.apply("agent", [{
      type: "update", collectionId: "overview", recordId: "overview", token: overview.token,
      values: { body: "Revised section with `Markdown`." },
    }]);
    service.release("agent", [overview]);

    const alpha = service.claim("agent", [{ collectionId: "ideas", recordId: "Alpha" }], 60).granted[0]!;
    service.apply("agent", [{
      type: "update", collectionId: "ideas", recordId: "Alpha", token: alpha.token,
      values: { text: "Alpha revised" },
    }]);
    service.release("agent", [alpha]);
    service.apply("agent", [{
      type: "create", collectionId: "ideas", recordId: "Gamma", values: { text: "Gamma" },
    }]);

    const patches = await service.exportApply();
    expect(patches.map((patch) => patch.document).sort()).toEqual(["generated/ideas.md", "work.md"]);
    const source = await readFile(join(root, "work.md"), "utf8");
    expect(source).toContain("title: Updated title");
    expect(source).toContain("tags:\n  - one\n  - three");
    expect(source).toContain("Revised section with `Markdown`.");
    expect(source).toContain("- Alpha revised\n- Beta\n- Gamma");
    expect(source).toContain("<!-- ideas:start -->\n> Alpha revised\n> Beta\n> Gamma\n<!-- ideas:end -->");
    expect(await readFile(join(root, "generated", "ideas.md"), "utf8"))
      .toBe("* Alpha revised\n* Beta\n* Gamma\n");
    expect(service.records("ideas").map((record) => record.id)).toEqual(["Alpha revised", "Beta", "Gamma"]);
    expect(service.pendingChanges()).toEqual([]);
  });

  it("keeps plain-list inference conservative without configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "mndmap-plain-"));
    await writeFile(join(root, "work.md"), "# Ideas\n\n- Alpha\n- Beta\n");
    const service = await Mndmap.open(root, { memory: true });
    services.push(service);
    expect(await service.import()).toMatchObject({ collections: 0, records: 0 });
    expect(service.diagnostics().map((diagnostic) => diagnostic.code)).toContain("ambiguous-list");
  });
});

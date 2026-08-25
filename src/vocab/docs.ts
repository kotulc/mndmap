import type { Definition } from "@mnd/kit";

export const DOC_VOCABULARY: Definition[] = [
  {
    id: "doc.set",
    home: "block_docs",
    group: "block",
    name: "doc.set",
    extends: "folder",
    components: { block: { module: "folder" } },
  },
  {
    id: "doc.page",
    home: "block_docs",
    group: "block",
    name: "doc.page",
    extends: "structure",
    fields: [
      { name: "path", form: "text" },
      { name: "title", form: "text" },
      { name: "source", form: "link" },
    ],
    components: {
      block: { module: "structure" },
      constraints: { required: ["path", "title", "source"] },
    },
  },
  {
    id: "doc.section",
    home: "block_docs",
    group: "block",
    name: "doc.section",
    extends: "structure",
    fields: [
      { name: "heading", form: "text" },
      { name: "depth", form: "number" },
      { name: "source", form: "link" },
    ],
    components: {
      block: { module: "structure" },
      constraints: { required: ["heading", "depth", "source"] },
    },
  },
  {
    id: "doc.table",
    home: "block_docs",
    group: "block",
    name: "doc.table",
    extends: "structure",
    fields: [{ name: "headers", form: "text" }, { name: "source", form: "link" }],
    components: {
      block: { module: "structure" },
      view: { module: "table" },
      constraints: { required: ["source"] },
    },
  },
  {
    id: "doc.row",
    home: "block_docs",
    group: "block",
    name: "doc.row",
    extends: "structure",
    fields: [{ name: "source", form: "link" }],
    components: { block: { module: "structure" }, constraints: { required: ["source"] } },
  },
  {
    id: "doc.item",
    home: "block_docs",
    group: "block",
    name: "doc.item",
    extends: "structure",
    fields: [
      { name: "text", form: "text" },
      { name: "checked", form: "flag" },
      { name: "source", form: "link" },
    ],
    components: { block: { module: "structure" }, constraints: { required: ["text", "source"] } },
  },
  {
    id: "doc.term",
    home: "block_docs",
    group: "block",
    name: "doc.term",
    extends: "note",
    fields: [{ name: "body", form: "text" }, { name: "source", form: "link" }],
    components: { block: { module: "note" }, constraints: { required: ["body", "source"] } },
  },
  {
    id: "doc.link",
    home: "block_docs",
    group: "relation",
    name: "doc.link",
    extends: "directed",
    fields: [{ name: "kind", form: "text" }, { name: "text", form: "text" }],
  },
];

export const TIER_ROOT_ID = "block_docs";

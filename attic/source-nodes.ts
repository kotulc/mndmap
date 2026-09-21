import { dirname } from "node:path";
import { contentFingerprint, shapeFingerprint, stableId } from "./fingerprints.js";
import { offsetRange } from "./parser.js";
import type { MndmapConfig, ParsedDocument, SourceNode, SourceNodeKind } from "./types.js";

export function extractSourceNodes(documents: ParsedDocument[], scanId: string): SourceNode[] {
  const nodes: SourceNode[] = [];
  const folders = new Set<string>();

  for (const document of documents) {
    const parts = document.path.split("/");
    for (let index = 0; index < parts.length - 1; index++) {
      folders.add(parts.slice(0, index + 1).join("/"));
    }
  }

  for (const folder of [...folders].sort()) {
    nodes.push(makeNode({
      kind: "folder",
      sourcePath: folder,
      sourceLocator: "",
      title: folder.split("/").pop() ?? folder,
      content: folder,
      parentKind: "root",
      siblingIndex: siblingIndex(folder),
      scanId,
    }));
  }

  for (const document of documents) {
    const extension = document.path.endsWith(".mdx") ? ".mdx" : ".md";
    const title = documentTitle(document, extension);
    const slug = document.path.split("/").pop()!.slice(0, -extension.length);
    const explicitKey = explicitId(document.frontmatter);
    nodes.push(makeNode({
      kind: "page",
      sourcePath: document.path,
      sourceLocator: "",
      title,
      content: document.content,
      parentKind: "folder",
      siblingIndex: siblingIndex(document.path),
      scanId,
      ...(explicitKey ? { explicitKey } : {}),
      sourceData: { revision: document.revision, extension, slug,
                    frontmatter: document.frontmatter ?? null },
    }));

    let tableIndex = 0;
    let listIndex = 0;
    let itemIndex = 0;
    let linkIndex = 0;

    for (const node of document.structure) {
      const text = node.text ?? slice(document.content, node.range);
      if (node.kind === "section") {
        nodes.push(makeNode({
          kind: "section",
          sourcePath: document.path,
          sourceLocator: node.headingPath?.join("/") ?? text,
          title: text,
          content: slice(document.content, node.range),
          parentKind: "page",
          siblingIndex: node.depth ?? 1,
          scanId,
          /** The section's own text, kept so the dashboard can show a segment
           *  without re-reading the file it came from. */
          sourceData: { depth: node.depth, headingPath: node.headingPath, range: node.range,
                        body: slice(document.content, node.range) },
        }));
      } else if (node.kind === "table") {
        tableIndex++;
        nodes.push(makeNode({
          kind: "table",
          sourcePath: document.path,
          sourceLocator: `${(node.headingPath ?? []).join("/")}#table-${tableIndex}`,
          title: `Table ${tableIndex}`,
          content: slice(document.content, node.range),
          parentKind: "section",
          siblingIndex: tableIndex,
          scanId,
          sourceData: { headingPath: node.headingPath, range: node.range },
        }));
        const rows = extractTableRows(document.content, node.range);
        rows.forEach((row, index) => {
          nodes.push(makeNode({
            kind: "row",
            sourcePath: document.path,
            sourceLocator: `${(node.headingPath ?? []).join("/")}#table-${tableIndex}/row-${index + 1}`,
            title: row.label,
            content: row.content,
            parentKind: "table",
            siblingIndex: index + 1,
            scanId,
            ...(row.explicitKey ? { explicitKey: row.explicitKey } : {}),
            sourceData: { values: row.values, range: row.range },
          }));
        });
      } else if (node.kind === "list") {
        listIndex++;
        nodes.push(makeNode({
          kind: "list",
          sourcePath: document.path,
          sourceLocator: `${(node.headingPath ?? []).join("/")}#list-${listIndex}`,
          title: `List ${listIndex}`,
          content: slice(document.content, node.range),
          parentKind: "section",
          siblingIndex: listIndex,
          scanId,
          sourceData: { headingPath: node.headingPath, range: node.range },
        }));
      } else if (node.kind === "list-item") {
        itemIndex++;
        nodes.push(makeNode({
          kind: "item",
          sourcePath: document.path,
          sourceLocator: `${(node.headingPath ?? []).join("/")}#item-${itemIndex}`,
          title: text.slice(0, 80),
          content: slice(document.content, node.range),
          parentKind: "list",
          siblingIndex: itemIndex,
          scanId,
          sourceData: { headingPath: node.headingPath, range: node.range },
        }));
      } else if (node.kind === "link") {
        linkIndex++;
        nodes.push(makeNode({
          kind: "link",
          sourcePath: document.path,
          sourceLocator: `${(node.headingPath ?? []).join("/")}#link-${linkIndex}`,
          title: text,
          content: node.destination ?? text,
          parentKind: "section",
          siblingIndex: linkIndex,
          scanId,
          sourceData: { destination: node.destination, range: node.range },
        }));
      }
    }
  }

  return nodes;
}

function makeNode(input: {
  kind: SourceNodeKind;
  sourcePath: string;
  sourceLocator: string;
  title: string;
  content: string;
  parentKind: string;
  siblingIndex: number;
  scanId: string;
  explicitKey?: string;
  sourceData?: Record<string, unknown>;
}): SourceNode {
  const id = stableId("sn", [input.kind, input.sourcePath, input.sourceLocator, input.explicitKey ?? ""]);
  return {
    id,
    kind: input.kind,
    ...(input.explicitKey ? { explicitKey: input.explicitKey } : {}),
    sourcePath: input.sourcePath,
    sourceLocator: input.sourceLocator,
    contentFingerprint: contentFingerprint(input.content),
    shapeFingerprint: shapeFingerprint([input.parentKind, String(input.siblingIndex), input.kind]),
    sourceData: { title: input.title, ...(input.sourceData ?? {}) },
    scanId: input.scanId,
    resolution: "resolved",
  };
}

function siblingIndex(path: string): number {
  const parts = path.split("/");
  return parts[parts.length - 1]!.charCodeAt(0);
}

/** What the document calls itself: its frontmatter title, then its first
 *  heading, and only then its filename. An author who named the page is never
 *  told it is called something else. Where it is **filed** is a separate
 *  question, answered by the filename, so renaming a heading never moves it. */
function documentTitle(document: ParsedDocument, extension: string): string {
  const front = document.frontmatter as Record<string, unknown> | null | undefined;
  const declared = front && typeof front["title"] === "string" ? front["title"].trim() : "";
  if (declared) return declared;
  const heading = /^#s+(.+)$/m.exec(document.content)?.[1]?.trim();
  return heading || titleFromPath(document.path, extension);
}

function titleFromPath(path: string, extension: string): string {
  const base = path.split("/").pop()!.slice(0, -extension.length);
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function explicitId(frontmatter: unknown): string | undefined {
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) return undefined;
  const id = (frontmatter as Record<string, unknown>).id;
  return typeof id === "string" && id ? id : undefined;
}

function slice(content: string, range: { start: number; end: number }): string {
  return content.slice(range.start, range.end);
}

function extractTableRows(content: string, range: { start: number; end: number }): Array<{
  label: string;
  content: string;
  explicitKey?: string;
  values: Record<string, string>;
  range: { start: number; end: number };
}> {
  const tableText = slice(content, range);
  const lines = tableText.split("\n").filter((line) => line.trim().startsWith("|"));
  if (lines.length < 2) return [];
  const headers = lines[0]!.split("|").map((cell) => cell.trim()).filter(Boolean);
  const bodyLines = lines.slice(2);
  return bodyLines.map((line, index) => {
    const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell.length > 0);
    const values = Object.fromEntries(headers.map((header, headerIndex) => [header, cells[headerIndex] ?? ""]));
    const first = cells[0] ?? `row-${index + 1}`;
    const idHeader = headers.find((header) => header.toLowerCase() === "id");
    const explicitKey = idHeader ? values[idHeader] : undefined;
    return {
      label: first,
      content: line,
      ...(explicitKey ? { explicitKey } : {}),
      values,
      range: offsetRange(content, range.start + tableText.indexOf(line), range.start + tableText.indexOf(line) + line.length),
    };
  });
}

export function locatorKey(node: Pick<SourceNode, "sourcePath" | "sourceLocator">): string {
  return `${node.sourcePath}\0${node.sourceLocator}`;
}

const KIND_LABELS: Record<SourceNodeKind, string> = {
  folder: "folder",
  page: "page",
  section: "section",
  table: "table",
  row: "table row",
  list: "list",
  item: "list item",
  term: "term",
  link: "link",
};

/** Human-readable label for diagnostics and UI copy. */
export function describeSourceNode(node: Pick<SourceNode, "kind" | "sourcePath" | "sourceLocator" | "sourceData">): string {
  const kind = KIND_LABELS[node.kind] ?? node.kind;
  const title = sourceNodeTitle(node);
  if (node.kind === "folder") return `${kind} ${node.sourcePath}/`;
  if (node.kind === "page") return `${kind} "${title}" (${node.sourcePath})`;
  return `${kind} "${title}" in ${node.sourcePath}`;
}

function sourceNodeTitle(node: Pick<SourceNode, "sourcePath" | "sourceData">): string {
  const title = node.sourceData.title;
  if (typeof title === "string" && title.trim()) return title;
  const file = node.sourcePath.split("/").pop() ?? node.sourcePath;
  return file.replace(/\.(md|mdx)$/i, "");
}

export function applySelectorIdentity(nodes: SourceNode[], config: MndmapConfig): void {
  for (const selector of config.selectors) {
    if (!selector.identity?.field) continue;
    for (const node of nodes) {
      if (node.sourcePath !== selector.document.replace(/\\/g, "/")) continue;
      const field = selector.identity.field;
      const values = node.sourceData.values as Record<string, string> | undefined;
      if (values && values[field]) node.explicitKey = String(values[field]);
    }
  }
}

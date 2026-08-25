import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fg from "fast-glob";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import YAML from "yaml";
import type { Diagnostic, MndmapConfig, ParsedDocument, SourceRange, StructuralNode } from "./types.js";

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);
const mdxProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]).use(remarkMdx);

export function revision(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function parseDocument(path: string, content: string, config?: MndmapConfig): ParsedDocument {
  const tree: any = (path.toLowerCase().endsWith(".mdx") ? mdxProcessor : markdownProcessor).parse(content);
  const diagnostics: Diagnostic[] = [];
  let frontmatter: unknown;

  for (const node of tree.children ?? []) {
    if (node.type === "yaml") {
      try { frontmatter = YAML.parse(node.value); }
      catch { diagnostics.push({ code: "invalid-frontmatter", severity: "error", message: "Invalid YAML frontmatter", document: path, range: range(node) }); }
      continue;
    }
    if (node.type === "mdxFlowExpression" || node.type === "mdxJsxFlowElement" || node.type === "mdxjsEsm") {
      diagnostics.push({ code: "opaque-mdx", severity: "info", message: "MDX expression is preserved but not structurally rewritten", document: path, range: range(node) });
    }
  }

  if (config) validateSelectors(path, tree, content, config, diagnostics);
  return {
    path,
    content,
    revision: revision(content),
    structure: projectStructure(tree, content),
    diagnostics,
    ...(frontmatter === undefined ? {} : { frontmatter }),
  };
}

export async function parseWorkspace(root: string, config: MndmapConfig): Promise<ParsedDocument[]> {
  const docsDir = resolve(root, "docs");
  try {
    await access(docsDir);
  } catch {
    throw new Error("Missing docs/ directory");
  }
  const paths = await fg(config.sources.include, { cwd: root, ignore: config.sources.exclude, onlyFiles: true });
  if (paths.length === 0) throw new Error("No source documents matched the configured include patterns");
  return Promise.all(paths.sort().map(async (path) =>
    parseDocument(path.replaceAll("\\", "/"), await readFile(resolve(root, path), "utf8"), config)));
}

function validateSelectors(path: string, tree: any, content: string, config: MndmapConfig, diagnostics: Diagnostic[]): void {
  for (const [index, selector] of config.selectors.entries()) {
    if (normalize(selector.document) !== normalize(path)) continue;
    const matches = findSelectorMatches(tree, content, selector.match);
    const selected = selector.match.occurrence ? (matches[selector.match.occurrence - 1] ? [matches[selector.match.occurrence - 1]!] : []) : matches;
    if (selected.length !== 1) {
      diagnostics.push({
        code: "selector-cardinality",
        severity: "error",
        message: `Selector ${index} matched ${selected.length} regions in ${path}`,
        document: path,
      });
    }
  }
}

function findSelectorMatches(tree: any, content: string, match: MndmapConfig["selectors"][number]["match"]): SourceRange[] {
  const headingPath: string[] = [];
  const matches: SourceRange[] = [];
  const occurrences = new Map<string, number>();

  const visit = (node: any): void => {
    if (node.type === "heading") {
      headingPath.splice(node.depth - 1);
      headingPath[node.depth - 1] = plainText(node, content);
    }
    if (match.kind === "table" && node.type === "table") {
      if (selectorHeadingMatches(match, headingPath) && selectorHeadersMatch(node, content, match)) {
        const key = headingPath.join("/");
        const occurrence = (occurrences.get(key) ?? 0) + 1;
        occurrences.set(key, occurrence);
        matches.push(range(node));
      }
    }
    if (match.kind === "list" && node.type === "list" && (node.children?.length ?? 0) >= 2 && selectorHeadingMatches(match, headingPath)) {
      const key = headingPath.join("/");
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      matches.push(range(node));
    }
    if (match.kind === "section" && node.type === "heading" && selectorHeadingMatches(match, headingPath)) {
      matches.push(range(node));
    }
    if (match.kind === "frontmatter" && node.type === "yaml") matches.push(range(node));
    for (const child of node.children ?? []) visit(child);
  };

  for (const node of tree.children ?? []) visit(node);
  return matches;
}

function selectorHeadingMatches(match: MndmapConfig["selectors"][number]["match"], headingPath: string[]): boolean {
  if (!match.under) return true;
  return match.under.join("/") === headingPath.join("/");
}

function selectorHeadersMatch(node: any, content: string, match: MndmapConfig["selectors"][number]["match"]): boolean {
  if (!match.headers) return true;
  const rows = node.children ?? [];
  if (rows.length < 1) return false;
  const headers = rows[0].children.map((cell: any) => plainText(cell, content).trim());
  return match.headers.every((header) => headers.includes(header));
}

function projectStructure(tree: any, content: string): StructuralNode[] {
  const result: StructuralNode[] = [];
  const headings: Array<{ node: any; path: string[] }> = [];
  const path: string[] = [];
  for (const node of tree.children ?? []) {
    if (node.type === "heading") {
      path.splice(node.depth - 1);
      path[node.depth - 1] = plainText(node, content);
      headings.push({ node, path: [...path] });
    }
    projectNode(node, content, result, [...path]);
  }
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]!;
    const next = headings.slice(index + 1).find((candidate) => candidate.node.depth <= heading.node.depth);
    result.push({
      kind: "section",
      range: offsetRange(content, heading.node.position.start.offset, next?.node.position.start.offset ?? content.length),
      depth: heading.node.depth,
      headingPath: heading.path,
      text: plainText(heading.node, content),
    });
  }
  return result.sort((left, right) => left.range.start - right.range.start || left.range.end - right.range.end);
}

function projectNode(node: any, content: string, result: StructuralNode[], headingPath: string[]): void {
  const kinds: Record<string, StructuralNode["kind"]> = {
    heading: "heading", table: "table", list: "list", listItem: "list-item", link: "link", yaml: "frontmatter",
    mdxFlowExpression: "mdx-opaque", mdxTextExpression: "mdx-opaque", mdxJsxFlowElement: "mdx-opaque",
    mdxJsxTextElement: "mdx-opaque", mdxjsEsm: "mdx-opaque",
  };
  const kind = kinds[node.type];
  if (kind && node.position) {
    result.push({
      kind,
      range: range(node),
      ...(kind === "heading" ? { depth: node.depth, text: plainText(node, content), headingPath } : {}),
      ...(kind === "link" ? { text: plainText(node, content), destination: node.url, headingPath } : {}),
      ...(["table", "list", "list-item"].includes(kind) ? { headingPath } : {}),
    });
  }
  for (const child of node.children ?? []) projectNode(child, content, result, headingPath);
}

export function plainText(node: any, content: string): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child: any) => plainText(child, content)).join("");
}

export function range(node: any): SourceRange {
  return { start: node.position.start.offset, end: node.position.end.offset, line: node.position.start.line, column: node.position.start.column };
}

export function offsetRange(content: string, start: number, end: number): SourceRange {
  const prefix = content.slice(0, start);
  const lines = prefix.split("\n");
  return { start, end, line: lines.length, column: lines.at(-1)!.length + 1 };
}

function normalize(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function sourceText(node: any, content: string): string {
  return content.slice(node.position.start.offset, node.position.end.offset);
}

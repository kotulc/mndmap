import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import fg from "fast-glob";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import YAML from "yaml";
import type {
  CollectionConfig, Diagnostic, FieldDefinition, FieldValue, MndmapConfig, ParsedCollection,
  ParsedDocument, ParsedRecord, SourceLocation, SourceRange, StructuralNode,
} from "./types.js";

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);
const mdxProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]).use(remarkMdx);

export function revision(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function parseDocument(path: string, content: string, config?: MndmapConfig): ParsedDocument {
  const tree: any = (path.toLowerCase().endsWith(".mdx") ? mdxProcessor : markdownProcessor).parse(content);
  const diagnostics: Diagnostic[] = [];
  const candidates: Array<ParsedCollection & { headingPath: string[] }> = [];
  const headingPath: string[] = [];
  const occurrences = new Map<string, number>();
  let frontmatter: unknown;

  for (const node of tree.children ?? []) {
    if (node.type === "heading") {
      const name = plainText(node, content);
      headingPath.splice(node.depth - 1);
      headingPath[node.depth - 1] = name;
      continue;
    }
    if (node.type === "yaml") {
      try {
        frontmatter = YAML.parse(node.value);
        if (configuredKind(config, path, "frontmatter")) {
          candidates.push(Object.assign(frontmatterCollection(path, content, node, frontmatter), { headingPath: [] }));
        }
      }
      catch { diagnostics.push({ code: "invalid-frontmatter", severity: "error", message: "Invalid YAML frontmatter", document: path, range: range(node) }); }
      continue;
    }
    if (node.type === "mdxFlowExpression" || node.type === "mdxJsxFlowElement" || node.type === "mdxjsEsm") {
      diagnostics.push({ code: "opaque-mdx", severity: "info", message: "MDX content is readable but not structurally writable", document: path, range: range(node) });
      continue;
    }
    visitStructural(node, (candidate) => {
      const key = `${candidate.kind}:${headingPath.join("/")}`;
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      const collection = candidate.kind === "table"
        ? tableCollection(path, content, candidate.node, headingPath, occurrence, diagnostics)
        : listCollection(path, content, candidate.node, headingPath, occurrence, diagnostics, configuredPlainList(config, path, headingPath));
      if (collection) candidates.push(Object.assign(collection, { headingPath: [...headingPath] }));
    });
  }
  if (configuredKind(config, path, "section")) {
    candidates.push(...sectionCollections(path, content, tree).map((collection) =>
      Object.assign(collection, { headingPath: collection.headingPath })));
  }

  const selected = applyDocumentConfig(path, candidates, config, diagnostics);
  for (const collection of selected) reportLocatorIdentity(path, collection.records, diagnostics);
  return { path, content, revision: revision(content), collections: selected, structure: projectStructure(tree, content), diagnostics, ...(frontmatter === undefined ? {} : { frontmatter }) };
}

export async function parseWorkspace(root: string, config: MndmapConfig): Promise<ParsedDocument[]> {
  const paths = await fg(config.sources.include, { cwd: root, ignore: config.sources.exclude, onlyFiles: true });
  const documents = await Promise.all(paths.sort().map(async (path) =>
    parseDocument(path.replaceAll("\\", "/"), await readFile(resolve(root, path), "utf8"), config)));
  mergeConfiguredCollections(documents, config);
  await attachGeneratedRegions(root, documents, config);
  validateScratchAliases(documents, config);
  return documents;
}

async function attachGeneratedRegions(root: string, documents: ParsedDocument[], config: MndmapConfig): Promise<void> {
  for (const [collectionId, collectionConfig] of Object.entries(config.collections)) {
    const collection = documents.flatMap((document) => document.collections).find((candidate) => candidate.id === collectionId);
    if (!collection) continue;
    for (const generated of collectionConfig.generated ?? []) {
      const path = normalize(generated.document);
      let document = documents.find((candidate) => normalize(candidate.path) === path);
      if (!document) {
        let content = "";
        try { content = await readFile(resolve(root, path), "utf8"); }
        catch (error: any) { if (error?.code !== "ENOENT") throw error; }
        document = parseDocument(path, content, config);
        documents.push(document);
      }
      let generatedRange = offsetRange(document.content, 0, document.content.length);
      let framed = false;
      if (generated.between) {
        const [startMarker, endMarker] = generated.between;
        const start = document.content.indexOf(startMarker);
        const duplicateStart = start >= 0 && document.content.indexOf(startMarker, start + startMarker.length) >= 0;
        const end = start < 0 ? -1 : document.content.indexOf(endMarker, start + startMarker.length);
        const duplicateEnd = end >= 0 && document.content.indexOf(endMarker, end + endMarker.length) >= 0;
        if (start < 0 || end < 0 || duplicateStart || duplicateEnd) {
          document.diagnostics.push({
            code: "generated-region-cardinality",
            severity: "error",
            message: `Generated region for ${collectionId} must contain exactly one ordered marker pair`,
            document: path,
          });
          continue;
        }
        generatedRange = offsetRange(document.content, start + startMarker.length, end);
        framed = true;
      }
      collection.sourceRegions.push({
        document: path,
        range: generatedRange,
        generated: { template: generated.template, ...(framed ? { framed: true } : {}) },
      });
    }
  }
  documents.sort((left, right) => left.path.localeCompare(right.path));
}

function visitStructural(node: any, callback: (candidate: { kind: "table" | "list"; node: any }) => void): void {
  if (node.type === "table") callback({ kind: "table", node });
  else if (node.type === "list") {
    callback({ kind: "list", node });
    return;
  }
  for (const child of node.children ?? []) visitStructural(child, callback);
}

function tableCollection(path: string, content: string, node: any, headings: string[], occurrence: number, diagnostics: Diagnostic[]): ParsedCollection | null {
  const rows = node.children ?? [];
  if (rows.length < 2) return null;
  const sourceHeaders: string[] = rows[0].children.map((cell: any) => plainText(cell, content).trim());
  const occupied = new Set<string>();
  const occurrences = new Map<string, number>();
  const headers = sourceHeaders.map((header, index) => {
    if (header && !occupied.has(header)) {
      occupied.add(header);
      occurrences.set(header, 1);
      return header;
    }
    let generated: string;
    let code: string;
    let message: string;
    if (header) {
      const occurrence = (occurrences.get(header) ?? 1) + 1;
      occurrences.set(header, occurrence);
      generated = `${header} (${occurrence})`;
      while (occupied.has(generated)) generated = `${generated}*`;
      code = "duplicate-table-header";
      message = `Repeated table header ${header} is exposed as ${generated}`;
    } else {
      generated = `$column${index + 1}`;
      while (occupied.has(generated)) generated = `$${generated}`;
      code = "unnamed-table-header";
      message = `Unnamed table column ${index + 1} is exposed as ${generated}`;
    }
    occupied.add(generated);
    diagnostics.push({
      code,
      severity: "warning",
      message,
      document: path,
      range: range(rows[0].children[index]),
    });
    return generated;
  });
  const rawRows = rows.slice(1).map((row: any, order: number) => {
    const values: Record<string, FieldValue> = {};
    const fields: Record<string, SourceRange> = {};
    headers.forEach((header: string, index: number) => {
      const cell = row.children[index];
      if (cell) {
        const cellRange = tableCellRange(cell, content);
        values[header] = content.slice(cellRange.start, cellRange.end);
        fields[header] = cellRange;
      } else values[header] = "";
    });
    return { row, order, values, fields };
  });
  const identityField = findIdentityField(headers, rawRows.map((row: any) => row.values));
  const records = rawRows.map(({ row, order, values, fields }: any) => {
    const key = identityField ? String(values[identityField]) : locatorId(path, node.position.start.offset, row.position.start.offset);
    return {
      id: key,
      values,
      order,
      identityConfidence: identityField ? (identityField.toLowerCase() === "id" ? "explicit" : "unique") : "locator",
      locations: [location(path, node, row, fields, "table")],
    } satisfies ParsedRecord;
  });
  const id = inferredId(path, headings, "table", occurrence);
  return {
    id, name: headings.at(-1) ?? id, records,
    fields: headers.map((header): FieldDefinition => ({ id: header, sourceName: header, sourceBacked: true, writable: true, kind: "markdown" })),
    capabilities: { create: true, delete: true, writableFields: headers },
    sourceRegions: [{ document: path, range: range(node) }],
  };
}

function listCollection(
  path: string,
  content: string,
  node: any,
  headings: string[],
  occurrence: number,
  diagnostics: Diagnostic[],
  configuredPlain = false,
): ParsedCollection | null {
  const items = node.children ?? [];
  if (items.length < 2) return null;
  const task = items.every((item: any) => typeof item.checked === "boolean");
  const labeled: Array<{ values: Record<string, string>; ranges: Record<string, SourceRange> }> = items.map((item: any) => labeledFields(item, content));
  const common = labeled.length ? Object.keys(labeled[0]!.values).filter((label) => labeled.every((entry: { values: Record<string, string> }) => label in entry.values)) : [];
  const plain = !task && common.length === 0;
  if (plain && !configuredPlain) {
    if (items.length >= 2) diagnostics.push({ code: "ambiguous-list", severity: "info", message: "List lacks a strong repeated record shape and was not inferred", document: path, range: range(node) });
    return null;
  }
  const records: ParsedRecord[] = items.map((item: any, order: number) => {
    const labels = labeled[order]!;
    const text = itemTextRange(item, content);
    const values: Record<string, FieldValue> = task
      ? { $checked: item.checked, $text: content.slice(text.start, text.end) }
      : plain
        ? { $text: content.slice(text.start, text.end) }
      : Object.fromEntries(common.map((label) => [label, labels.values[label]!]));
    const fields: Record<string, SourceRange> = task
      ? { $checked: checkboxRange(item, content), $text: text }
      : plain
        ? { $text: text }
      : Object.fromEntries(common.map((label) => [label, labels.ranges[label]!]));
    const identityField = task ? undefined : findIdentityField(common, labeled.map((entry: { values: Record<string, string> }) => entry.values));
    const id = identityField ? String(values[identityField]) : locatorId(path, node.position.start.offset, item.position.start.offset);
    return {
      id, values, order, identityConfidence: identityField ? (identityField.toLowerCase() === "id" ? "explicit" : "unique") : "locator",
      locations: [location(path, node, item, fields, task ? "task-list" : plain ? "plain-list" : "labeled-list")],
    };
  });
  const fieldNames = task ? ["$checked", "$text"] : plain ? ["$text"] : common;
  const writableFields = task ? ["$checked", "$text"] : plain ? ["$text"] : common;
  const id = inferredId(path, headings, task ? "tasks" : "list", occurrence);
  return {
    id, name: headings.at(-1) ?? id, records,
    fields: fieldNames.map((name) => ({ id: name, sourceName: name, sourceBacked: true, writable: writableFields.includes(name), kind: name === "$checked" ? "boolean" : "markdown" })),
    capabilities: { create: false, delete: true, writableFields },
    sourceRegions: [{ document: path, range: range(node) }],
  };
}

function labeledFields(item: any, content: string): { values: Record<string, string>; ranges: Record<string, SourceRange> } {
  const values: Record<string, string> = {};
  const ranges: Record<string, SourceRange> = {};
  const nested = (item.children ?? []).filter((child: any) => child.type === "list").flatMap((list: any) => list.children ?? []);
  for (const child of nested) {
    const paragraph = child.children?.find((entry: any) => entry.type === "paragraph");
    if (!paragraph) continue;
    const text = sourceText(paragraph, content);
    const match = /^([^:\n]+):\s*(.*)$/s.exec(text);
    if (!match) continue;
    const label = match[1]!.trim();
    const start = paragraph.position.start.offset + text.indexOf(match[2]!);
    values[label] = match[2]!.trim();
    ranges[label] = offsetRange(content, start, paragraph.position.end.offset);
  }
  return { values, ranges };
}

function frontmatterCollection(path: string, content: string, node: any, value: unknown): ParsedCollection {
  const bodyStart = content.indexOf(node.value, node.position.start.offset);
  const bodyRange = offsetRange(content, bodyStart, bodyStart + node.value.length);
  const document = YAML.parseDocument(node.value);
  const values: Record<string, FieldValue> = {};
  const fields: Record<string, SourceRange> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (!isFieldValue(item)) continue;
      values[key] = item;
    }
  }
  if (YAML.isMap(document.contents)) {
    for (const pair of document.contents.items) {
      const key = String(pair.key);
      const valueRange = pair.value?.range;
      if (key in values && valueRange) fields[key] = offsetRange(content, bodyStart + valueRange[0], bodyStart + valueRange[1]);
    }
  }
  const id = `${normalize(path)}#frontmatter`;
  return {
    id,
    name: "Frontmatter",
    fields: Object.keys(values).map((key) => ({ id: key, sourceName: key, sourceBacked: true, writable: key in fields, kind: "markdown" })),
    records: [{
      id,
      values,
      order: 0,
      identityConfidence: "locator",
      locations: [{ document: path, region: range(node), record: bodyRange, fields, adapter: "frontmatter" }],
    }],
    capabilities: { create: false, delete: false, writableFields: Object.keys(fields) },
    sourceRegions: [{ document: path, range: range(node) }],
  };
}

function sectionCollections(path: string, content: string, tree: any): Array<ParsedCollection & { headingPath: string[] }> {
  const headings: Array<{ node: any; path: string[] }> = [];
  const current: string[] = [];
  for (const node of tree.children ?? []) {
    if (node.type !== "heading") continue;
    current.splice(node.depth - 1);
    current[node.depth - 1] = plainText(node, content);
    headings.push({ node, path: [...current] });
  }
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.node.depth <= heading.node.depth);
    const sectionEnd = next?.node.position.start.offset ?? content.length;
    let bodyStart = heading.node.position.end.offset;
    if (content[bodyStart] === "\r" && content[bodyStart + 1] === "\n") bodyStart += 2;
    else if (content[bodyStart] === "\n") bodyStart++;
    if (content[bodyStart] === "\r" && content[bodyStart + 1] === "\n") bodyStart += 2;
    else if (content[bodyStart] === "\n") bodyStart++;
    let bodyEnd = sectionEnd;
    while (bodyEnd > bodyStart && (content[bodyEnd - 1] === "\n" || content[bodyEnd - 1] === "\r")) bodyEnd--;
    const body = offsetRange(content, bodyStart, bodyEnd);
    const id = inferredId(path, heading.path, "section", 1);
    return {
      id,
      name: heading.path.at(-1) ?? id,
      headingPath: heading.path,
      fields: [{ id: "$body", sourceName: "$body", sourceBacked: true, writable: true, kind: "markdown" }],
      records: [{
        id,
        values: { $body: content.slice(body.start, body.end) },
        order: 0,
        identityConfidence: "locator",
        locations: [{
          document: path,
          region: offsetRange(content, heading.node.position.start.offset, sectionEnd),
          record: body,
          fields: { $body: body },
          adapter: "section",
        }],
      }],
      capabilities: { create: false, delete: false, writableFields: ["$body"] },
      sourceRegions: [{ document: path, range: offsetRange(content, heading.node.position.start.offset, sectionEnd) }],
    };
  });
}

function configuredKind(config: MndmapConfig | undefined, path: string, kind: CollectionConfig["sources"][number]["select"]["kind"]): boolean {
  return Boolean(config && Object.values(config.collections).some((collection) =>
    collection.sources.some((source) => normalize(source.document) === normalize(path) && source.select.kind === kind)));
}

function configuredPlainList(config: MndmapConfig | undefined, path: string, headings: string[]): boolean {
  return Boolean(config && Object.values(config.collections).some((collection) =>
    collection.sources.some((source) =>
      normalize(source.document) === normalize(path)
      && source.select.kind === "list"
      && (!source.select.under || source.select.under.join("/") === headings.join("/")))));
}

function isFieldValue(value: unknown): value is FieldValue {
  return value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number"
    || (Array.isArray(value) && value.every(isFieldValue));
}

function applyDocumentConfig(path: string, candidates: Array<ParsedCollection & { headingPath: string[] }>, config: MndmapConfig | undefined, diagnostics: Diagnostic[]): ParsedCollection[] {
  if (!config || Object.keys(config.collections).length === 0) return candidates.map(stripHeading);
  const configuredCandidateIds = new Set<string>();
  const result: ParsedCollection[] = [];
  for (const [id, collectionConfig] of Object.entries(config.collections)) {
    const sources = collectionConfig.sources.filter((source) => normalize(source.document) === normalize(path));
    for (const source of sources) {
      const matches = candidates.filter((candidate) => selectorMatches(candidate, source.select));
      const selected = source.select.occurrence ? matches[source.select.occurrence - 1] ? [matches[source.select.occurrence - 1]!] : [] : matches;
      if (selected.length !== 1) {
        diagnostics.push({ code: "selector-cardinality", severity: "error", message: `Configured collection ${id} matched ${selected.length} regions in ${path}`, document: path });
        continue;
      }
      const mapped = configureCollection(selected[0]!, id, collectionConfig, source);
      configuredCandidateIds.add(selected[0]!.id);
      result.push(mapped);
    }
  }
  for (const candidate of candidates) {
    const adapter = candidate.records[0]?.locations[0]?.adapter;
    if (!configuredCandidateIds.has(candidate.id) && !["section", "frontmatter", "plain-list"].includes(adapter ?? "")) {
      result.push(stripHeading(candidate));
    }
  }
  return result;
}

function selectorMatches(candidate: ParsedCollection & { headingPath: string[] }, selector: CollectionConfig["sources"][number]["select"]): boolean {
  const adapterKind = candidate.records[0]?.locations[0]?.adapter;
  if (selector.kind === "table" && adapterKind !== "table") return false;
  if (selector.kind === "list" && !["task-list", "labeled-list", "plain-list"].includes(adapterKind ?? "")) return false;
  if (selector.kind === "section" && adapterKind !== "section") return false;
  if (selector.kind === "frontmatter" && adapterKind !== "frontmatter") return false;
  if (selector.under && selector.under.join("/") !== candidate.headingPath.join("/")) return false;
  if (selector.headers && !selector.headers.every((header) => candidate.fields.some((field) => field.sourceName === header))) return false;
  return true;
}

function configureCollection(candidate: ParsedCollection, id: string, config: CollectionConfig, source: CollectionConfig["sources"][number]): ParsedCollection {
  const mappings = source.fields ?? {};
  const sourceToApi = new Map(Object.entries(mappings).map(([api, mapping]) => [
    mapping.column ?? mapping.label ?? mapping.frontmatter ?? (mapping.section ? "$body" : undefined) ?? (mapping.text ? "$text" : undefined) ?? api,
    api,
  ]));
  const fields = candidate.fields.map((field) => ({ ...field, id: sourceToApi.get(field.sourceName) ?? field.sourceName }));
  const records = candidate.records.map((record) => {
    const values = Object.fromEntries(Object.entries(record.values).map(([key, value]) => [sourceToApi.get(key) ?? key, value]));
    const locations = record.locations.map((location) => ({ ...location, fields: Object.fromEntries(Object.entries(location.fields).map(([key, value]) => [sourceToApi.get(key) ?? key, value])) }));
    const configuredKey = source.key?.field;
    const normalizedKey = configuredKey ? (sourceToApi.get(configuredKey) ?? configuredKey) : undefined;
    return {
      ...record,
      id: source.recordId ?? (normalizedKey && values[normalizedKey] !== undefined ? String(values[normalizedKey]) : record.id),
      values,
      locations,
      identityConfidence: source.recordId || configuredKey ? "configured" as const : record.identityConfidence,
    };
  });
  const writableFields = config.writableFields ?? fields.filter((field) => field.writable).map((field) => field.id);
  if (config.order?.length) {
    records.sort((left, right) => {
      for (const field of config.order!) {
        const compared = String(left.values[field] ?? "").localeCompare(String(right.values[field] ?? ""));
        if (compared) return compared;
      }
      return left.order - right.order;
    });
    records.forEach((record, index) => { record.order = index; });
  }
  return { ...candidate, id, fields: fields.map((field) => ({ ...field, writable: writableFields.includes(field.id) })), records, capabilities: { ...candidate.capabilities, create: candidate.capabilities.create || Boolean(config.createTemplate), writableFields } };
}

function mergeConfiguredCollections(documents: ParsedDocument[], config: MndmapConfig): void {
  for (const id of Object.keys(config.collections)) {
    const pieces = documents.flatMap((document) => document.collections.filter((collection) => collection.id === id).map((collection) => ({ document, collection })));
    if (pieces.length < 2) continue;
    const configuredSources = config.collections[id]!.sources;
    pieces.sort((left, right) => {
      const leftSource = configuredSources.findIndex((source) => normalize(source.document) === normalize(left.document.path));
      const rightSource = configuredSources.findIndex((source) => normalize(source.document) === normalize(right.document.path));
      return leftSource - rightSource
        || left.collection.sourceRegions[0]!.range.start - right.collection.sourceRegions[0]!.range.start;
    });
    const target = pieces[0]!.collection;
    const byId = new Map(target.records.map((record) => [record.id, record]));
    for (const piece of pieces.slice(1)) {
      for (const record of piece.collection.records) {
        const existing = byId.get(record.id);
        if (!existing) { target.records.push(record); byId.set(record.id, record); continue; }
        for (const [field, value] of Object.entries(record.values)) {
          if (field in existing.values && existing.values[field] !== value) piece.document.diagnostics.push({ code: "conflicting-representation", severity: "error", message: `Record ${record.id} has conflicting ${field} values`, document: piece.document.path });
          else existing.values[field] = value;
        }
        existing.locations.push(...record.locations);
      }
      target.sourceRegions.push(...piece.collection.sourceRegions);
      piece.document.collections = piece.document.collections.filter((collection) => collection !== piece.collection);
    }
    target.records.forEach((record, index) => { record.order = index; });
    const configuredOrder = config.collections[id]!.order;
    if (configuredOrder?.length) {
      target.records.sort((left, right) => {
        for (const field of configuredOrder) {
          const compared = String(left.values[field] ?? "").localeCompare(String(right.values[field] ?? ""));
          if (compared) return compared;
        }
        return left.order - right.order;
      });
      target.records.forEach((record, index) => { record.order = index; });
    }
  }
}

function validateScratchAliases(documents: ParsedDocument[], config: MndmapConfig): void {
  const sourceFields = new Set(documents.flatMap((document) => document.collections.flatMap((collection) => collection.fields.map((field) => field.id))));
  for (const scratch of config.scratchFields) if (sourceFields.has(scratch.alias)) throw new Error(`Scratch alias ${scratch.alias} collides with a source-backed field`);
}

function projectStructure(tree: any, content: string): StructuralNode[] {
  const result: StructuralNode[] = [];
  const headings: Array<{ node: any; path: string[]; index: number }> = [];
  const path: string[] = [];
  for (let index = 0; index < (tree.children ?? []).length; index++) {
    const node = tree.children[index];
    if (node.type === "heading") {
      path.splice(node.depth - 1);
      path[node.depth - 1] = plainText(node, content);
      headings.push({ node, path: [...path], index });
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

function findIdentityField(fields: string[], rows: Array<Record<string, any>>): string | undefined {
  const preferred = fields.find((field) => field.toLowerCase() === "id");
  const ordered = preferred ? [preferred, ...fields.filter((field) => field !== preferred)] : fields;
  return ordered.find((field) => {
    const values = rows.map((row) => String(row[field] ?? ""));
    return values.every(Boolean) && new Set(values).size === values.length;
  });
}

function reportLocatorIdentity(path: string, records: ParsedRecord[], diagnostics: Diagnostic[]): void {
  const unstable = records.find((record) => record.identityConfidence === "locator");
  if (!unstable) return;
  diagnostics.push({
    code: "unstable-record-identity",
    severity: "warning",
    message: "No unique source value identifies these records; source locators may change when surrounding content moves",
    document: path,
    ...(unstable.locations[0] ? { range: unstable.locations[0].region } : {}),
  });
}

function location(path: string, regionNode: any, recordNode: any, fields: Record<string, SourceRange>, adapter: SourceLocation["adapter"]): SourceLocation {
  return { document: path, region: range(regionNode), record: range(recordNode), fields, adapter };
}

function plainText(node: any, content: string): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child: any) => plainText(child, content)).join("");
}

function sourceText(node: any, content: string): string {
  return content.slice(node.position.start.offset, node.position.end.offset);
}

function range(node: any): SourceRange {
  return { start: node.position.start.offset, end: node.position.end.offset, line: node.position.start.line, column: node.position.start.column };
}

function offsetRange(content: string, start: number, end: number): SourceRange {
  const prefix = content.slice(0, start);
  const lines = prefix.split("\n");
  return { start, end, line: lines.length, column: lines.at(-1)!.length + 1 };
}

function tableCellRange(cell: any, content: string): SourceRange {
  let { start, end } = range(cell);
  const raw = content.slice(start, end);
  const leadingPipe = raw.startsWith("|") ? 1 : 0;
  const trailingPipe = raw.endsWith("|") ? 1 : 0;
  start += leadingPipe;
  end -= trailingPipe;
  while (start < end && /[ \t]/.test(content[start]!)) start++;
  while (end > start && /[ \t]/.test(content[end - 1]!)) end--;
  return offsetRange(content, start, end);
}

function itemTextRange(item: any, content: string): SourceRange {
  const paragraph = item.children?.find((child: any) => child.type === "paragraph") ?? item;
  const raw = sourceText(paragraph, content);
  const prefix = /^\[[ xX]\]\s*/.exec(raw)?.[0].length ?? 0;
  return offsetRange(content, paragraph.position.start.offset + prefix, paragraph.position.end.offset);
}

function checkboxRange(item: any, content: string): SourceRange {
  const start = content.indexOf("[", item.position.start.offset);
  return offsetRange(content, start + 1, start + 2);
}

function locatorId(path: string, region: number, record: number): string {
  return `loc_${createHash("sha1").update(`${path}:${region}:${record}`).digest("hex").slice(0, 12)}`;
}

function inferredId(path: string, headings: string[], kind: string, occurrence: number): string {
  const slug = [...headings, kind].join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalize(path)}#${slug || kind}-${occurrence}`;
}

function stripHeading(candidate: ParsedCollection & { headingPath: string[] }): ParsedCollection {
  const { headingPath: _, ...collection } = candidate;
  return collection;
}

function normalize(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

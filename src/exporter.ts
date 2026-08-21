import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import type { MndmapConfig, ExportPatch, FieldValue, SourceLocation, SourceRange } from "./types.js";
import { revision, parseWorkspace } from "./parser.js";
import { LedgerState } from "./state.js";

interface Edit { start: number; end: number; text: string }

export class Exporter {
  constructor(private readonly root: string, private readonly state: LedgerState, private readonly config: MndmapConfig) {}

  async preview(options: { forceClaims?: boolean } = {}): Promise<ExportPatch[]> {
    if (!options.forceClaims && this.state.activeClaims() > 0) throw new Error("Export refused while active claims exist");
    if (this.state.pendingHistory().length === 0) return [];

    const documents = new Map<string, any>(this.state.sourceDocuments().map((document) => [document.path, document]));
    const edits = new Map<string, Edit[]>();
    const collections = new Map(this.state.listCollections().map((collection) => [collection.id, collection]));
    const changedFields = new Map<string, Set<string>>();
    for (const change of this.state.pendingHistory()) {
      for (const operation of change.operations) {
        if (operation.type !== "update") continue;
        const key = recordKey(operation.collectionId, operation.recordId);
        const fields = changedFields.get(key) ?? new Set<string>();
        for (const field of Object.keys(operation.values)) fields.add(field);
        changedFields.set(key, fields);
      }
    }
    const allRecords = this.state.rawRecords();
    for (const row of allRecords) {
      const values = JSON.parse(row.values_json) as Record<string, FieldValue>;
      const locations = JSON.parse(row.locations) as SourceLocation[];
      if (row.deleted) {
        for (const location of locations) addEdit(edits, location.document, deleteRange(documents.get(location.document).content, location.record), "");
        continue;
      }
      if (locations.length === 0) {
        const collection = collections.get(row.collection_id);
        if (!collection?.capabilities.create) throw new Error(`Record ${row.id} cannot be represented by its adapter`);
        const region = collection.sourceRegions[0];
        if (!region) throw new Error(`Collection ${row.collection_id} has no writable source region`);
        const document = documents.get(region.document);
        const exemplar = allRecords.find((candidate) => candidate.collection_id === row.collection_id && JSON.parse(candidate.locations).length);
        const adapter = exemplar ? (JSON.parse(exemplar.locations)[0] as SourceLocation).adapter : "table";
        const text = adapter === "table"
          ? renderTableRow(collection.fields.map((field: any) => values[field.id]))
          : renderListItem(this.config.collections[row.collection_id]?.createTemplate, values);
        const insertion = regionInsertion(document.content, region.range, text);
        addEdit(edits, region.document, { start: insertion.position, end: insertion.position }, insertion.text);
        continue;
      }
      for (const location of locations) {
        for (const field of changedFields.get(recordKey(row.collection_id, row.id)) ?? []) {
          const value = values[field];
          const target = location.fields[field];
          if (!target || value === undefined) continue;
          let text = renderValue(value, location.adapter, field);
          if (location.adapter === "frontmatter" && text.includes("\n")) {
            text = text.replaceAll("\n", `\n${" ".repeat(Math.max(0, target.column - 1))}`);
          }
          if (documents.get(location.document).content.slice(target.start, target.end) !== text) addEdit(edits, location.document, target, text);
        }
      }
    }
    for (const [collectionId, collection] of collections) {
      const records = allRecords
        .filter((row) => row.collection_id === collectionId && !row.deleted)
        .sort((left, right) => left.source_order - right.source_order || left.id.localeCompare(right.id));
      for (const region of collection.sourceRegions.filter((candidate: any) => candidate.generated)) {
        const generated = region.generated as { template: string; framed?: boolean };
        const lines = records.map((row) => renderTemplate(generated.template, JSON.parse(row.values_json)));
        const text = generated.framed ? `\n${lines.join("\n")}${lines.length ? "\n" : ""}` : `${lines.join("\n")}${lines.length ? "\n" : ""}`;
        addEdit(edits, region.document, region.range, text);
      }
    }

    const patches: ExportPatch[] = [];
    for (const [path, fileEdits] of edits) {
      const baseline = documents.get(path);
      const disk = await readSource(resolve(this.root, path));
      if (revision(disk) !== baseline.revision) throw new Error(`Export conflict: ${path} changed since import`);
      const ordered = fileEdits.sort((a, b) => b.start - a.start || b.end - a.end);
      for (let i = 1; i < ordered.length; i++) if (ordered[i - 1]!.start < ordered[i]!.end) throw new Error(`Overlapping source edits in ${path}`);
      let after = baseline.content;
      for (const edit of ordered) after = after.slice(0, edit.start) + edit.text + after.slice(edit.end);
      if (after !== baseline.content) patches.push({ document: path, beforeRevision: baseline.revision, before: baseline.content, after });
    }
    return patches;
  }

  async apply(options: { forceClaims?: boolean } = {}): Promise<ExportPatch[]> {
    const patches = await this.preview(options);
    if (patches.length === 0) {
      if (this.state.pendingHistory().length) this.state.completeExport([]);
      return [];
    }
    const stateDir = join(this.root, ".mndmap");
    const stageDir = join(stateDir, `export-${Date.now()}`);
    await mkdir(stageDir, { recursive: true });
    const journalPath = join(stateDir, "export-journal.json");
    const entries = patches.map((patch, index) => ({
      target: resolve(this.root, patch.document),
      staged: join(stageDir, `${index}.new`),
      backup: join(stageDir, `${index}.bak`),
      revision: patch.beforeRevision,
      existed: false,
    }));
    await writeFile(journalPath, JSON.stringify({ status: "staged", entries }, null, 2));
    try {
      for (let index = 0; index < patches.length; index++) {
        const entry = entries[index]!;
        const current = await readSource(entry.target);
        if (revision(current) !== entry.revision) throw new Error(`Export conflict: ${patches[index]!.document} changed while staging`);
        entry.existed = await sourceExists(entry.target);
        await mkdir(dirname(entry.target), { recursive: true });
        if (entry.existed) await copyFile(entry.target, entry.backup);
        await writeFile(entry.staged, patches[index]!.after);
      }
      await writeFile(journalPath, JSON.stringify({ status: "replacing", entries }, null, 2));
      for (const entry of entries) await rename(entry.staged, entry.target);
      const parsed = await parseWorkspace(this.root, this.config);
      this.state.importDocuments(parsed, this.config, {
        afterExport: true,
        forceClaims: Boolean(options.forceClaims),
      });
      await rm(journalPath, { force: true });
      await rm(stageDir, { recursive: true, force: true });
      return patches;
    } catch (error) {
      for (const entry of entries) {
        try {
          if (entry.existed) await copyFile(entry.backup, entry.target);
          else await rm(entry.target, { force: true });
        } catch {}
      }
      await writeFile(journalPath, JSON.stringify({ status: "rolled-back", entries }, null, 2));
      throw error;
    }
  }
}

function addEdit(map: Map<string, Edit[]>, document: string, range: Pick<SourceRange, "start" | "end">, text: string): void {
  const entries = map.get(document) ?? [];
  entries.push({ start: range.start, end: range.end, text });
  map.set(document, entries);
}

function renderValue(value: FieldValue, adapter: SourceLocation["adapter"], field: string): string {
  if (adapter === "task-list" && field === "$checked") return value ? "x" : " ";
  if (adapter === "frontmatter") return YAML.stringify(value).trimEnd();
  if (typeof value !== "string") throw new Error(`Field ${field} cannot be represented as Markdown`);
  if (adapter === "table" && /[|\r\n]/.test(value)) throw new Error(`Table field ${field} contains unsupported pipe or newline`);
  if ((adapter === "task-list" || adapter === "plain-list") && field === "$text" && /\r?\n/.test(value)) throw new Error("List text cannot contain newlines");
  return value;
}

function renderTableRow(values: FieldValue[]): string {
  return `| ${values.map((value) => {
    if (typeof value !== "string" || /[|\r\n]/.test(value)) throw new Error("New table rows require single-line Markdown string values");
    return value;
  }).join(" | ")} |`;
}

function regionInsertion(content: string, region: SourceRange, row: string): { position: number; text: string } {
  const lineEnd = content.indexOf("\n", region.end);
  if (lineEnd === -1) return { position: region.end, text: `\n${row}` };
  return { position: lineEnd + 1, text: `${row}\n` };
}

function renderListItem(template: string | undefined, values: Record<string, FieldValue>): string {
  if (!template) throw new Error("Creating list records requires a configured creation template");
  return renderTemplate(template, values);
}

function renderTemplate(template: string, values: Record<string, FieldValue>): string {
  const rendered = template.replace(/\{\{([A-Za-z0-9_$-]+)\}\}/g, (_, field: string) => {
    const value = values[field];
    if (typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number") throw new Error(`Template field ${field} is missing or cannot be rendered`);
    return String(value);
  });
  if (/\{\{[^}]+\}\}/.test(rendered)) throw new Error("Creation template contains unresolved fields");
  return rendered;
}

async function readSource(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); }
  catch (error: any) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function sourceExists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch (error: any) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function deleteRange(content: string, range: SourceRange): SourceRange {
  let start = range.start;
  let end = range.end;
  if (content[end] === "\r" && content[end + 1] === "\n") end += 2;
  else if (content[end] === "\n") end += 1;
  else if (start > 0 && content[start - 1] === "\n") start -= 1;
  return { ...range, start, end };
}

function recordKey(collectionId: string, recordId: string): string {
  return `${collectionId}\0${recordId}`;
}

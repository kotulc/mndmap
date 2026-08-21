import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import type { CollectionConfig, MndmapConfig, ScratchFieldConfig } from "./types.js";

const defaults: MndmapConfig = {
  version: 1,
  sources: { include: ["**/*.md", "**/*.mdx"], exclude: [".mndmap/**", "node_modules/**"] },
  collections: {},
  claims: { defaultLeaseSeconds: 900 },
  scratchFields: [{ id: "open_field", alias: "open_field" }],
};

export async function loadConfig(root: string, file = "mndmap.yaml"): Promise<MndmapConfig> {
  let raw: any = {};
  try {
    raw = YAML.parse(await readFile(join(root, file), "utf8")) ?? {};
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (raw.version !== undefined && raw.version !== 1) throw new Error("Unsupported mndmap.yaml version");

  const defaultScratch = raw.scratch_fields?.default;
  const additional = raw.scratch_fields?.additional ?? [];
  const scratchFields: ScratchFieldConfig[] = [
    { id: "open_field", alias: defaultScratch?.alias ?? "open_field" },
    ...additional.map((entry: any) => ({ id: requiredString(entry.id, "scratch field id"), alias: requiredString(entry.alias, "scratch field alias") })),
  ];
  for (let index = 0; index < scratchFields.length; index++) {
    const field = scratchFields[index]!;
    for (const other of scratchFields.slice(index + 1)) {
      if (field.id === other.id || field.id === other.alias || field.alias === other.id || field.alias === other.alias) {
        throw new Error("Scratch field IDs and aliases must not collide");
      }
    }
  }

  const collections: Record<string, CollectionConfig> = {};
  for (const [id, value] of Object.entries<any>(raw.collections ?? {})) {
    if (!Array.isArray(value.sources) || value.sources.length === 0) throw new Error(`Collection ${id} requires sources`);
    collections[id] = {
      sources: value.sources.map((source: any) => ({
        document: requiredString(source.document, `${id} source document`),
        select: {
          kind: selectorKind(source.select?.kind, id),
          ...(source.select?.under ? { under: source.select.under } : {}),
          ...(source.select?.headers ? { headers: source.select.headers } : {}),
          ...(source.select?.occurrence ? { occurrence: source.select.occurrence } : {}),
        },
        ...(source.record_id ? { recordId: requiredString(source.record_id, `${id} record_id`) } : {}),
        ...(source.key ? { key: source.key } : {}),
        ...(source.fields ? { fields: source.fields } : {}),
      })),
      ...(value.order ? { order: value.order } : {}),
      ...(value.writable_fields ? { writableFields: value.writable_fields } : {}),
      ...(value.create_template ? { createTemplate: value.create_template } : {}),
      ...(value.generated ? {
        generated: value.generated.map((generated: any) => ({
          document: requiredString(generated.document, `${id} generated document`),
          template: requiredString(generated.template, `${id} generated template`),
          ...(generated.between ? { between: generated.between } : {}),
        })),
      } : {}),
    };
  }

  return {
    version: 1,
    sources: {
      include: normalizeGlobs(raw.sources?.include, defaults.sources.include),
      exclude: normalizeGlobs(raw.sources?.exclude, defaults.sources.exclude),
    },
    collections,
    claims: { defaultLeaseSeconds: raw.claims?.default_lease_seconds ?? defaults.claims.defaultLeaseSeconds },
    scratchFields,
  };
}

function normalizeGlobs(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function selectorKind(value: unknown, collection: string): "table" | "list" | "section" | "frontmatter" {
  if (value === "table" || value === "list" || value === "section" || value === "frontmatter") return value;
  throw new Error(`Collection ${collection} requires a valid selector kind`);
}

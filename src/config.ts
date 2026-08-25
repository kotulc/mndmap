import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import type { MndmapConfig, SelectorConfig } from "./types.js";

const LEDGER_KEYS = [
  "collections", "claims", "scratch_fields", "writable_fields", "create_template", "generated",
];

const defaults: MndmapConfig = {
  version: 1,
  sources: { include: ["docs/**/*.{md,mdx}"], exclude: [] },
  destination: "site",
  diagrams: { depth: 3 },
  selectors: [],
};

export async function loadConfig(root: string, file = "mndmap.yaml"): Promise<MndmapConfig> {
  let raw: any = {};
  try {
    raw = YAML.parse(await readFile(join(root, file), "utf8")) ?? {};
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (raw.version !== undefined && raw.version !== 1) {
    throw new Error("Unsupported mndmap.yaml version");
  }
  for (const key of LEDGER_KEYS) {
    if (raw[key] !== undefined) {
      throw new Error(`Ledger-era configuration key '${key}' is no longer supported; see archive.md`);
    }
  }
  for (const key of Object.keys(raw)) {
    if (!["version", "sources", "destination", "diagrams", "selectors"].includes(key)) {
      throw new Error(`Unknown configuration key '${key}'`);
    }
  }

  const include = normalizeGlobs(raw.sources?.include, defaults.sources.include);
  const exclude = normalizeGlobs(raw.sources?.exclude, defaults.sources.exclude);
  const builtInExclude = [".mndmap/**", "site/**", defaults.destination.replace(/\/$/, "") + "/**"];
  const mergedExclude = [...new Set([...exclude, ...builtInExclude])];

  const destination = typeof raw.destination === "string" && raw.destination
    ? raw.destination.replace(/\\/g, "/").replace(/\/$/, "")
    : defaults.destination;

  for (const pattern of [...include, ...mergedExclude]) {
    if (pattern.startsWith(destination) || pattern.startsWith(`.mndmap`)) continue;
  }

  const selectors: SelectorConfig[] = (raw.selectors ?? []).map((entry: any, index: number) => ({
    document: requiredString(entry.document, `selectors[${index}].document`),
    match: {
      kind: selectorKind(entry.match?.kind, index),
      ...(entry.match?.under ? { under: entry.match.under.map(String) } : {}),
      ...(entry.match?.headers ? { headers: entry.match.headers.map(String) } : {}),
      ...(entry.match?.occurrence ? { occurrence: Number(entry.match.occurrence) } : {}),
    },
    ...(entry.identity ? { identity: entry.identity } : {}),
    ...(entry.fields ? { fields: entry.fields } : {}),
  }));

  return {
    version: 1,
    sources: { include, exclude: mergedExclude },
    destination,
    diagrams: { depth: raw.diagrams?.depth ?? defaults.diagrams.depth },
    selectors,
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

function selectorKind(value: unknown, index: number): SelectorConfig["match"]["kind"] {
  if (value === "table" || value === "list" || value === "section" || value === "frontmatter") return value;
  throw new Error(`selectors[${index}] requires a valid match.kind`);
}

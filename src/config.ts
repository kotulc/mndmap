import { access } from "node:fs/promises";
import { join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import type { MndmapConfig, SelectorConfig } from "./types.js";

const LEDGER_KEYS = [
  "collections", "claims", "scratch_fields", "writable_fields", "create_template", "generated",
];

const DEFAULT_SOURCE_ROOT = "docs";
const DEFAULT_INCLUDE = ["**/*.{md,mdx}"];

const defaults: MndmapConfig = {
  version: 1,
  source: { root: DEFAULT_SOURCE_ROOT, include: DEFAULT_INCLUDE, exclude: [] },
  destination: "site",
  diagrams: { enabled: true, depth: 3 },
  selectors: [],
};

export async function loadConfig(root: string, file = "mndmap.yaml"): Promise<MndmapConfig> {
  let raw: Record<string, unknown> = {};
  try {
    raw = YAML.parse(await readFile(join(root, file), "utf8")) ?? {};
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw error;
  }
  if (raw.version !== undefined && raw.version !== 1) {
    throw new Error("Unsupported mndmap.yaml version");
  }
  for (const key of LEDGER_KEYS) {
    if (raw[key] !== undefined) {
      throw new Error(`Ledger-era configuration key '${key}' is no longer supported; see archive.md`);
    }
  }

  const allowedKeys = ["version", "source", "sources", "destination", "diagrams", "mdsite", "selectors"];
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Unknown configuration key '${key}'`);
    }
  }

  const destination = typeof raw.destination === "string" && raw.destination
    ? raw.destination.replace(/\\/g, "/").replace(/\/$/, "")
    : defaults.destination;
  if (!destination || destination === "." || destination.startsWith("../") || destination.startsWith("/")) {
    throw new Error("destination must be a workspace-relative directory");
  }

  const sourceRoot = resolveSourceRoot(raw);
  if (!sourceRoot || sourceRoot === "." || sourceRoot.startsWith("../") || sourceRoot.startsWith("/")) {
    throw new Error("source.root must be a workspace-relative directory");
  }
  if (sourceRoot === destination || sourceRoot.startsWith(`${destination}/`) || destination.startsWith(`${sourceRoot}/`)) {
    throw new Error(`source.root '${sourceRoot}' overlaps destination '${destination}'`);
  }

  try {
    await access(join(root, sourceRoot));
  } catch {
    throw new Error(`Missing source root directory: ${sourceRoot}`);
  }

  const sourceRaw = raw.source && typeof raw.source === "object" && !Array.isArray(raw.source)
    ? raw.source as Record<string, unknown>
    : undefined;
  const include = normalizeGlobs(sourceRaw?.include ?? legacyInclude(raw), DEFAULT_INCLUDE);
  const exclude = normalizeGlobs(sourceRaw?.exclude ?? legacyExclude(raw), []);
  const builtInExclude = [".mndmap/**", `${destination}/**`];
  const mergedExclude = [...new Set([...exclude, ...builtInExclude])];

  for (const pattern of include) {
    const patternRoot = pattern.split(/[*?[{]/, 1)[0]!.replace(/\/$/, "");
    if (!patternRoot) continue;
    const absolutePatternRoot = join(sourceRoot, patternRoot).replace(/\\/g, "/");
    if (
      absolutePatternRoot === destination
      || absolutePatternRoot.startsWith(`${destination}/`)
      || destination.startsWith(`${absolutePatternRoot}/`)
    ) {
      throw new Error(`Source pattern '${pattern}' overlaps destination '${destination}'`);
    }
  }

  const selectors: SelectorConfig[] = Array.isArray(raw.selectors)
    ? (raw.selectors as Record<string, unknown>[]).map((entry, index) => {
    const match = entry.match as Record<string, unknown> | undefined;
    const selector: SelectorConfig = {
      document: requiredString(entry.document, `selectors[${index}].document`),
      match: {
        kind: selectorKind(match?.kind, index),
        ...(match?.under ? { under: (match.under as unknown[]).map(String) } : {}),
        ...(match?.headers ? { headers: (match.headers as unknown[]).map(String) } : {}),
        ...(match?.occurrence ? { occurrence: Number(match.occurrence) } : {}),
      },
    };
    if (entry.identity && typeof entry.identity === "object") {
      selector.identity = entry.identity as { field: string };
    }
    if (entry.fields && typeof entry.fields === "object") {
      selector.fields = entry.fields as SelectorConfig["fields"] & Record<string, { column?: string; label?: string; frontmatter?: string; section?: "body"; text?: boolean }>;
    }
    return selector;
  })
    : [];

  const mdsite = raw.mdsite && typeof raw.mdsite === "object" && !Array.isArray(raw.mdsite)
    ? {
        ...(typeof (raw.mdsite as Record<string, unknown>).config === "string"
          ? { config: String((raw.mdsite as Record<string, unknown>).config) }
          : {}),
      }
    : undefined;

  const diagramsRaw = raw.diagrams as Record<string, unknown> | undefined;
  const diagrams = {
    enabled: diagramsRaw?.enabled === undefined ? defaults.diagrams.enabled : Boolean(diagramsRaw.enabled),
    depth: typeof diagramsRaw?.depth === "number" ? diagramsRaw.depth : defaults.diagrams.depth,
  };

  return {
    version: 1,
    source: { root: sourceRoot, include, exclude: mergedExclude },
    destination,
    diagrams,
    ...(mdsite ? { mdsite } : {}),
    selectors,
  };
}

/** Glob patterns relative to source.root for discovery. */
export function sourceIncludePatterns(config: MndmapConfig): string[] {
  const root = config.source.root.replace(/\/$/, "");
  return config.source.include.map((pattern) => join(root, pattern).replace(/\\/g, "/"));
}

/** Document path relative to workspace root. */
export function documentWorkspacePath(config: MndmapConfig, sourceRelativePath: string): string {
  const root = config.source.root.replace(/\/$/, "");
  return join(root, sourceRelativePath).replace(/\\/g, "/");
}

/** Path relative to source.root. */
export function sourceRelativePath(config: MndmapConfig, workspacePath: string): string {
  const root = config.source.root.replace(/\/$/, "");
  const rel = relative(root, workspacePath).replace(/\\/g, "/");
  if (rel.startsWith("..")) throw new Error(`Path '${workspacePath}' is outside source.root '${root}'`);
  return rel;
}

function resolveSourceRoot(raw: Record<string, unknown>): string {
  if (raw.source && typeof raw.source === "object" && !Array.isArray(raw.source)) {
    const root = (raw.source as Record<string, unknown>).root;
    if (typeof root === "string" && root.trim()) {
      return root.replace(/\\/g, "/").replace(/\/$/, "");
    }
  }
  if (raw.sources && typeof raw.sources === "object" && !Array.isArray(raw.sources)) {
    const include = (raw.sources as Record<string, unknown>).include;
    if (include !== undefined) {
      const patterns = normalizeGlobs(include, DEFAULT_INCLUDE);
      const first = patterns[0]?.split(/[*?[{]/, 1)[0]?.replace(/\/$/, "") ?? DEFAULT_SOURCE_ROOT;
      return first.includes("/") ? first.split("/")[0]! : first || DEFAULT_SOURCE_ROOT;
    }
  }
  return DEFAULT_SOURCE_ROOT;
}

function legacyInclude(raw: Record<string, unknown>): string[] | undefined {
  if (!raw.sources || typeof raw.sources !== "object" || Array.isArray(raw.sources)) return undefined;
  const include = (raw.sources as Record<string, unknown>).include;
  if (include === undefined) return undefined;
  const patterns = normalizeGlobs(include, DEFAULT_INCLUDE);
  const root = resolveSourceRoot(raw);
  return patterns.map((pattern) => {
    if (pattern.startsWith(`${root}/`)) return pattern.slice(root.length + 1);
    return pattern;
  });
}

function legacyExclude(raw: Record<string, unknown>): string[] | undefined {
  if (!raw.sources || typeof raw.sources !== "object" || Array.isArray(raw.sources)) return undefined;
  const exclude = (raw.sources as Record<string, unknown>).exclude;
  if (exclude === undefined) return undefined;
  const patterns = normalizeGlobs(exclude, []);
  const root = resolveSourceRoot(raw);
  return patterns.map((pattern) => {
    if (pattern.startsWith(`${root}/`)) return pattern.slice(root.length + 1);
    return pattern;
  });
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

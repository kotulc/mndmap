/** The `mndmap.yaml` reader, and the default map.
 *
 *  A map is a closed set of choices, so reading one is checking each value
 *  against its list. Anything unrecognised is a refusal rather than a
 *  silently ignored key. */

import YAML from "yaml";
import type { Config, DocMap, MapOverride, NameSource } from "./types.js";


export const DEFAULT_MAP: DocMap = {
  folder: { as: "doc.set" },
  page: { as: "doc.page", name: ["title", "heading", "filename"] },
  section: { as: "doc.section", depth: 3, beyond: "body" },
  prose: "body",
  frontmatter: { as: "fields", tags: "tags", related: "relation" },
  link: { as: "relation", type: "doc.link", external: "body" },
  table: { as: "grid", header: "row", type: "doc.row", key: "" },
  list: { as: "body" },
  task: { as: "body" },
  fence: { as: "body" },
  image: "body",
};

export const DEFAULT_CONFIG: Config = {
  version: 2,
  source: { root: "docs", include: ["**/*.{md,mdx}"], exclude: [] },
  destination: "site",
  suggest: { taggly: null, count: 3 },
  map: DEFAULT_MAP,
  overrides: [],
};

const KEYS = ["version", "source", "destination", "publish", "suggest", "map", "overrides"];
const NAME_SOURCES: NameSource[] = ["title", "heading", "filename"];


/** A config from YAML text. Absent text is the defaults. */
export function read_config(text?: string): Config {
  const raw = (text ? YAML.parse(text) : null) ?? {};
  if (!is_record(raw)) throw new Error("mndmap.yaml must be a mapping");
  if (raw.version !== undefined && raw.version !== 2) {
    throw new Error("Unsupported mndmap.yaml version; this build reads version 2");
  }
  for (const key of Object.keys(raw)) {
    if (!KEYS.includes(key)) throw new Error(`Unknown configuration key '${key}'`);
  }

  const source = record(raw.source);
  const root = path_value(source.root, "docs", "source.root");
  const destination = path_value(raw.destination, "destination", "destination");
  if (root === destination || root.startsWith(`${destination}/`) || destination.startsWith(`${root}/`)) {
    throw new Error(`source.root '${root}' overlaps destination '${destination}'`);
  }

  const publish = record(raw.publish);
  const suggest = record(raw.suggest);

  return {
    version: 2,
    source: {
      root,
      include: globs(source.include, ["**/*.{md,mdx}"]),
      exclude: globs(source.exclude, []),
    },
    destination,
    ...(typeof publish.mdsite === "string" ? { publish: { mdsite: publish.mdsite } } : {}),
    suggest: {
      taggly: typeof suggest.taggly === "string" ? suggest.taggly : null,
      count: typeof suggest.count === "number" ? suggest.count : 3,
    },
    map: read_map(record(raw.map), DEFAULT_MAP),
    overrides: read_overrides(raw.overrides),
  };
}

/** The map in force under a heading path: the base map, with every override
 *  whose `under` is a prefix of the path folded over it in order. */
export function map_at(config: Config, headings: string[]): DocMap {
  let map = config.map;
  for (const override of config.overrides) {
    if (!is_prefix(override.under, headings)) continue;
    map = read_map(override.map as Record<string, unknown>, map);
  }
  return map;
}


/** Each construct's target, checked against its own closed set. A partial
 *  raw map leaves the rest of `base` alone, which is what an override is. */
function read_map(raw: Record<string, unknown>, base: DocMap): DocMap {
  const section = record(raw.section);
  const frontmatter = record(raw.frontmatter);
  const link = record(raw.link);
  const table = record(raw.table);

  return {
    folder: { as: "doc.set" },
    page: {
      as: "doc.page",
      name: names(record(raw.page).name) ?? base.page.name,
    },
    section: {
      as: "doc.section",
      depth: typeof section.depth === "number" ? section.depth : base.section.depth,
      beyond: choice(section.beyond, ["body", "block"], base.section.beyond, "section.beyond"),
    },
    prose: "body",
    frontmatter: {
      as: "fields",
      tags: choice(frontmatter.tags, ["tags"], base.frontmatter.tags, "frontmatter.tags"),
      related: choice(frontmatter.related, ["relation"], base.frontmatter.related, "frontmatter.related"),
    },
    link: {
      as: choice(link.as, ["relation", "body"], base.link.as, "link.as"),
      type: typeof link.type === "string" ? link.type : base.link.type,
      external: choice(link.external, ["relation", "body"], base.link.external, "link.external"),
    },
    table: {
      as: choice(table.as, ["grid", "body", "rows"], base.table.as, "table.as"),
      header: choice(table.header, ["row"], base.table.header, "table.header"),
      type: typeof table.type === "string" ? table.type : base.table.type,
      key: typeof table.key === "string" ? table.key : base.table.key,
    },
    list: { as: choice(record(raw.list).as, ["body", "group"], base.list.as, "list.as") },
    task: { as: choice(record(raw.task).as, ["body", "block"], base.task.as, "task.as") },
    fence: { as: choice(record(raw.fence).as, ["body", "block"], base.fence.as, "fence.as") },
    image: "body",
  };
}

function read_overrides(raw: unknown): MapOverride[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("overrides must be a list");
  return raw.map((entry, index) => {
    const item = record(entry);
    if (!Array.isArray(item.under)) throw new Error(`overrides[${index}].under must be a heading path`);
    return { under: item.under.map(String), map: record(item.map) as Partial<DocMap> };
  });
}

function choice<T extends string>(value: unknown, allowed: T[], fallback: T, label: string): T {
  if (value === undefined) return fallback;
  if (typeof value === "string" && (allowed as string[]).includes(value)) return value as T;
  throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
}

function names(value: unknown): NameSource[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("page.name must be a list");
  return value.map((entry) => {
    if (!NAME_SOURCES.includes(entry as NameSource)) throw new Error(`Unknown page.name source '${entry}'`);
    return entry as NameSource;
  });
}

function globs(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function path_value(value: unknown, fallback: string, label: string): string {
  const raw = typeof value === "string" && value.trim() ? value : fallback;
  const path = raw.replaceAll("\\", "/").replace(/\/+$/, "");
  if (!path || path === "." || path.startsWith("/") || path.startsWith("../")) {
    throw new Error(`${label} must be a workspace-relative directory`);
  }
  return path;
}

function is_prefix(under: string[], headings: string[]): boolean {
  return under.every((name, index) => headings[index] === name);
}

function is_record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return is_record(value) ? value : {};
}

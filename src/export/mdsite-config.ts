import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { slugifySegment } from "../routes.js";
import type { MndmapConfig, OrganizationNode, WorkingStoreSnapshot } from "../types.js";

const DEFAULT_MDSITE = {
  title: "Site",
  description: "",
  repo_url: "",
  content: ".",
  output: "./dist",
  nav_order: {},
  theme_toggle: "navbar",
  toc: true,
  theme: { color: "default", typeset: "sans", navbar: "", footer: "" },
};

export async function loadMdsiteTemplate(root: string, config: MndmapConfig): Promise<Record<string, unknown>> {
  const candidates: string[] = [];
  if (config.mdsite?.config) candidates.push(join(root, config.mdsite.config));
  candidates.push(join(root, "mdsite.yaml"));
  for (const candidate of candidates) {
    try {
      const parsed = YAML.parse(await readFile(candidate, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return structuredClone(parsed) as Record<string, unknown>;
      }
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw error;
    }
  }
  return structuredClone(DEFAULT_MDSITE);
}

/** Build nav_order maps from physical organization sibling positions. */
export function buildNavOrder(snapshot: WorkingStoreSnapshot): Record<string, string[]> {
  const childrenByParent = new Map<string | null, OrganizationNode[]>();
  for (const node of snapshot.organization.nodes) {
    const bucket = childrenByParent.get(node.parentId) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parentId, bucket);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((left, right) => left.position - right.position);
  }

  const isNavigable = (node: OrganizationNode): boolean =>
    node.kind === "group" || node.kind === "folder" || node.kind === "page";

  const navOrder: Record<string, string[]> = {};
  const walk = (parentId: string | null, routePrefix: string): void => {
    const children = (childrenByParent.get(parentId) ?? []).filter(isNavigable);
    if (children.length === 0) return;
    const slugs = children.map((node) => node.outputSlug ?? slugifySegment(node.title));
    navOrder[routePrefix] = slugs;
    for (const child of children) {
      const segment = child.outputSlug ?? slugifySegment(child.title);
      const childPrefix = routePrefix === "" ? segment : `${routePrefix}/${segment}`;
      walk(child.id, childPrefix);
    }
  };
  walk(snapshot.organization.rootId, "");
  return navOrder;
}

export function mergeMdsiteConfig(
  template: Record<string, unknown>,
  navOrder: Record<string, string[]>,
): Record<string, unknown> {
  const merged = structuredClone(template);
  merged.content = ".";
  merged.nav_order = navOrder;
  return merged;
}

export function serializeMdsiteConfig(config: Record<string, unknown>): string {
  return YAML.stringify(config).trimEnd() + "\n";
}

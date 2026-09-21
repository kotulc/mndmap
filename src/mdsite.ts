/** The mdsite handoff: one config file at the root of the collection.
 *
 *  Pure — a template comes in as data, because the browser has no disk. What
 *  mndmap owns is `content` and `nav_order`; everything else is the
 *  template's and is passed through. */

import YAML from "yaml";

const DEFAULT_MDSITE: Record<string, unknown> = {
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

export function default_mdsite(): Record<string, unknown> {
  return structuredClone(DEFAULT_MDSITE);
}

export function read_mdsite(text: string): Record<string, unknown> {
  const parsed = YAML.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : default_mdsite();
}

/** The template, with the two keys the collection decides. */
export function merge_mdsite(
  template: Record<string, unknown>,
  nav_order: Record<string, string[]>,
): Record<string, unknown> {
  return { ...structuredClone(template), content: ".", nav_order };
}

export function write_mdsite(config: Record<string, unknown>): string {
  return `${YAML.stringify(config).trimEnd()}\n`;
}

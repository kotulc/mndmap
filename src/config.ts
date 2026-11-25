/** Build settings: defaults, then `mndmap.yaml` (or `--config`), then command-line flags.
 *
 *  | Key | Default | Means |
 *  |---|---|---|
 *  | `content` | (required) | the markdown folder read |
 *  | `out` | `build` | where the site's copy, diagrams drawn, is written |
 *  | `mode` | `static` | `static`: inline SVG; `interactive`: a frame on the diagram's own page |
 *  | `urls` | `directory` | `directory` (`/a/b/`) or `html` (`/a/b.html`) |
 *  | `base` | none | an absolute base for links (`/mndsite`); none keeps them relative |
 *  | `assets` | `_assets/mndmap` | where diagram pages are written, under `out` |
 *  | `title` | home page's | the site's name on the map |
 *  | `dark` | `retro` | mndflow's dark ladder: `retro` or `modern` |
 *  | `strict` | `false` | fail the build on a link that names no page |
 *  | `exclude` | none | pages (paths or folders under `content`) left off the map and out of links |
 *  | `map` | 800 × 520 | the size a sitemap is laid out at |
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { load as yaml } from "js-yaml";
import type { Urls } from "./links.js";
import type { Dark } from "./render/theme.js";


/** How a diagram is placed in its page. */
export type Mode = "static" | "interactive";

/** Everything a build reads. */
export type Config = {
  content: string; out: string; mode: Mode; urls: Urls; assets: string; title?: string;
  dark: Dark; strict: boolean; exclude: string[]; map: { width: number; height: number };
};

/** Settings as written, in a file or as flags. */
type Written = Partial<{
  content: string; out: string; mode: string; urls: string; base: string; assets: string;
  title: string; dark: string; strict: boolean; exclude: string[]; map: { width?: number; height?: number };
}>;


/** The settings for a build: the file's under the flags', paths from where each was written. */
export function config(flags: Written & { config?: string }): Config {
  const path = resolve(flags.config ?? "mndmap.yaml");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const file = (text.trim() ? yaml(text) ?? {} : {}) as Written;
  if (flags.config && !existsSync(path)) throw new Error(`no config file at ${path}`);
  const from = (key: "content" | "out", fallback?: string) => {
    if (flags[key]) return resolve(flags[key]!);
    if (file[key]) return resolve(dirname(path), file[key]!);
    return fallback && resolve(fallback);
  };

  const pick = <T extends string>(key: keyof Written, allowed: readonly T[], fallback: T): T => {
    const value = String(flags[key] ?? file[key] ?? fallback) as T;
    if (!allowed.includes(value)) throw new Error(`${key} must be one of ${allowed.join(", ")}, not "${value}"`);
    return value;
  };

  const content = from("content");
  if (!content) throw new Error("no content folder: pass one, or set `content` in mndmap.yaml");
  const base = flags.base ?? file.base;
  const title = flags.title ?? file.title;
  return {
    content, out: from("out", "build")!,
    mode: pick("mode", ["static", "interactive"] as const, "static"),
    urls: { style: pick("urls", ["directory", "html"] as const, "directory"), ...(base ? { base } : {}) },
    assets: (flags.assets ?? file.assets ?? "_assets/mndmap").replace(/^\/|\/$/g, ""),
    ...(title ? { title } : {}),
    dark: pick("dark", ["retro", "modern"] as const, "retro"),
    strict: Boolean(flags.strict ?? file.strict ?? false),
    exclude: [...(file.exclude ?? []), ...(flags.exclude ?? [])].map((p) => p.replace(/^\.?\/|\/$/g, "")),
    map: { width: file.map?.width ?? 800, height: file.map?.height ?? 520 },
  };
}

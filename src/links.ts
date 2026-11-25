/** References from diagrams to pages: the page a reference names, and the href to it from wherever
 *  the diagram is published. Hrefs are relative by default, so a site works under any base path. */

import { posix } from "node:path";
import type { Page, Site } from "./site.js";


/** How the site publishes a page url: `/a/b` as `/a/b/` (directory) or `/a/b.html` (html), and an
 *  optional absolute base that replaces relative hrefs. */
export type Urls = { style: "directory" | "html"; base?: string };

/** What a reference came to: a page (and section), an outside address, or nothing. */
export type Link =
  | { kind: "page"; ref: string; href: string; page: Page; hash?: string }
  | { kind: "external"; ref: string; href: string }
  | { kind: "broken"; ref: string; reason: string };


/** The page a reference names: by url, by source path, by the end of its url, or by its title. */
export function lookup(site: Site, ref: string): Page | undefined {
  const bare = ref.replace(/^(\.{0,2}\/)+/, "").replace(/\.mdx?$/i, "").replace(/(^|\/)(index|home)$/i, "")
    .replace(/\/$/, "");
  const url = `/${bare}`;
  const tails = site.pages.filter((p) => p.url.endsWith(url) && bare);
  return site.pages.find((p) => p.url === url)
    ?? site.pages.find((p) => p.path.replace(/\.mdx?$/i, "") === bare)
    ?? (tails.length === 1 ? tails[0] : undefined)
    ?? site.pages.find((p) => p.title.toLowerCase() === ref.trim().toLowerCase());
}

/** Where a page url is published: its directory or its html file. */
export function published(url: string, urls: Urls): string {
  if (urls.style === "html") return url === "/" ? "/index.html" : `${url}.html`;
  return url === "/" ? "/" : `${url}/`;
}

/** The href from the published file `from` to the published path `to`. */
export function href(from: string, to: string, urls: Urls): string {
  if (urls.base) return `${urls.base.replace(/\/$/, "")}${to}`;
  const dir = from.endsWith("/") ? from : `${posix.dirname(from)}/`;
  const rel = posix.relative(dir, to);
  return !rel ? "./" : to.endsWith("/") ? `${rel}/` : rel;
}

/** A reference resolved from the published file `from`: checked against the site's pages and, with
 *  a `#section`, against that page's headings. */
export function resolve(site: Site, ref: string, from: string, urls: Urls): Link {
  if (/^[a-z][a-z+.-]*:/i.test(ref)) return { kind: "external", ref, href: ref };
  const [path = "", hash] = ref.split("#");
  const page = path ? lookup(site, path) : undefined;
  if (!page) return { kind: "broken", ref, reason: `no page "${path}"` };
  if (hash && !page.sections.some((s) => s.id === hash)) {
    return { kind: "broken", ref, reason: `no section "#${hash}" in ${page.path}` };
  }
  const to = href(from, published(page.url, urls), urls);
  return { kind: "page", ref, page, hash, href: hash ? `${to}#${hash}` : to };
}

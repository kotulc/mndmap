/** A content folder read as the site it publishes to: every markdown page, its url, title, words and
 *  sections. Urls follow the folder tree as mndsite mirrors it: `a/b.md` is `/a/b`, and an `index`
 *  or `home` page is its folder's own page. */

import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, posix, relative, sep } from "node:path";
import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import { Lexer, type Token, type Tokens } from "marked";
import type { MapData } from "./render/treemap.js";


/** A heading, and the anchor the site gives it. */
export type Section = { name: string; id: string; depth: number };

/** One page: where it is read from and published to, and what it says. */
export type Page = {
  file: string; path: string; url: string; dir: string;
  title: string; desc: string; words: number; sections: Section[];
};

/** Every page, its folders' titles by path, and the site's own title. */
export type Site = { root: string; title: string; folders: Record<string, string>; pages: Page[] };

/** Folders that hold no pages: assets the site copies as they are. */
const SKIP = new Set(["_assets", "images", "node_modules"]);

/** Page names that stand for their folder. */
const INDEX = new Set(["index", "home"]);


/** Read every markdown page under `root`, but those `exclude` names (a page's path, or a folder's). */
export function scan(root: string, title?: string, exclude: string[] = []): Site {
  const kept = (path: string) => !exclude.some((x) => path === x || path.startsWith(`${x}/`));
  const pages = files(root).map((file) => read(root, file)).filter((p) => kept(p.path));
  const folders: Record<string, string> = {};
  for (const page of pages) {
    const parts = page.dir.split("/").filter(Boolean);
    parts.forEach((part, i) => { folders[`/${parts.slice(0, i + 1).join("/")}`] ??= named(part); });
  }
  for (const page of pages.filter((p) => p.url === p.dir)) folders[page.dir] = page.title;
  const home = pages.find((p) => p.url === "/");
  return { root, title: title ?? home?.title ?? named(basename(root)), folders, pages };
}

/** The site as the map draws it. */
export function mapped(site: Site): MapData {
  return {
    title: site.title, folders: site.folders,
    pages: site.pages.map((p) => ({
      url: p.url, dir: p.dir, title: p.title, desc: p.desc, words: p.words,
      sections: p.sections.filter((s) => s.depth === 2).map(({ name, id }) => ({ name, id })),
    })),
  };
}

/** Is this a markdown page the site publishes? */
export function is_page(file: string): boolean {
  return /\.mdx?$/i.test(file);
}


/** Every markdown file under `dir`, skipping asset folders and hidden ones. */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) return [];
    const at = join(dir, entry.name);
    return entry.isDirectory() ? files(at) : is_page(entry.name) ? [at] : [];
  }).sort();
}

/** A file or folder name as a title: `getting-started` → `Getting Started`. */
function named(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Inline markdown reduced to its words, as the site renders them: no emphasis marks, code ticks
 *  or link targets, but a word's own underscores kept (so a heading slugs as its anchor does). */
export function plain(text: string): string {
  return text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|\*|~~)(.+?)\1/g, "$2")
    .replace(/`/g, "").trim();
}

/** One page read: its url from its path, its title and sections from its text. */
function read(root: string, file: string): Page {
  const path = relative(root, file).split(sep).join("/");
  const slug = basename(path, extname(path));
  const folder = posix.dirname(path) === "." ? "" : posix.dirname(path);
  const dir = `/${folder}`;
  const url = INDEX.has(slug.toLowerCase()) ? dir : `/${folder ? `${folder}/` : ""}${slug}`;

  const { data, content } = matter(readFileSync(file, "utf8"));
  const tokens = new Lexer().lex(content);
  const slugger = new GithubSlugger();
  const heads = tokens.filter((t): t is Tokens.Heading => t.type === "heading");
  const sections = heads.map((t) => ({ name: plain(t.text), id: slugger.slug(plain(t.text)), depth: t.depth }));
  const first = tokens.find((t): t is Tokens.Paragraph => t.type === "paragraph");
  const prose = tokens.filter((t: Token) => t.type !== "code" && t.type !== "html").map((t) => t.raw);

  const fallback = named(url === dir ? posix.basename(folder) || "home" : slug);
  return {
    file, path, url, dir,
    title: String(data.title ?? sections.find((s) => s.depth === 1)?.name ?? fallback),
    desc: String(data.description ?? data.desc ?? (first ? plain(first.text) : "")).slice(0, 240),
    words: plain(prose.join(" ")).split(/\s+/).filter((w) => /\w/.test(w)).length,
    sections: sections.filter((s) => s.depth > 1),
  };
}

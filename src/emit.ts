/** One graph out, a collection of markdown in.
 *
 *  The emitter writes what the graph says and never looks at the source: a
 *  moved section takes its body with it because every path is computed from
 *  where the block sits now. Pure, so the same function runs under node and
 *  in the browser. */

import { at_cell, children, is_holder, type Block, type Graph, type Id } from "@mnd/kit";
import { field, CODE, DONE, IN_BODY, ITEM, LANG, LINK, PAGE, SECTION, SET, TIER_ROOT, type Holder } from "./doc.js";
import { fill, write_frontmatter } from "./metadata.js";
import { default_mdsite, merge_mdsite, write_mdsite } from "./mdsite.js";
import { KEY } from "./read.js";
import { anchor, base_of, dir_of, is_external, is_markdown, relative_to, resolve, route } from "./routes.js";
import type { Config, OutAsset, OutFile } from "./types.js";

export interface Emitted {
  files: OutFile[];
  assets: OutAsset[];
  faults: string[];
}

/** Where every emitted thing sits, worked out before anything is written. */
export interface Places {
  /** Block id to the file it is written into. */
  file: Map<Id, string>;
  /** Block id to the path segment prefix it contributes. */
  under: Map<Id, string>;
  /** Source path to the page block that came from it. */
  by_uri: Map<string, Id>;
}

/** What a body is rewritten by, carried down the walk rather than threaded
 *  through every signature. */
type Rewrite = (text: string, from: Id) => string;


export function emit(graph: Graph, _config: Config, template?: Record<string, unknown>): Emitted {
  const faults: string[] = [];
  const places = locate(graph);
  const assets = new Map<string, OutAsset>();
  const files: OutFile[] = [];

  for (const [id, path] of places.file) {
    const block = graph.blocks[id]!;
    const page = block.type === PAGE
      ? write_page(graph, block, path, places, assets, faults)
      : write_landing(graph, block, path, places);
    files.push({ path, text: page.text });
    for (const name of duplicates(page.anchors)) {
      faults.push(`${path}: two headings answer to '${name}'`);
    }
  }

  for (const name of duplicates(files.map((file) => file.path))) {
    faults.push(`two blocks would be written to ${name}`);
  }

  files.push({
    path: "mdsite.yaml",
    text: write_mdsite(merge_mdsite(template ?? default_mdsite(), nav_order(graph, places))),
  });

  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    assets: [...assets.values()].sort((left, right) => left.path.localeCompare(right.path)),
    faults,
  };
}


/** Every page and landing, and the path each is written to. A set gets a
 *  landing only where no page of its own already answers to that path. */
function locate(graph: Graph): Places {
  const places: Places = { file: new Map(), under: new Map(), by_uri: new Map() };

  const walk = (id: Id, prefix: string): void => {
    const block = graph.blocks[id]!;
    if (block.type === PAGE) {
      const uri = block.source;
      const name = uri ? base_of(uri) : `${segment(block)}.md`;
      const path = prefix ? `${prefix}/${name}` : name;
      places.file.set(id, path);
      places.under.set(id, path);
      if (uri) places.by_uri.set(uri, id);
      return;
    }
    const under = id === TIER_ROOT ? "" : prefix ? `${prefix}/${segment(block)}` : segment(block);
    places.under.set(id, under);
    for (const child of children(graph, id)) {
      if (child.type === SET || child.type === PAGE) walk(child.id, under);
    }
  };

  if (graph.blocks[TIER_ROOT]) walk(TIER_ROOT, "");

  /** A landing where the set has no `index` page of its own. */
  for (const [id, under] of places.under) {
    const block = graph.blocks[id];
    if (!block || block.type !== SET) continue;
    const landing = under ? `${under}/index.md` : "index.md";
    const supplied = children(graph, id).some((child) => places.file.get(child.id) === landing);
    if (!supplied) places.file.set(id, landing);
  }

  return places;
}

/** A set's directory segment. A page keeps its filename; a set is named by
 *  its name, so renaming a folder moves it and renaming a page never does. */
function segment(block: Block): string {
  const named = block.name?.trim();
  return named ? slugish(named) : block.source ? base_of(block.source) : block.id;
}

function slugish(value: string): string {
  return value.toLowerCase().trim().replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-") || "untitled";
}


/** A page: its front matter, its own prose, and everything under it. */
function write_page(
  graph: Graph,
  page: Block,
  path: string,
  places: Places,
  assets: Map<string, OutAsset>,
  faults: string[],
): { text: string; anchors: string[] } {
  const rewrite: Rewrite = (text, from) => rewrite_links(graph, text, from, path, places, assets, faults);
  const anchors: string[] = [];
  const parts: string[] = [];
  const own = rewrite(page.body ?? "", page.id);
  if (own) parts.push(own);
  parts.push(...contents(graph, page.id, 1, rewrite, anchors));

  const body = parts.filter(Boolean).join("\n\n");
  return { text: write_frontmatter(fill(front_matter(graph, page, places, path), body), body), anchors };
}

/** A landing for a set the source gave none: its name, and what it holds. */
function write_landing(graph: Graph, set: Block, path: string, places: Places): { text: string; anchors: string[] } {
  const name = set.name ?? base_of(dir_of(path)) ?? "Index";
  const links = children(graph, set.id)
    .filter((child) => places.file.has(child.id))
    .map((child) => `- [${child.name ?? child.id}](${route(places.file.get(child.id)!)})`);
  const body = [`# ${name}`, "", ...links].join("\n");
  return { text: write_frontmatter(fill({ title: name }, body), body), anchors: [anchor(name)] };
}


/** Everything drawn in a layer, in one order: blocks and the holders among
 *  them. A holder is not a block, so it sits in no tree and has to be put
 *  back beside the blocks it was read between. */
function units(graph: Graph, layer: Id): (Block | Holder)[] {
  const held = [
    ...children(graph, layer).filter((block) => !block.group),
    ...Object.values(graph.holders).filter((holder) => holder.parent === layer && !holder.group),
  ];
  return held.sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id));
}

/** A block's children, in order, each written the way its type says. */
function contents(graph: Graph, parent: Id, level: number, rewrite: Rewrite, anchors: string[]): string[] {
  const parts: string[] = [];
  /** Items in a row are one list and typed rows in a row are one table, so
   *  each run is one part: a blank line between two would end it. */
  let items: string[] = [];
  let rows: Block[] = [];
  const close = () => {
    if (items.length) { parts.push(items.join("\n")); items = []; }
    if (rows.length) { parts.push(typed_table(rows, rewrite)); rows = []; }
  };

  for (const unit of units(graph, parent)) {
    if (is_holder(graph, unit.id)) {
      const holder = unit as Holder;
      close();
      parts.push(holder.arrangement === "grid" ? table(graph, holder, rewrite) : list(graph, holder, rewrite));
      continue;
    }
    const block = unit as Block;
    if (block.type === SET || block.type === PAGE) continue;   // a file of its own

    if (field(block.fields, KEY) !== undefined) { rows.push(block); continue; }
    /** A bare item is a run of prose unless it carries a box, and a run of
     *  prose is written as it was read rather than as a bullet. */
    if (block.type === ITEM && field(block.fields, DONE) !== undefined) {
      items.push(check(block, rewrite(block.body ?? "", block.id)));
      continue;
    }
    close();

    if (block.type === SECTION) {
      const name = block.name ?? "";
      anchors.push(anchor(name));
      parts.push(`${"#".repeat(Math.min(6, level))} ${name}`);
      const body = rewrite(block.body ?? "", block.id);
      if (body) parts.push(body);
      parts.push(...contents(graph, block.id, level + 1, rewrite, anchors));
      continue;
    }
    if (block.type === CODE) {
      parts.push(`\`\`\`${field(block.fields, LANG) ?? ""}\n${block.body ?? ""}\n\`\`\``);
      continue;
    }
    const body = rewrite(block.body ?? "", block.id);
    if (body) parts.push(body);
    parts.push(...contents(graph, block.id, level + 1, rewrite, anchors));
  }
  close();
  return parts.filter(Boolean);
}

/** A grid holder back as a table: the header line, then the cells it seats. */
function table(graph: Graph, holder: Holder, rewrite: Rewrite): string {
  const rows = holder.rows ?? 0;
  const cols = holder.cols ?? 0;
  if (rows < 1 || cols < 1) return "";
  const line = (r: number) => `| ${Array.from({ length: cols }, (_unused, c) => {
    const cell = at_cell(graph, holder.id, r, c);
    return cell ? one_line(rewrite(cell.body ?? "", cell.id)) : "";
  }).join(" | ")} |`;
  return [line(0), `|${" --- |".repeat(cols)}`, ...Array.from({ length: rows - 1 }, (_unused, r) => line(r + 1))]
    .join("\n");
}

/** A boundary holder back as a list: its members, in their own order. */
function list(graph: Graph, holder: Holder, rewrite: Rewrite): string {
  return Object.values(graph.blocks)
    .filter((block) => block.group === holder.id)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id))
    .map((member) => check(member, rewrite(member.body ?? "", member.id)))
    .join("\n");
}

/** Typed rows back as a table: the key column first, then the fields each
 *  row carries, in the order the source had them. */
function typed_table(rows: Block[], rewrite: Rewrite): string {
  const order = (rows[0]!.fields ?? []).filter((entry) => entry.name !== KEY).map((entry) => entry.name);
  const body = rows.map((row) => `| ${order
    .map((name) => one_line(rewrite(field(row.fields, name) ?? "", row.id)))
    .join(" | ")} |`);
  return [`| ${order.join(" | ")} |`, `|${" --- |".repeat(order.length)}`, ...body].join("\n");
}

/** One list item, with its box where it had one. */
function check(block: Block, body: string): string {
  const done = field(block.fields, DONE);
  const box = done === undefined ? "" : done === "true" ? "[x] " : "[ ] ";
  const lines = body.split("\n");
  return [`- ${box}${lines[0] ?? ""}`, ...lines.slice(1).map((line) => `  ${line}`)].join("\n").trimEnd();
}

function one_line(body: string): string {
  return body.replace(/\s*\n\s*/g, " ").replace(/(?<!\\)\|/g, "\\|").trim();
}


/** A page's front matter: its fields, its tags, and every relation the body
 *  does not already carry. */
function front_matter(graph: Graph, page: Block, places: Places, path: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of page.fields ?? []) {
    if (entry.value === undefined) continue;
    out[entry.name] = entry.tags?.includes("json") ? json(entry.value)
      : entry.form === "number" ? Number(entry.value)
      : entry.form === "flag" ? entry.value === "true"
      : entry.value;
  }
  if (page.tags?.length) out.tags = page.tags;

  const related = relations_of(graph, page.id, places, path);
  if (related.length) out.related = related;
  return out;
}

/** What goes to `related`: a relation the body does not link, because it was
 *  retyped or because it never was a body link in the first place. */
function relations_of(graph: Graph, page: Id, places: Places, path: string): Record<string, unknown>[] {
  const here = new Set(subtree_of(graph, page));
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const relation of Object.values(graph.edges)) {
    if (!here.has(relation.from)) continue;
    const target = graph.blocks[relation.to];
    if (!target) continue;
    /** The body already carries it, and it still means what it meant. */
    if (relation.type === LINK && relation.tags?.includes(IN_BODY)) continue;
    const to = target.type === "note" ? target.source ?? "" : link_to_block(graph, relation.to, places);
    if (!to || seen.has(to)) continue;
    seen.add(to);
    out.push({
      title: target.name ?? to,
      url: to,
      ...(relation.type && relation.type !== LINK ? { as: graph.defs[relation.type]?.name ?? relation.type } : {}),
    });
  }
  return out.filter((entry) => entry.url !== route(path));
}

/** The emitted route to a block: its page, and its heading where it has one. */
function link_to_block(graph: Graph, id: Id, places: Places): string {
  const page = page_of(graph, id);
  const path = page && places.file.get(page);
  if (!path) return "";
  const block = graph.blocks[id]!;
  return block.type === SECTION ? `${route(path)}#${anchor(block.name ?? "")}` : route(path);
}

/** The document a block's body was written in: its own, or the nearest one
 *  above it. A section carries its own, so moving it does not re-base its
 *  links on the page it landed on. */
function source_of(graph: Graph, id: Id): string {
  let at: Id | null = id;
  while (at) {
    const block: Block | undefined = graph.blocks[at];
    if (!block) return "";
    if (block.source) return block.source.split("#")[0]!;
    at = block.group ? (graph.holders[block.group]?.parent ?? block.parent) : block.parent;
  }
  return "";
}

function page_of(graph: Graph, id: Id): Id | undefined {
  let at: Id | null = id;
  while (at) {
    const block: Block | undefined = graph.blocks[at];
    if (!block) return undefined;
    if (block.type === PAGE) return block.id;
    at = block.parent;
  }
  return undefined;
}

function subtree_of(graph: Graph, root: Id): Id[] {
  const out = [root];
  for (const block of Object.values(graph.blocks)) {
    let at: Id | null = block.parent;
    while (at) {
      if (at === root) { out.push(block.id); break; }
      const up: Block | undefined = graph.blocks[at];
      if (!up || up.type === PAGE) break;
      at = up.parent;
    }
  }
  return out;
}


/** Every markdown link and static import in a body, pointed at where the
 *  graph puts its target now. */
function rewrite_links(
  graph: Graph,
  text: string,
  from: Id,
  path: string,
  places: Places,
  assets: Map<string, OutAsset>,
  faults: string[],
): string {
  if (!text) return text;
  const source = source_of(graph, from);

  const target = (url: string, asset: boolean): string => {
    if (!url || is_external(url)) return url;
    const at = url.indexOf("#");
    const head = at >= 0 ? url.slice(0, at) : url;
    const hash = at >= 0 ? url.slice(at + 1) : "";
    const resolved = head ? resolve(source, head) : source;
    if (!resolved) {
      faults.push(`${source}: link escapes the source root: ${url}`);
      return url;
    }
    if (!asset && (is_markdown(resolved) || places.by_uri.has(resolved))) {
      const page = places.by_uri.get(resolved);
      if (!page) { faults.push(`${source}: nothing answers to ${url}`); return url; }
      return link_to_block(graph, (hash && section_at(graph, page, hash)) || page, places) || url;
    }
    const out = `_assets/${resolved}`;
    assets.set(resolved, { path: out, from: resolved });
    return relative_to(dir_of(path), out);
  };

  let out = text.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
    (_match, bang: string, label: string, url: string) => `${bang}[${label}](${target(url, bang === "!")})`);
  out = out.replace(/\b(import|export)\s+([^;\n]*?\s+from\s+)?(["'])(\.[^"']+)\3/g,
    (_match, keyword: string, clause: string | undefined, quote: string, url: string) =>
      `${keyword} ${clause ?? ""}${quote}${target(url, true)}${quote}`);
  if (/\bimport\s*\(\s*[^"'`\s]/.test(out) || /\bimport\s*\(\s*`[^`]*\$\{/.test(out)) {
    faults.push(`${source}: a dynamic MDX import cannot be rewritten`);
  }
  return out;
}

/** The section in a page that answers to an anchor. */
function section_at(graph: Graph, page: Id, hash: string): Id | undefined {
  const want = anchor(hash);
  for (const id of subtree_of(graph, page)) {
    const block = graph.blocks[id]!;
    if (block.type === SECTION && anchor(block.name ?? "") === want) return id;
  }
  return undefined;
}


/** What mdsite reads to order the nav: every container's children, by the
 *  same segments the files were written under. */
export function nav_order(graph: Graph, places: Places): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (id: Id, prefix: string): void => {
    const kids = children(graph, id).filter((child) => places.under.has(child.id));
    if (kids.length === 0) return;
    out[prefix] = kids.map((child) => base_of(places.under.get(child.id)!).replace(/\.(md|mdx)$/i, ""));
    for (const child of kids) walk(child.id, places.under.get(child.id)!);
  };
  if (graph.blocks[TIER_ROOT]) walk(TIER_ROOT, "");
  return out;
}

function json(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) twice.add(value);
    seen.add(value);
  }
  return [...twice];
}

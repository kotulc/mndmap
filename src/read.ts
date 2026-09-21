/** Markdown in, one mndflow file out.
 *
 *  Pure: files and a config go in, a graph and a report come out, and nothing
 *  is read from disk or the network. Every construct's target comes from the
 *  map, so what lands in the graph is configuration rather than code. */

import { ROOT, SCHEMA, allows_of, base_graph, isa, validate, type Block, type Field, type File, type Graph, type Id } from "@mnd/kit";
import { map_at } from "./config.js";
import { CODE, DONE, IN_BODY, ITEM, LANG, LEVEL, PAGE, SECTION, SET, TIER_ROOT, packages_for, with_packages, type Holder } from "./doc.js";
import { ends_at, parse, plain, starts_at, type Node } from "./parser.js";
import { anchor, base_of, dir_of, is_external, is_markdown, resolve, route } from "./routes.js";
import type { Config, DocMap, Report, SourceFile } from "./types.js";

/** The column a typed row was named by, so the emitter writes the header back
 *  in the order the source had it. */
export const KEY = "row.key";

/** How far a block's prose has been read. A block's body is the prose before
 *  the first thing lifted out of it; what follows becomes ordinary blocks in
 *  their own right, so a table keeps the place it had. */
interface Span {
  at: number;
  /** Whether the block's own body has been settled. */
  closed: boolean;
}

/** A link seen while walking, resolved once every block exists. */
interface Seen {
  from: Id;
  doc: string;
  url: string;
  text: string;
  map: DocMap;
  /** The body already carries this link, so the emitter writes it nowhere else. */
  in_body: boolean;
  /** The relation reads the other way: what the cell names is the end the
   *  definition puts at `from`. */
  flip?: boolean;
}


export function read(files: SourceFile[], config: Config): { file: File; report: Report } {
  const build = new Build(config);
  for (const source of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    build.add_page(source);
  }
  build.resolve_links();
  const graph = order(build.graph);
  const faults = validate(graph).map((fault) => fault.what);
  return {
    file: { schema: SCHEMA, id: "mndmap", graph },
    report: { ...build.report, faults: [...build.report.faults, ...faults] },
  };
}


class Build {
  readonly graph: Graph;
  readonly report: Report = { sets: 0, pages: 0, sections: 0, holders: 0, relations: 0, faults: [] };

  private readonly config: Config;
  private readonly seen: Seen[] = [];
  private readonly targets = new Map<string, Id>();
  private readonly pages = new Map<string, Id>();
  private readonly routes = new Map<string, Id>();
  private readonly counts = new Map<Id, number>();
  private readonly spans = new Map<Id, Span>();

  constructor(config: Config) {
    this.config = config;
    this.graph = widen(with_packages(base_graph(), packages_for(named_types(config))), config);
    this.put({
      id: TIER_ROOT,
      parent: ROOT,
      type: SET,
      name: base_of(config.source.root) || "content",
      source: config.source.root,
      order: 1,
    });
  }

  /** One document: the set it sits in, its page, and everything under it. */
  add_page(source: SourceFile): void {
    const parsed = parse(source.path, source.text);
    const parent = this.set_for(dir_of(source.path));
    const id = `page:${source.path}`;
    const { fields, tags, related } = read_frontmatter(parsed.frontmatter);

    this.put({
      id,
      parent,
      type: PAGE,
      name: base_of(source.path).replace(/\.(md|mdx)$/i, ""),
      source: source.path,
      order: this.next(parent),
      ...(tags.length ? { tags } : {}),
      ...(fields.length ? { fields } : {}),
    });
    this.report.pages++;
    this.pages.set(source.path, id);
    this.targets.set(source.path, id);
    this.routes.set(route(source.path), id);

    this.walk(parsed, id);
    this.name_page(id, parsed);
    for (const entry of related) {
      this.seen.push({
        from: id, doc: source.path, url: entry.url, text: entry.title,
        map: this.config.map, in_body: false,
      });
    }
  }

  /** Every link, once every block it could point at exists. A front matter
   *  entry nothing answers to is kept verbatim rather than dropped. */
  resolve_links(): void {
    let n = 0;
    const kept = new Map<Id, { title: string; url: string }[]>();
    for (const link of this.seen) {
      const to = this.target(link);
      if (!to) {
        if (link.in_body) continue;
        const list = kept.get(link.from) ?? [];
        list.push({ title: link.text, url: link.url });
        kept.set(link.from, list);
        continue;
      }
      const id = `link:${n++}`;
      this.graph.edges[id] = {
        id,
        from: link.flip ? to : link.from,
        to: link.flip ? link.from : to,
        type: link.map.link.type,
        ...(link.text ? { name: link.text } : {}),
        ...(link.in_body ? { tags: [IN_BODY] } : {}),
      };
      this.report.relations++;
    }
    for (const [id, list] of kept) {
      this.set_field(id, { name: "related", form: "text", value: JSON.stringify(list), tags: ["json"] });
    }
  }


  /** The document's top level, split into sections by the headings the map
   *  keeps. Everything else lands in the enclosing block's span. */
  private walk(parsed: ReturnType<typeof parse>, page: Id): void {
    const stack: { id: Id; level: number; headings: string[] }[] = [];
    let current = page;
    let headings: string[] = [];
    this.spans.set(page, { at: parsed.body_at, closed: false });

    for (const node of parsed.tree.children ?? []) {
      if (node.type === "yaml") continue;
      const map = map_at(this.config, headings);

      if (node.type === "heading") {
        const beyond = node.depth > map.section.depth;
        if (beyond && map.section.beyond === "body") {
          this.collect(node, current, parsed, map);
          continue;
        }
        this.flush(current, starts_at(node), parsed.text);
        while (stack.length && stack[stack.length - 1]!.level >= node.depth) stack.pop();
        const name = plain(node);
        const under = [...(stack[stack.length - 1]?.headings ?? []), name];
        const parent = last_in_depth(stack, map.section.depth) ?? page;
        const within = under.map(anchor).join("/");
        const id = `sec:${parsed.path}#${within}`;

        this.put({
          id,
          parent,
          type: SECTION,
          name,
          /** One uri, with the heading path as its within-part: where the
           *  section was read from, and how it is found again after a move. */
          source: `${parsed.path}#${within}`,
          order: this.next(parent),
          fields: [{ name: LEVEL, form: "number", value: String(node.depth) }],
        });
        this.report.sections++;
        this.targets.set(`${parsed.path}#${anchor(name)}`, id);
        this.spans.set(id, { at: ends_at(node), closed: false });
        stack.push({ id, level: node.depth, headings: under });
        current = id;
        headings = under;
        continue;
      }

      this.collect(node, current, parsed, map);
    }

    this.flush(current, parsed.text.length, parsed.text);
  }

  /** One top-level node: lifted into a block of its own where the map says
   *  so, and otherwise left in the enclosing block's body. */
  private collect(node: Node, owner: Id, parsed: ReturnType<typeof parse>, map: DocMap): void {
    if (node.type === "table" && map.table.as === "grid") { this.grid(node, owner, parsed, map); return; }
    if (node.type === "table" && map.table.as === "rows") { this.rows(node, owner, parsed, map); return; }
    if (node.type === "list") {
      const tasks = (node.children ?? []).length > 0
        && (node.children ?? []).every((item: Node) => item.checked !== null && item.checked !== undefined);
      /** A list of checkboxes is a task list, and `task` is the rule that
       *  speaks about it. `list` governs every other list. */
      if (tasks && map.task.as === "block") { this.tasks(node, owner, parsed, map); return; }
      if (map.list.as === "group") { this.group(node, owner, parsed, map); return; }
    }
    if (node.type === "code" && map.fence.as === "block") { this.fence(node, owner, parsed); return; }
    this.links(node, owner, parsed.path, map);
  }

  /** A table as a grid: a holder standing for the block it sits in, header
   *  cells in row nought, and every cell an item with a body. */
  private grid(node: Node, owner: Id, parsed: ReturnType<typeof parse>, map: DocMap): void {
    const rows: Node[] = node.children ?? [];
    if (rows.length === 0) return;
    this.cut(owner, node, parsed.text);
    const cols = (rows[0]!.children ?? []).length;
    const order = this.next(owner);
    const id = `grid:${owner}:${order}`;

    this.hold({ id, parent: owner, of: owner, arrangement: "grid", rows: rows.length, cols, order });
    this.report.holders++;

    for (const [r, row] of rows.entries()) {
      for (const [c, cell] of ((row.children ?? []) as Node[]).entries()) {
        const cell_id = `cell:${id}:${r}:${c}`;
        this.put({
          id: cell_id,
          parent: owner,
          type: ITEM,
          body: inner(cell, parsed.text),
          group: id,
          cell: { r, c },
          order: this.next(owner),
          ...(r === 0 ? { header: true } : {}),
        });
        this.links(cell, cell_id, parsed.path, map);
      }
    }
  }

  /** A table as typed rows: one block per data row, named by the key column
   *  and carrying the rest as fields. A link in a cell takes the column's
   *  name as its type where the vocabulary has one. */
  private rows(node: Node, owner: Id, parsed: ReturnType<typeof parse>, map: DocMap): void {
    const rows: Node[] = node.children ?? [];
    if (rows.length < 2) { this.grid(node, owner, parsed, map); return; }
    this.cut(owner, node, parsed.text);

    const columns: string[] = (rows[0]!.children ?? []).map((cell: Node) => inner(cell, parsed.text));
    const key = map.table.key && columns.includes(map.table.key) ? map.table.key : columns[0] ?? "";
    const family = map.table.type.split(".")[0] ?? "";
    const at = columns.indexOf(key);

    for (const row of rows.slice(1)) {
      const cells: Node[] = row.children ?? [];
      const values: string[] = cells.map((cell: Node) => inner(cell, parsed.text));
      const order = this.next(owner);
      const id = `row:${owner}:${order}`;

      this.put({
        id,
        parent: owner,
        type: map.table.type,
        name: values[at] ?? values[0] ?? "",
        order,
        /** The key column names the block *and* stays a field: a definition
         *  that asks for it by name is answered either way. */
        fields: [
          { name: KEY, form: "text", value: key },
          ...columns.map((name, index) => ({ name, form: "text" as const, value: values[index] ?? "" })),
        ],
      });
      this.report.holders++;

      for (const [index, cell] of cells.entries()) {
        const named = this.typed(family, columns[index] ?? "");
        if (!named) { this.links(cell, id, parsed.path, map); continue; }
        /** A definition that puts the row's own type at one end says which
         *  way its lines read: a design satisfies a requirement, not the
         *  other way about. */
        this.links(cell, id, parsed.path, { ...map, link: { ...map.link, type: named } },
          this.reads_back(named, map.table.type));
      }
    }
  }

  /** A list as a group: a boundary holder standing for the block it sits in,
   *  with one item per entry. */
  private group(node: Node, owner: Id, parsed: ReturnType<typeof parse>, map: DocMap): void {
    this.cut(owner, node, parsed.text);
    const order = this.next(owner);
    const id = `list:${owner}:${order}`;
    this.hold({ id, parent: owner, of: owner, arrangement: "free", order });
    this.report.holders++;

    for (const [index, item] of ((node.children ?? []) as Node[]).entries()) {
      const item_id = `item:${id}:${index}`;
      this.put({
        id: item_id,
        parent: owner,
        type: ITEM,
        body: inner(item, parsed.text),
        group: id,
        order: this.next(owner),
        ...(typeof item.checked === "boolean"
          ? { fields: [{ name: DONE, form: "flag", value: String(item.checked) }] satisfies Field[] }
          : {}),
      });
      this.links(item, item_id, parsed.path, map);
    }
  }

  /** A task list as blocks: no holder, one item per checkbox. */
  private tasks(node: Node, owner: Id, parsed: ReturnType<typeof parse>, map: DocMap): void {
    this.cut(owner, node, parsed.text);
    for (const [index, item] of ((node.children ?? []) as Node[]).entries()) {
      const order = this.next(owner);
      const id = `task:${owner}:${order}:${index}`;
      this.put({
        id,
        parent: owner,
        type: ITEM,
        body: inner(item, parsed.text),
        order,
        fields: [{ name: DONE, form: "flag", value: String(Boolean(item.checked)) }],
      });
      this.links(item, id, parsed.path, map);
    }
  }

  /** A fence as a block: the word on the fence is a field and the code is
   *  the body. */
  private fence(node: Node, owner: Id, parsed: ReturnType<typeof parse>): void {
    this.cut(owner, node, parsed.text);
    const order = this.next(owner);
    this.put({
      id: `code:${owner}:${order}`,
      parent: owner,
      type: CODE,
      name: node.lang ? String(node.lang) : "code",
      body: String(node.value ?? ""),
      order,
      ...(node.lang ? { fields: [{ name: LANG, form: "text", value: String(node.lang) }] satisfies Field[] } : {}),
    });
  }

  /** Every link under a node, noted against the block that encloses it. */
  private links(node: Node, owner: Id, doc: string, map: DocMap, flip = false): void {
    if (node.type === "link") {
      const url = String(node.url ?? "");
      const external = is_external(url);
      if (map.link.as === "relation" && (!external || map.link.external === "relation")) {
        this.seen.push({ from: owner, doc, url, text: plain(node), map, in_body: true, flip });
      }
    }
    for (const child of node.children ?? []) this.links(child, owner, doc, map, flip);
  }

  /** Whether a relation definition seats the row's own type at `to`, which
   *  makes the block a cell names the `from` end. */
  private reads_back(relation: Id, row: Id): boolean {
    const ends = allows_of(this.graph, relation).ends;
    if (!ends?.to?.length) return false;
    const chain = isa(this.graph, row).map((definition) => definition.id);
    return ends.to.some((end) => chain.includes(end)) && !(ends.from ?? []).some((end) => chain.includes(end));
  }


  /** What a link points at: a page, a heading in one, or a note standing in
   *  for somewhere outside the collection. */
  private target(link: Seen): Id | undefined {
    if (is_external(link.url)) return this.outside(link.url);
    /** A front matter entry names a route, not a file beside the document. */
    if (link.url.startsWith("/")) {
      const cut = link.url.indexOf("#");
      const page = this.routes.get(cut >= 0 ? link.url.slice(0, cut) : link.url);
      if (!page || cut < 0) return page;
      return this.targets.get(`${this.uri(page)}#${anchor(link.url.slice(cut + 1))}`) ?? page;
    }
    const cut = link.url.indexOf("#");
    const path = cut >= 0 ? link.url.slice(0, cut) : link.url;
    const heading = cut >= 0 ? link.url.slice(cut + 1) : "";
    const resolved = path ? resolve(link.doc, path) : link.doc;
    if (!resolved) {
      this.report.faults.push(`${link.doc}: link escapes the source root: ${link.url}`);
      return undefined;
    }
    if (!is_markdown(resolved) && !this.pages.has(resolved)) return undefined;
    const found = heading ? this.targets.get(`${resolved}#${anchor(heading)}`) : this.targets.get(resolved);
    if (!found) this.report.faults.push(`${link.doc}: nothing answers to ${link.url}`);
    return found;
  }

  private uri(page: Id): string {
    return this.graph.blocks[page]?.source ?? "";
  }

  /** The relation type a column names, where the vocabulary has one: a
   *  `satisfies` column becomes `req.satisfy`, by name rather than by id. */
  private typed(family: string, column: string): Id | undefined {
    const want = column.trim().toLowerCase();
    if (!family || !want) return undefined;
    for (const definition of Object.values(this.graph.defs)) {
      if (definition.group !== "relation" || !definition.id.startsWith(`${family}.`)) continue;
      if (definition.name.toLowerCase() === want || definition.id === `${family}.${want}`) return definition.id;
    }
    return undefined;
  }

  /** One note per address outside the collection, so a relation always has
   *  somewhere to land. A note carries no doc type, so the emitter passes it by. */
  private outside(url: string): Id {
    const id = `out:${url}`;
    if (!this.graph.blocks[id]) {
      this.put({ id, parent: TIER_ROOT, type: "note", name: url, source: url, order: this.next(TIER_ROOT) });
    }
    return id;
  }

  /** The set for a directory, and every set above it. */
  private set_for(dir: string): Id {
    if (!dir) return TIER_ROOT;
    const id = `set:${dir}`;
    if (this.graph.blocks[id]) return id;
    const parent = this.set_for(dir_of(dir));
    this.put({ id, parent, type: SET, name: base_of(dir), source: dir, order: this.next(parent) });
    this.report.sets++;
    return id;
  }

  /** A page's name, from the first source the map offers that has one. */
  private name_page(id: Id, parsed: ReturnType<typeof parse>): void {
    const map = map_at(this.config, []);
    const first = Object.values(this.graph.blocks)
      .filter((child) => child.parent === id && child.type === SECTION)
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))[0];
    for (const source of map.page.name) {
      const name = source === "title" ? string_of(parsed.frontmatter.title)
        : source === "heading" ? first?.name
        : base_of(parsed.path).replace(/\.(md|mdx)$/i, "");
      if (name) { this.block(id).name = name; return; }
    }
  }


  /** The prose read so far: the block's own body the first time, and a block
   *  of its own after that, so what was lifted out keeps its place. */
  private flush(owner: Id, upto: number, text: string): void {
    const span = this.spans.get(owner);
    if (!span || upto <= span.at) return;
    const chunk = text.slice(span.at, upto).replace(/\n{3,}/g, "\n\n").trim();
    span.at = upto;
    if (!chunk) return;
    if (!span.closed) { this.block(owner).body = chunk; return; }
    const order = this.next(owner);
    this.put({ id: `prose:${owner}:${order}`, parent: owner, type: ITEM, body: chunk, order });
  }

  /** Everything before a lifted construct is prose; the construct itself is
   *  skipped, and the block's own body is settled from here on. */
  private cut(owner: Id, node: Node, text: string): void {
    this.flush(owner, starts_at(node), text);
    const span = this.spans.get(owner);
    if (span) { span.at = ends_at(node); span.closed = true; }
  }

  private put(block: Block): void {
    this.graph.blocks[block.id] = block;
  }

  private hold(holder: Holder): void {
    this.graph.holders[holder.id] = holder;
  }

  private block(id: Id): Block {
    return this.graph.blocks[id]!;
  }

  private set_field(id: Id, next: Field): void {
    const block = this.block(id);
    block.fields = [...(block.fields ?? []).filter((entry) => entry.name !== next.name), next];
  }

  /** The next slot under a parent. Document order, so the emitter writes a
   *  page back the way it was read. */
  private next(parent: Id): number {
    const n = (this.counts.get(parent) ?? 0) + 1;
    this.counts.set(parent, n);
    return n;
  }
}


/** A map that reads a table as another vocabulary's blocks is saying a
 *  section may hold them. The package says otherwise, and the workspace's own
 *  word stands in front of a package's — so the definition is restated here,
 *  without the `from` that would claim it is still the package's. */
function widen(graph: Graph, config: Config): Graph {
  const rows = [config.map, ...config.overrides.map((override) => override.map)]
    .filter((map) => map.table?.as === "rows")
    .map((map) => map.table!.type!)
    .filter(Boolean);
  if (rows.length === 0) return graph;

  const defs = { ...graph.defs };
  for (const id of [SECTION, PAGE]) {
    const held = defs[id];
    if (!held) continue;
    const allows = (held.components?.allows ?? {}) as { holds?: string[] };
    if (!Array.isArray(allows.holds)) continue;
    const { from: _package, ...own } = held;
    defs[id] = {
      ...own,
      components: {
        ...held.components,
        allows: { ...allows, holds: [...new Set([...allows.holds, ...rows])] },
      },
    };
  }
  return { ...graph, defs };
}

/** Every definition id a config names, so the packages that own them load. */
function named_types(config: Config): Id[] {
  return [config.map, ...config.overrides.map((override) => override.map)]
    .flatMap((map) => [map.link?.type, map.table?.type, map.page?.as, map.section?.as, map.folder?.as])
    .filter((id): id is string => typeof id === "string");
}

/** Front matter as fields, with the keys the map reads separately taken out.
 *  A value that is not a scalar is kept as JSON so it survives intact. */
function read_frontmatter(raw: Record<string, unknown>): {
  fields: Field[];
  tags: string[];
  related: { title: string; url: string }[];
} {
  const fields: Field[] = [];
  const tags: string[] = [];
  const related: { title: string; url: string }[] = [];

  for (const [name, value] of Object.entries(raw)) {
    if (name === "tags") {
      if (Array.isArray(value)) tags.push(...value.map(String));
      else if (typeof value === "string") tags.push(...value.split(",").map((tag) => tag.trim()));
      continue;
    }
    if (name === "related") {
      for (const entry of Array.isArray(value) ? value : []) {
        if (typeof entry === "string") related.push({ title: entry, url: entry });
        else if (entry && typeof entry === "object") {
          const item = entry as Record<string, unknown>;
          related.push({ title: String(item.title ?? item.url ?? ""), url: String(item.url ?? "") });
        }
      }
      continue;
    }
    if (typeof value === "string") fields.push({ name, form: "text", value });
    else if (typeof value === "number") fields.push({ name, form: "number", value: String(value) });
    else if (typeof value === "boolean") fields.push({ name, form: "flag", value: String(value) });
    else if (value !== null && value !== undefined) {
      fields.push({ name, form: "text", value: JSON.stringify(value), tags: ["json"] });
    }
  }

  return { fields, tags, related };
}

/** A list item or table cell's markdown, without the bullet or the pipes. */
function inner(node: Node, text: string): string {
  const children: Node[] = node.children ?? [];
  if (children.length === 0) return "";
  return text.slice(starts_at(children[0]!), ends_at(children[children.length - 1]!)).trim();
}

/** The nearest enclosing heading the map kept, for a heading past the depth. */
function last_in_depth(stack: { id: Id; level: number }[], depth: number): Id | undefined {
  for (let at = stack.length - 1; at >= 0; at--) {
    if (stack[at]!.level <= depth) return stack[at]!.id;
  }
  return undefined;
}

function string_of(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Keys sorted, so re-reading the same collection writes the same bytes. */
function order(graph: Graph): Graph {
  const sorted = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
  return {
    ...graph,
    blocks: sorted(graph.blocks),
    edges: sorted(graph.edges),
    defs: sorted(graph.defs),
    holders: sorted(graph.holders),
    packages: sorted(graph.packages),
  };
}

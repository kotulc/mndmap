/** A build: the content folder copied to `out` with every diagram fence drawn in its page, each
 *  diagram's own page and the gallery written under the assets folder. A site build then reads
 *  `out` as its content, as it would any markdown. */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import type { Config } from "./config.js";
import { diagrams, type Diagram, type Skipped } from "./diagrams.js";
import { swap } from "./fences.js";
import { href, published, type Link } from "./links.js";
import { gallery, inline, page } from "./pages.js";
import { scan, type Site } from "./site.js";


/** What a build found: the site, its diagrams, fences left as written, and links naming nothing. */
export type Report = {
  site: Site; found: Diagram[]; skipped: Skipped[];
  broken: { diagram: Diagram; node: string; link: Extract<Link, { kind: "broken" }> }[];
};

/** The file a build leaves in `out`, so the next build knows the folder is its own to replace. */
const MARK = ".mndmap";


/** Read the content and its diagrams without writing anything. */
export async function inspect(config: Config): Promise<Report> {
  const site = scan(config.content, config.title, config.exclude);
  const { found, skipped } = await diagrams(site, config);
  const broken = found.flatMap((diagram) => diagram.links
    .filter((l): l is { node: string; link: Extract<Link, { kind: "broken" }> } => l.link.kind === "broken")
    .map(({ node, link }) => ({ diagram, node, link })));
  return { site, found, skipped, broken };
}

/** Build `out` from the content: copy it, draw each diagram in place, write the diagram pages. */
export async function build(config: Config): Promise<Report> {
  const report = await inspect(config);
  clear(config);
  cpSync(config.content, config.out, { recursive: true, filter: (from) => basename(from) !== ".git" });

  // Each page's fences swapped for their drawings, in the copy
  const by_page = Map.groupBy(report.found, (d) => d.page);
  for (const [at, found] of by_page) {
    const text = readFileSync(at.file, "utf8");
    const swaps = found.map((d) => ({ fence: d.fence, with: embed(d, config) }));
    writeFileSync(join(config.out, at.path), swap(text, swaps));
  }

  // Every diagram's own page, and the gallery over them all
  const assets = join(config.out, ...config.assets.split("/"));
  mkdirSync(assets, { recursive: true });
  for (const d of report.found) writeFileSync(join(assets, `${d.id}.html`), page(d, config));
  writeFileSync(join(assets, "index.html"), gallery(report.found, config, report.site.title));
  writeFileSync(join(config.out, MARK), "Built by mndmap: this folder is replaced on every build.\n");
  return report;
}


/** A diagram as its page carries it: the drawing inline, or a frame on its own page. */
function embed(d: Diagram, config: Config): string {
  const from = published(d.page.url, config.urls);
  if (d.mode === "static") return inline(d.draw(from), config);
  const { height } = d.draw(from);
  const src = `${href(from, `/${config.assets}/${d.id}.html`, config.urls)}?embed`;
  const room = d.deck ? d.deck.height : d.kind === "map" ? height + 40 : height + 8;
  return `<iframe src="${src}" title="${d.title.replace(/"/g, "&quot;")}" width="100%" height="${room}"`
    + ` loading="lazy" frameBorder="0"></iframe>`;
}

/** Empty `out` for a build, refusing a folder a build did not make or the content itself. */
function clear(config: Config) {
  const inside = relative(config.content, config.out);
  if (!inside || (!inside.startsWith("..") && !isAbsolute(inside))) {
    throw new Error(`out (${config.out}) must not be the content folder or inside it`);
  }
  if (existsSync(config.out) && readdirSync(config.out).length && !existsSync(join(config.out, MARK))) {
    throw new Error(`out (${config.out}) holds files mndmap did not write; empty it or pick another folder`);
  }
  rmSync(config.out, { recursive: true, force: true });
  mkdirSync(dirname(config.out), { recursive: true });
}

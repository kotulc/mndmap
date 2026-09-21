/** The round trip, run headless.
 *
 *  A collection read in and emitted back, compared line by line. This is what
 *  says whether opaque bodies hold, and it is cheap enough to run before the
 *  dashboard is built on the answer.
 *
 *  Usage: tsx scripts/roundtrip.ts [root] [--prose] */

import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { review } from "@mnd/kit";
import { DEFAULT_CONFIG, emit, read, read_config, TIER_ROOT } from "../src/index.js";
import type { Config, SourceFile } from "../src/types.js";

const args = process.argv.slice(2);
const prose = args.includes("--prose");
const root = resolve(args.find((entry) => !entry.startsWith("--")) ?? ".");

const config = await load(root);
const files = await collect(root, config);
const { file, report } = read(files, config);
const out = emit(file.graph, config);

const emitted = new Map(out.files.map((entry) => [entry.path, entry.text]));
const rows: { path: string; verdict: string }[] = [];
const tally = { exact: 0, links: 0, tables: 0 };

/** A ladder: what the two bodies agree on once the differences the contract
 *  allows are normalised away. The weakest rung that matches is the verdict. */
for (const source of files) {
  const there = emitted.get(source.path);
  if (there === undefined) { rows.push({ path: source.path, verdict: "not emitted" }); continue; }
  const here = body_of(source.text);
  const back = body_of(there);
  if (!first_difference(here, back)) { tally.exact++; continue; }
  if (!first_difference(blind(here), blind(back))) { tally.links++; continue; }
  if (!first_difference(ruled(blind(here)), ruled(blind(back)))) { tally.tables++; continue; }
  rows.push({ path: source.path, verdict: first_difference(here, back)! });
}

const extra = out.files.filter((entry) => entry.path !== "mdsite.yaml" && !files.some((s) => s.path === entry.path));
/** What the vocabularies asked for and did not get. Advice while modelling,
 *  and a refusal here: a translator is where a note becomes one. */
const notes = review(file.graph, TIER_ROOT);

console.log(`read    ${report.pages} pages, ${report.sections} sections, ${report.holders} holders, ${report.relations} relations`);
console.log(`emitted ${out.files.length} files, ${extra.length} of them generated`);
const survived = tally.exact + tally.links + tally.tables;
console.log(`bodies  ${survived} of ${files.length} survive${prose ? " (prose-only map)" : ""}`);
console.log(`        ${tally.exact} byte for byte, ${tally.links} with links rewritten, ${tally.tables} with a table re-ruled`);
console.log(`vocab   ${notes.length ? `${notes.length} notes` : "nothing asked for and missing"}`);
for (const note of notes.slice(0, 8)) console.log(`  ${note.kind}: ${note.what}`);
for (const row of rows) console.log(`  ${row.path}\n    ${row.verdict}`);
for (const fault of [...report.faults, ...out.faults]) console.log(`  fault: ${fault}`);
if (rows.length || out.faults.length || notes.length) process.exitCode = 1;


/** The repo's config, or the same one with every construct left in the body,
 *  which is the map the clean-diff claim is about. */
async function load(at: string): Promise<Config> {
  const base = await maybe(join(at, "mndmap.yaml"));
  const config = base ? read_config(base) : DEFAULT_CONFIG;
  if (!prose) return config;
  return { ...config, map: { ...config.map, table: { ...config.map.table, as: "body" }, list: { as: "body" },
    task: { as: "body" }, fence: { as: "body" } } };
}

async function collect(at: string, of: Config): Promise<SourceFile[]> {
  const base = resolve(at, of.source.root);
  const out: SourceFile[] = [];
  const walk = async (here: string): Promise<void> => {
    for (const entry of await readdir(here, { withFileTypes: true })) {
      const path = join(here, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!/\.(md|mdx)$/i.test(entry.name)) continue;
      out.push({ path: relative(base, path).replaceAll("\\", "/"), text: await readFile(path, "utf8") });
    }
  };
  await walk(base);
  return out.sort((left, right) => left.path.localeCompare(right.path));
}

/** The same body with every link target blanked, so a rewritten link does
 *  not read as prose that changed. */
function blind(text: string): string {
  return text.replace(/(!?\[[^\]]*\])\([^)\s]+\)/g, "$1(_)");
}

/** The same body with every table rule row and cell padding normalised, so
 *  a table that became a grid and came back does not read as prose that
 *  changed. */
function ruled(text: string): string {
  return text
    .split("\n")
    .map((line) => /^\s*\|[\s:|-]+\|\s*$/.test(line) ? "|---|" : line.replace(/\s*\|\s*/g, "|"))
    .join("\n");
}

/** Everything after the front matter, which is filled rather than copied. */
function body_of(text: string): string {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return (match ? text.slice(match[0].length) : text).replace(/\r\n/g, "\n").trim();
}

function first_difference(left: string, right: string): string | null {
  const here = left.split("\n");
  const there = right.split("\n");
  for (let at = 0; at < Math.max(here.length, there.length); at++) {
    if (here[at] === there[at]) continue;
    return `line ${at + 1}\n      was  ${show(here[at], there[at])}\n      now  ${show(there[at], here[at])}`;
  }
  return null;
}

/** The window around where two lines part, so a difference late in a long
 *  line is still visible. */
function show(line: string | undefined, other: string | undefined): string {
  if (line === undefined) return "(end of file)";
  let at = 0;
  while (at < line.length && line[at] === other?.[at]) at++;
  const from = Math.max(0, at - 30);
  return JSON.stringify(line.slice(from, at + 60)) + (from ? ` (from column ${from})` : "");
}

async function maybe(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); } catch { return undefined; }
}

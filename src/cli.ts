#!/usr/bin/env node
/** mndmap's command line.
 *
 *    mndmap build <content> [--out build] [--mode static|interactive] [--base /site] [--strict]
 *    mndmap check <content>      read and report, writing nothing; fails on a broken link
 *
 *  Other flags: --urls directory|html, --assets <dir>, --title <name>, --dark retro|modern,
 *  --exclude <path> (repeatable), --config <mndmap.yaml>. Settings in mndmap.yaml are read first;
 *  flags win. */

import { relative } from "node:path";
import { parseArgs } from "node:util";
import { build, inspect, type Report } from "./build.js";
import { config } from "./config.js";


const USAGE = `usage: mndmap build <content> [--out build] [--mode static|interactive] [--base /site]
                    [--urls directory|html] [--assets _assets/mndmap] [--title name]
                    [--dark retro|modern] [--exclude path]... [--strict] [--config mndmap.yaml]
       mndmap check <content> [same options]`;


/** A report as lines: each diagram, then fences left as written, then broken links. */
function print(report: Report, out?: string) {
  const at = (path: string, line: number) => `${path}:${line}`;
  for (const d of report.found) {
    const cards = d.deck?.read("/").order.length ?? 0;
    const links = d.kind === "map" ? "" : d.deck ? `  ${cards} cards`
      : `  ${d.links.length} link${d.links.length === 1 ? "" : "s"}`;
    console.log(`  ${d.kind.padEnd(4)} ${d.mode.padEnd(11)} ${at(d.page.path, d.fence.line).padEnd(40)} ${d.id}${links}`);
  }
  for (const s of report.skipped) console.log(`  skip ${at(s.page.path, s.fence.line)}: ${s.reason}`);
  for (const b of report.broken) {
    console.warn(`  ! ${at(b.diagram.page.path, b.diagram.fence.line)} node ${b.node}: ${b.link.reason}`);
  }
  const many = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
  const counts = [many(report.site.pages.length, "page"), many(report.found.length, "diagram"),
    many(report.broken.length, "broken link")].join(", ");
  console.log(out ? `${counts} → ${relative(process.cwd(), out) || "."}` : counts);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" }, mode: { type: "string" }, urls: { type: "string" }, base: { type: "string" },
      assets: { type: "string" }, title: { type: "string" }, dark: { type: "string" },
      strict: { type: "boolean" }, config: { type: "string" }, help: { type: "boolean", short: "h" },
      exclude: { type: "string", multiple: true },
    },
  });
  const [command, content] = positionals;
  if (values.help || !command || !["build", "check"].includes(command)) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }
  const settings = config({ ...values, ...(content ? { content } : {}) });
  const report = command === "build" ? await build(settings) : await inspect(settings);
  print(report, command === "build" ? settings.out : undefined);
  if (report.broken.length && (settings.strict || command === "check")) process.exit(1);
}

main().catch((e: Error) => {
  console.error(`mndmap: ${e.message}`);
  process.exit(1);
});

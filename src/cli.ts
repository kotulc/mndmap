#!/usr/bin/env node
/** The CLI: translate and emit, and nothing else.
 *
 *  The browser is the product; this exists so CI can run the same two pure
 *  functions headless. Everything here is disk and argv — the translator
 *  itself never touches either. */

import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve as resolve_path } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "@mnd/kit";
import { read_config } from "./config.js";
import { emit } from "./emit.js";
import { read } from "./read.js";
import { read_mdsite } from "./mdsite.js";
import { suggest } from "./suggest.js";
import type { Config, SourceFile } from "./types.js";

const HELP = `Usage: mndmap <command> [options]

  translate <root>   Read the collection under <root> and write workspace.json
  emit <file>        Write the collection a workspace.json describes

Options:
  --config FILE      Configuration to read (default: <root>/mndmap.yaml)
  --out PATH         Where to write (default: workspace.json, or destination)
`;


export async function run(argv = process.argv.slice(2)): Promise<void> {
  const args = argv.filter((entry) => entry !== "--");
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP);
    return;
  }

  const out = option(args, "--out");
  const config_file = option(args, "--config");
  const command = args.shift();
  const where = args.shift() ?? ".";

  if (command === "translate") return translate(where, config_file, out);
  if (command === "emit") return publish(where, config_file, out);
  throw new Error(`Unknown command: ${command ?? ""}`);
}


/** A folder in, one file out, and a note of what became what. */
async function translate(root: string, config_file?: string, out?: string): Promise<void> {
  const config = await load(root, config_file);
  const files = await collect(root, config);
  const { file, report } = read(files, config);

  await writeFile(resolve_path(root, out ?? "workspace.json"), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  if (config.suggest.taggly) {
    const sidecar = await suggest(file.graph, config);
    await writeFile(resolve_path(root, "suggestions.json"), `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.faults.length) process.exitCode = 1;
}

/** One file in, a collection out. */
async function publish(file: string, config_file?: string, out?: string): Promise<void> {
  const root = dirname(resolve_path(file));
  const config = await load(root, config_file);
  const opened = open(await readFile(file, "utf8"));
  if (opened.faults.length) process.stdout.write(`${opened.faults.map((fault) => fault.what).join("\n")}\n`);

  const template = config.publish ? await maybe(join(root, config.publish.mdsite)) : undefined;
  const result = emit(opened.graph, config, template ? read_mdsite(template) : undefined);
  if (result.faults.length) {
    process.stderr.write(`${result.faults.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  const destination = resolve_path(root, out ?? config.destination);
  for (const entry of result.files) {
    const target = join(destination, entry.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, entry.text, "utf8");
  }
  for (const asset of result.assets) {
    const target = join(destination, asset.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, config.source.root, asset.from), target);
  }
  process.stdout.write(`${JSON.stringify({ files: result.files.length, assets: result.assets.length }, null, 2)}\n`);
}


async function load(root: string, config_file?: string): Promise<Config> {
  return read_config(await maybe(resolve_path(root, config_file ?? "mndmap.yaml")));
}

/** Every document under `source.root`, as the translator wants them. */
async function collect(root: string, config: Config): Promise<SourceFile[]> {
  const base = resolve_path(root, config.source.root);
  const files: SourceFile[] = [];

  const walk = async (at: string): Promise<void> => {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const here = join(at, entry.name);
      if (entry.isDirectory()) { await walk(here); continue; }
      if (!/\.(md|mdx)$/i.test(entry.name)) continue;
      const path = relative(base, here).replaceAll("\\", "/");
      if (config.source.exclude.some((pattern) => matches(path, pattern))) continue;
      files.push({ path, text: await readFile(here, "utf8") });
    }
  };

  await walk(base);
  return files;
}

/** Glob matching, narrow on purpose: `*` within a segment and `**` across. */
function matches(path: string, pattern: string): boolean {
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*\*/g, ".*")
    .replace(/(?<!\.)\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${expression}$`).test(path);
}

async function maybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function option(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  if (at === args.length - 1) throw new Error(`${name} needs a value`);
  return args.splice(at, 2)[1];
}


const entry = process.argv[1] ? resolve_path(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  run().catch((error: unknown) => {
    process.stderr.write(`mndmap: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

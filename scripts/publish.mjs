#!/usr/bin/env node
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Mndmap } from "../dist/src/service.js";
import { verifyPublication, writePublication } from "../dist/src/publish/index.js";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const command = args[0]?.startsWith("--") || !args.length ? "build" : args.shift();

if (command === "build") await build(args);
else if (command === "copy") await copy(args);
else if (command === "verify") await verify(args);
else throw new Error(`Unknown publication command: ${command}`);

async function build(argv) {
  const root = resolve(option(argv, "--root") ?? projectRoot);
  const output = resolve(option(argv, "--out-dir") ?? option(argv, "--output") ?? positional(argv) ?? join(root, ".publication"));
  const embed = resolve(option(argv, "--embed") ?? join(projectRoot, "dist", "publish-embed"));
  assertNoArguments(argv);
  await rm(output, { recursive: true, force: true });
  const service = await Mndmap.open(root, { memory: true });
  try {
    await service.import();
    const collections = service.collections();
    const manifest = await writePublication(join(output, "mndmap"), collections, (id) => service.records(id), embed);
    await writeContent(output, manifest);
    await verifyPublication(join(output, "mndmap"));
    process.stdout.write(`Published ${manifest.collections.length} collection(s) to ${output}\n`);
  } finally {
    service.close();
  }
}

async function copy(argv) {
  const input = resolve(option(argv, "--input") ?? positional(argv) ?? join(projectRoot, ".publication", "mndmap"));
  const siteOutput = resolve(required(option(argv, "--site-output") ?? positional(argv), "--site-output"));
  assertNoArguments(argv);
  await verifyPublication(input);
  await mkdir(siteOutput, { recursive: true });
  await rm(join(siteOutput, "mndmap"), { recursive: true, force: true });
  await cp(input, join(siteOutput, "mndmap"), { recursive: true });
  process.stdout.write(`Copied publication to ${join(siteOutput, "mndmap")}\n`);
}

async function verify(argv) {
  const input = resolve(option(argv, "--input") ?? positional(argv) ?? join(projectRoot, ".publication", "mndmap"));
  assertNoArguments(argv);
  const manifest = await verifyPublication(input);
  process.stdout.write(`Verified ${manifest.collections.length} published collection(s)\n`);
}

async function writeContent(output, manifest) {
  const content = join(output, "content");
  await mkdir(content, { recursive: true });
  const first = manifest.collections[0];
  const body = first
    ? `# mndmap\n\nLive, read-only project graph generated from the source documents.\n\n<iframe title="${escapeAttribute(first.name)} graph" src="./mndmap/${first.path}/" style={{ width: '100%', minHeight: '640px', border: 0 }} />\n\n[Open all published collections](./mndmap/)\n`
    : "# mndmap\n\nNo publishable collections were found.\n";
  await writeFile(join(content, "index.mdx"), body);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return args.splice(index, 2)[1];
}

function positional(args) {
  return args[0] && !args[0].startsWith("--") ? args.shift() : undefined;
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertNoArguments(args) {
  if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
}

function escapeAttribute(value) {
  return value.replace(/[&"]/g, (character) => character === "&" ? "&amp;" : "&quot;");
}

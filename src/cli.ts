#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Mndmap } from "./service.js";
import { listenRest } from "./rest.js";
import type { Mutation } from "./types.js";

export interface CliIo {
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
  readStdin(): Promise<string>;
}

const defaultIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
  async readStdin() {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    return input;
  },
};

export async function runCli(argv = process.argv.slice(2), io: CliIo = defaultIo): Promise<void> {
  const args = [...argv];
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    io.stdout.write(help);
    return;
  }
  const root = takeOption(args, "--root") ?? process.cwd();
  const command = args.shift();
  if (command === "serve") {
    const service = await Mndmap.open(root);
    const port = integer(takeOption(args, "--port") ?? "7341", "port");
    const host = takeOption(args, "--host") ?? "127.0.0.1";
    const staticDirectory = takeOption(args, "--static");
    if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
    const { server, url } = await listenRest(service, {
      host,
      port,
      ...(staticDirectory ? { staticDirectory: resolve(root, staticDirectory) } : {}),
    });
    const stop = () => server.close(() => service.close());
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    io.stderr.write(`mndmap REST listening at ${url}\n`);
    return;
  }

  const service = await Mndmap.open(root);
  try {
    switch (command) {
      case "import":
        output(io, await service.import());
        break;
      case "list":
        await list(service, args, io);
        break;
      case "claim": {
        const owner = required(takeOption(args, "--owner"), "--owner");
        const lease = optionalInteger(takeOption(args, "--lease"), "lease");
        if (!args.length) throw new Error("At least one COLLECTION/RECORD reference is required");
        output(io, service.claim(owner, args.map(parseRef), lease));
        break;
      }
      case "renew": {
        const owner = required(takeOption(args, "--owner"), "--owner");
        const lease = optionalInteger(takeOption(args, "--lease"), "lease");
        if (!args.length) throw new Error("At least one COLLECTION/RECORD/TOKEN reference is required");
        output(io, service.renew(owner, args.map(parseClaim), lease));
        break;
      }
      case "release": {
        const owner = required(takeOption(args, "--owner"), "--owner");
        if (!args.length) throw new Error("At least one COLLECTION/RECORD/TOKEN reference is required");
        const claims = args.map(parseClaim);
        service.release(owner, claims);
        output(io, { released: claims.length });
        break;
      }
      case "apply": {
        const actor = required(takeOption(args, "--actor"), "--actor");
        const file = takeOption(args, "--file");
        if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
        const raw = file && file !== "-" ? await readFile(resolve(root, file), "utf8") : await io.readStdin();
        const parsed = JSON.parse(raw);
        const operations = (Array.isArray(parsed) ? parsed : parsed.operations) as Mutation[];
        if (!Array.isArray(operations)) throw new Error("Apply input must be an operation array or { operations }");
        output(io, { historyId: service.apply(actor, operations) });
        break;
      }
      case "changes":
        output(io, service.pendingChanges());
        break;
      case "export": {
        const force = takeFlag(args, "--force");
        const preview = takeFlag(args, "--preview");
        if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
        output(io, preview ? await service.exportPreview(force) : await service.exportApply(force));
        break;
      }
      default:
        throw new Error(`Unknown command: ${command ?? ""}`);
    }
  } finally {
    service.close();
  }
}

async function list(service: Mndmap, args: string[], io: CliIo): Promise<void> {
  const target = args.shift() ?? "collections";
  if (target === "collections") return output(io, service.collections());
  if (target === "records") {
    const collectionId = required(args.shift(), "collection ID");
    const sort = takeOption(args, "--sort");
    const direction = takeOption(args, "--direction");
    const search = takeOption(args, "--search");
    const claimed = takeOption(args, "--claimed");
    const filterValues = takeOptions(args, "--filter");
    const filters = Object.fromEntries(filterValues.map((filter) => {
      const separator = filter.indexOf("=");
      if (separator < 1) throw new Error("--filter must use FIELD=VALUE");
      return [filter.slice(0, separator), filter.slice(separator + 1)];
    }));
    if (direction && direction !== "asc" && direction !== "desc") throw new Error("--direction must be asc or desc");
    if (claimed && claimed !== "true" && claimed !== "false") throw new Error("--claimed must be true or false");
    if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
    return output(io, service.records(collectionId, {
      ...(sort ? { sort } : {}),
      ...(direction ? { direction: direction as "asc" | "desc" } : {}),
      ...(search ? { search } : {}),
      ...(claimed ? { claimed: claimed === "true" } : {}),
      ...(filterValues.length ? { filters } : {}),
    }));
  }
  if (target === "record") {
    const collectionId = required(args.shift(), "collection ID");
    const recordId = required(args.shift(), "record ID");
    const record = service.record(collectionId, recordId);
    if (!record) throw new Error(`Record not found: ${collectionId}/${recordId}`);
    return output(io, record);
  }
  throw new Error("List target must be collections, records, or record");
}

function parseRef(value: string): { collectionId: string; recordId: string } {
  const separator = value.indexOf("/");
  if (separator < 1 || separator === value.length - 1) throw new Error(`Invalid record reference: ${value}`);
  return { collectionId: value.slice(0, separator), recordId: value.slice(separator + 1) };
}

function parseClaim(value: string): { collectionId: string; recordId: string; token: number } {
  const separator = value.lastIndexOf("/");
  if (separator < 1) throw new Error(`Invalid claim reference: ${value}`);
  return { ...parseRef(value.slice(0, separator)), token: integer(value.slice(separator + 1), "claim token") };
}

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (index === args.length - 1) throw new Error(`${name} requires a value`);
  const [value] = args.splice(index, 2).slice(1);
  return value;
}

function takeOptions(args: string[], name: string): string[] {
  const values: string[] = [];
  let value: string | undefined;
  while ((value = takeOption(args, name)) !== undefined) values.push(value);
  return values;
}

function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function integer(value: string, label: string): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new Error(`${label} must be a non-negative integer`);
  return result;
}

function optionalInteger(value: string | undefined, label: string): number | undefined {
  return value === undefined ? undefined : integer(value, label);
}

function output(io: CliIo, value: unknown): void {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const help = `Usage: mndmap <command> [options]

Commands:
  import [--root PATH]
  list collections
  list records COLLECTION [--sort FIELD] [--direction asc|desc] [--search TEXT] [--claimed true|false] [--filter FIELD=VALUE]
  list record COLLECTION RECORD
  claim --owner ID [--lease SECONDS] COLLECTION/RECORD...
  renew --owner ID [--lease SECONDS] COLLECTION/RECORD/TOKEN...
  release --owner ID COLLECTION/RECORD/TOKEN...
  apply --actor ID [--file FILE|-]       Read JSON operations from stdin by default
  changes
  export --preview [--force]
  export [--force]
  serve [--host HOST] [--port PORT] [--static DIRECTORY]

Global option:
  --root PATH                            Workspace root (default: current directory)
`;

const mainPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (mainPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`mndmap: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

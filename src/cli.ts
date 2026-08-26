#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Mndmap } from "./service.js";
import { listenRest } from "./rest.js";

export interface CliIo {
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
}

const defaultIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export async function runCli(argv = process.argv.slice(2), io: CliIo = defaultIo): Promise<void> {
  // npm 10+ requires a second `--` before option-like script arguments.
  // Treat that forwarding delimiter as transport syntax, not a CLI argument.
  const args = argv.filter((argument) => argument !== "--");
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    io.stdout.write(help);
    return;
  }
  const root = takeOption(args, "--root") ?? process.cwd();
  const command = args.shift();
  const service = await Mndmap.open(root);

  try {
    switch (command) {
      case "import":
        output(io, await service.import());
        break;
      case "rescan":
        output(io, await service.rescan());
        break;
      case "graph": {
        const out = takeOption(args, "--out");
        const json = service.graphJson();
        if (out) await writeFile(resolve(root, out), json, "utf8");
        else io.stdout.write(`${json}\n`);
        break;
      }
      case "build": {
        const configFile = takeOption(args, "--config");
        output(io, await Mndmap.build(root, configFile ? { configFile } : {}));
        break;
      }
      case "emit":
        output(io, await service.emit());
        break;
      case "vocab": {
        if (args.shift() !== "--check") throw new Error("Usage: mndmap vocab --check");
        const result = service.vocabCheck();
        if (result.faults.length || result.notes.length) {
          throw new Error([
            ...result.faults.map((fault) => fault.what),
            ...result.notes.map((note) => note.what),
          ].join("\n"));
        }
        output(io, { ok: true });
        break;
      }
      case "ui": {
        const port = integer(takeOption(args, "--port") ?? "7341", "port");
        const host = takeOption(args, "--host") ?? "127.0.0.1";
        if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
        await service.import();
        const staticDirectory = resolve(fileURLToPath(new URL("../dist/ui", import.meta.url)));
        const { server, url } = await listenRest(service, { host, port, staticDirectory });
        io.stderr.write(`mndmap UI listening at ${url}\n`);
        await openBrowser(url);
        await new Promise<void>((resolvePromise) => {
          const stop = () => { server.close(() => { service.close(); resolvePromise(); }); };
          process.once("SIGINT", stop);
          process.once("SIGTERM", stop);
        });
        return;
      }
      default:
        throw new Error(`Unknown command: ${command ?? ""}`);
    }
  } finally {
    service.close();
  }
}

async function openBrowser(url: string): Promise<void> {
  spawn(process.platform === "win32" ? "cmd" : "open", process.platform === "win32" ? ["/c", "start", url] : [url], { detached: true, stdio: "ignore" });
}

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (index === args.length - 1) throw new Error(`${name} requires a value`);
  const [value] = args.splice(index, 2).slice(1);
  return value;
}

function integer(value: string, label: string): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new Error(`${label} must be a non-negative integer`);
  return result;
}

function output(io: CliIo, value: unknown): void {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const help = `Usage: mndmap <command> [options]

Commands:
  build [--root PATH] [--config FILE]
  import [--root PATH]
  rescan [--root PATH]
  graph [--out FILE]
  emit [--root PATH]
  vocab --check
  ui [--root PATH] [--host HOST] [--port PORT]

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

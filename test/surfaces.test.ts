import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { runCli, type CliIo } from "../src/cli.js";
import { createMcpServer } from "../src/mcp.js";
import { listenRest } from "../src/rest.js";
import { Mndmap } from "../src/service.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mndmap-surface-"));
  await writeFile(join(root, "work.md"), "| ID | Status |\n| -- | -- |\n| A | queued |\n");
  await writeFile(join(root, "mndmap.yaml"), "version: 1\nsources:\n  include: work.md\n");
  return root;
}

describe("phase 7 surfaces", () => {
  it("runs import and collection/record queries through the CLI", async () => {
    const root = await fixture();
    const output: string[] = [];
    const io: CliIo = {
      stdout: { write: (value) => output.push(value) },
      stderr: { write: () => undefined },
      readStdin: async () => "",
    };
    await runCli(["import", "--root", root], io);
    expect(JSON.parse(output.pop()!)).toMatchObject({ collections: 1, records: 1 });
    await runCli(["list", "collections", "--root", root], io);
    const collectionId = JSON.parse(output.pop()!)[0].id;
    await runCli(["list", "records", collectionId, "--root", root], io);
    expect(JSON.parse(output.pop()!)[0]).toMatchObject({ id: "A", values: { Status: "queued" } });
  });

  it("exposes claims, atomic apply, changes, and export preview over REST", async () => {
    const root = await fixture();
    const service = await Mndmap.open(root);
    await service.import();
    const { server, url } = await listenRest(service, { port: 0 });
    try {
      const collections = await json(url, "/collections");
      const collectionId = collections[0].id;
      const claimed = await json(url, "/claims", {
        ownerId: "rest-agent",
        refs: [{ collectionId, recordId: "A" }],
        leaseSeconds: 60,
      });
      const token = claimed.granted[0].token;
      const applied = await json(url, "/apply", {
        actor: "rest-agent",
        operations: [{ type: "update", collectionId, recordId: "A", token, values: { Status: "active" } }],
      });
      expect(applied.historyId).toBe(1);
      await json(url, "/claims/release", {
        ownerId: "rest-agent",
        claims: [{ collectionId, recordId: "A", token }],
      });
      expect(await json(url, "/changes")).toMatchObject([
        { actor: "rest-agent", operations: [{ type: "update" }], after: [{ Status: "active" }] },
      ]);
      const preview = await json(url, "/export/preview", {});
      expect(preview[0].after).toContain("| A | active |");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.close();
    }
  });

  it("registers and executes the shared operations as MCP tools", async () => {
    const root = await fixture();
    const service = await Mndmap.open(root);
    await service.import();
    const server = createMcpServer(service);
    const client = new Client({ name: "mndmap-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "list_collections", "list_records", "claim_records", "renew_claims", "release_claims",
        "apply_changes", "list_changes", "preview_export", "apply_export",
      ]));
      const called = await client.callTool({ name: "list_collections", arguments: {} });
      const content = called.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(content[0]!.text)[0]).toMatchObject({ id: "work.md#table-1" });
    } finally {
      await client.close();
      await server.close();
      service.close();
    }
  });
});

async function json(base: string, path: string, value?: unknown): Promise<any> {
  const response = await fetch(`${base}${path}`, value === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(parsed));
  return parsed;
}

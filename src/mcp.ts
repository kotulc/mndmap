#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Mndmap } from "./service.js";
import type { Mutation } from "./types.js";

const recordRef = z.object({ collectionId: z.string().min(1), recordId: z.string().min(1) });
const claimRef = recordRef.extend({ token: z.number().int().nonnegative() });
const mutation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update"), collectionId: z.string(), recordId: z.string(), token: z.number(), values: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("scratch"), collectionId: z.string(), recordId: z.string(), token: z.number(), field: z.string(), value: z.string() }),
  z.object({ type: z.literal("delete"), collectionId: z.string(), recordId: z.string(), token: z.number() }),
  z.object({ type: z.literal("create"), collectionId: z.string(), recordId: z.string(), values: z.record(z.string(), z.unknown()) }),
]);

export function createMcpServer(service: Mndmap): McpServer {
  const server = new McpServer(
    { name: "mndmap", version: "1.0.0" },
    { instructions: "Local Markdown ledger operations. Owner IDs are coordination labels, not credentials." },
  );

  server.registerTool("list_collections", {
    description: "List imported collections, fields, source regions, and write capabilities.",
    annotations: { readOnlyHint: true },
  }, () => result(service.collections()));

  server.registerTool("list_records", {
    description: "List records in a collection with optional raw filters, search, sorting, and claim filtering.",
    inputSchema: {
      collectionId: z.string().min(1),
      sort: z.string().optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      filters: z.record(z.string(), z.unknown()).optional(),
      search: z.string().optional(),
      claimed: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true },
  }, ({ collectionId, ...query }) => result(service.records(collectionId, query as Parameters<Mndmap["records"]>[1])));

  server.registerTool("get_record", {
    description: "Read one record with values, scratch fields, claim, identity, and staged state.",
    inputSchema: { collectionId: z.string().min(1), recordId: z.string().min(1) },
    annotations: { readOnlyHint: true },
  }, ({ collectionId, recordId }) => result(service.record(collectionId, recordId)));

  server.registerTool("claim_records", {
    description: "Claim every currently available record and report the denied subset.",
    inputSchema: { ownerId: z.string().min(1), refs: z.array(recordRef).min(1), leaseSeconds: z.number().positive().optional() },
  }, ({ ownerId, refs, leaseSeconds }) => result(service.claim(ownerId, refs, leaseSeconds)));

  server.registerTool("renew_claims", {
    description: "Renew claims held by an owner using current fencing tokens.",
    inputSchema: { ownerId: z.string().min(1), claims: z.array(claimRef).min(1), leaseSeconds: z.number().positive().optional() },
  }, ({ ownerId, claims, leaseSeconds }) => result(service.renew(ownerId, claims, leaseSeconds)));

  server.registerTool("release_claims", {
    description: "Idempotently release claims using their current fencing tokens.",
    inputSchema: { ownerId: z.string().min(1), claims: z.array(claimRef).min(1) },
  }, ({ ownerId, claims }) => {
    service.release(ownerId, claims);
    return result({ released: claims.length });
  });

  server.registerTool("apply_changes", {
    description: "Atomically apply generic record or scratch operations.",
    inputSchema: { actor: z.string().min(1), operations: z.array(mutation).min(1) },
    annotations: { destructiveHint: true },
  }, ({ actor, operations }) => result({ historyId: service.apply(actor, operations as Mutation[]) }));

  server.registerTool("list_changes", {
    description: "List source-backed history entries pending export.",
    annotations: { readOnlyHint: true },
  }, () => result(service.pendingChanges()));

  server.registerTool("preview_export", {
    description: "Validate pending changes and return complete before/after source patches without writing.",
    inputSchema: { forceClaims: z.boolean().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ forceClaims }) => result(await service.exportPreview(forceClaims)));

  server.registerTool("apply_export", {
    description: "Conflict-check and write pending source patches, then re-import the new baseline.",
    inputSchema: { forceClaims: z.boolean().optional() },
    annotations: { destructiveHint: true },
  }, async ({ forceClaims }) => result(await service.exportApply(forceClaims)));

  return server;
}

export async function runMcp(root = rootArgument(process.argv.slice(2))): Promise<void> {
  const service = await Mndmap.open(root);
  const server = createMcpServer(service);
  const shutdown = async () => {
    await server.close();
    service.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function rootArgument(args: string[]): string {
  const index = args.indexOf("--root");
  if (index >= 0 && !args[index + 1]) throw new Error("--root requires a value");
  return resolve(index >= 0 ? args[index + 1]! : process.env.MNDMAP_ROOT ?? process.cwd());
}

const mainPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (mainPath === fileURLToPath(import.meta.url)) {
  runMcp().catch((error) => {
    process.stderr.write(`mndmap-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

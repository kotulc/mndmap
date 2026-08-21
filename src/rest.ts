import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { z } from "zod";
import { Mndmap } from "./service.js";
import type { FieldValue, Mutation } from "./types.js";

const recordRef = z.object({ collectionId: z.string().min(1), recordId: z.string().min(1) });
const claimRef = recordRef.extend({ token: z.number().int().nonnegative() });
const mutation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update"), collectionId: z.string(), recordId: z.string(), token: z.number(), values: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("scratch"), collectionId: z.string(), recordId: z.string(), token: z.number(), field: z.string(), value: z.string() }),
  z.object({ type: z.literal("delete"), collectionId: z.string(), recordId: z.string(), token: z.number() }),
  z.object({ type: z.literal("create"), collectionId: z.string(), recordId: z.string(), values: z.record(z.string(), z.unknown()) }),
]);

export interface RestServerOptions {
  staticDirectory?: string;
}

export function createRestServer(service: Mndmap, options: RestServerOptions = {}): Server {
  return createServer(async (request, response) => {
    try {
      await route(service, request, response, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      send(response, error instanceof z.ZodError || error instanceof SyntaxError || error instanceof RequestError ? 400 : 409, { error: message });
    }
  });
}

export async function listenRest(
  service: Mndmap,
  options: { host?: string; port?: number; staticDirectory?: string } = {},
): Promise<{ server: Server; url: string }> {
  const server = createRestServer(service, options);
  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 7341, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return { server, url: `http://${host}:${address.port}` };
}

async function route(service: Mndmap, request: IncomingMessage, response: ServerResponse, options: RestServerOptions): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const apiRequest = url.pathname === "/api" || url.pathname.startsWith("/api/");
  if (apiRequest) url.pathname = url.pathname.slice(4) || "/";
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true });
  if (method === "POST" && url.pathname === "/import") return send(response, 200, await service.import());
  if (method === "GET" && url.pathname === "/collections") return send(response, 200, service.collections());
  if (method === "GET" && parts[0] === "collections" && parts[2] === "records" && parts.length === 3) {
    const filters: Record<string, FieldValue> = {};
    for (const [key, value] of url.searchParams) if (key.startsWith("filter.")) filters[key.slice(7)] = value;
    const claimedValue = url.searchParams.get("claimed");
    const directionValue = url.searchParams.get("direction");
    return send(response, 200, service.records(parts[1]!, {
      ...(url.searchParams.get("sort") ? { sort: url.searchParams.get("sort")! } : {}),
      ...(directionValue === "asc" || directionValue === "desc" ? { direction: directionValue } : {}),
      ...(url.searchParams.get("search") ? { search: url.searchParams.get("search")! } : {}),
      ...(claimedValue === "true" || claimedValue === "false" ? { claimed: claimedValue === "true" } : {}),
      ...(Object.keys(filters).length ? { filters } : {}),
    }));
  }
  if (method === "GET" && parts[0] === "collections" && parts[2] === "records" && parts.length === 4) {
    const record = service.record(parts[1]!, parts[3]!);
    return record ? send(response, 200, record) : send(response, 404, { error: "Record not found" });
  }
  if (method === "POST" && url.pathname === "/claims") {
    const input = z.object({ ownerId: z.string().min(1), refs: z.array(recordRef).min(1), leaseSeconds: z.number().positive().optional() }).parse(await body(request));
    return send(response, 200, service.claim(input.ownerId, input.refs, input.leaseSeconds));
  }
  if (method === "POST" && url.pathname === "/claims/renew") {
    const input = z.object({ ownerId: z.string().min(1), claims: z.array(claimRef).min(1), leaseSeconds: z.number().positive().optional() }).parse(await body(request));
    return send(response, 200, service.renew(input.ownerId, input.claims, input.leaseSeconds));
  }
  if (method === "POST" && url.pathname === "/claims/release") {
    const input = z.object({ ownerId: z.string().min(1), claims: z.array(claimRef).min(1) }).parse(await body(request));
    service.release(input.ownerId, input.claims);
    return send(response, 200, { released: input.claims.length });
  }
  if (method === "POST" && url.pathname === "/apply") {
    const input = z.object({ actor: z.string().min(1), operations: z.array(mutation).min(1) }).parse(await body(request));
    return send(response, 200, { historyId: service.apply(input.actor, input.operations as Mutation[]) });
  }
  if (method === "GET" && url.pathname === "/changes") return send(response, 200, service.pendingChanges());
  if (method === "POST" && (url.pathname === "/export/preview" || url.pathname === "/export/apply")) {
    const input = z.object({ forceClaims: z.boolean().optional() }).parse(await optionalBody(request));
    const patches = url.pathname.endsWith("preview")
      ? await service.exportPreview(input.forceClaims)
      : await service.exportApply(input.forceClaims);
    return send(response, 200, patches);
  }
  if (method === "GET" && !apiRequest && options.staticDirectory && await sendStatic(response, options.staticDirectory, url.pathname)) return;
  send(response, 404, { error: "Route not found" });
}

async function body(request: IncomingMessage): Promise<unknown> {
  const data = await readBody(request);
  if (!data) throw new RequestError("JSON request body is required");
  return JSON.parse(data);
}

async function optionalBody(request: IncomingMessage): Promise<unknown> {
  const data = await readBody(request);
  return data ? JSON.parse(data) : {};
}

async function readBody(request: IncomingMessage): Promise<string> {
  let data = "";
  for await (const chunk of request) {
    data += chunk;
    if (Buffer.byteLength(data) > 1_048_576) throw new RequestError("Request body exceeds 1 MiB");
  }
  return data;
}

function send(response: ServerResponse, status: number, value: unknown): void {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function sendStatic(response: ServerResponse, directory: string, pathname: string): Promise<boolean> {
  const root = resolve(directory);
  const decoded = decodeURIComponent(pathname);
  let file = resolve(root, decoded.replace(/^[/\\]+/, ""));
  if (file !== root && !file.startsWith(`${root}${sep}`)) return false;
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = resolve(file, "index.html");
    else if (!info.isFile()) return false;
  } catch (error) {
    if (!isMissing(error) || extname(file)) return false;
    file = resolve(root, "index.html");
  }
  try {
    const payload = await readFile(file);
    response.writeHead(200, {
      "content-type": contentType(file),
      "content-length": payload.byteLength,
      "cache-control": extname(file) === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    response.end(payload);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT";
}

function contentType(file: string): string {
  return ({
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".webp": "image/webp",
  } as Record<string, string>)[extname(file).toLowerCase()] ?? "application/octet-stream";
}

class RequestError extends Error {}

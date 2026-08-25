import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { z } from "zod";
import { Mndmap } from "./service.js";

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
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 7341, host, () => {
      server.off("error", reject);
      resolvePromise();
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

  if (method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true });
  if (method === "POST" && url.pathname === "/import") return send(response, 200, await service.import());
  if (method === "POST" && url.pathname === "/rescan") return send(response, 200, await service.rescan());
  if (method === "GET" && url.pathname === "/organization") return send(response, 200, service.organization());
  if (method === "GET" && url.pathname === "/graph") return send(response, 200, JSON.parse(service.graphJson()));
  if (method === "GET" && url.pathname === "/diagnostics") return send(response, 200, service.diagnostics());
  if (method === "POST" && url.pathname === "/emit/preview") return send(response, 200, await service.emitPreview());
  if (method === "POST" && url.pathname === "/emit") return send(response, 200, await service.emit());

  if (method === "POST" && url.pathname === "/organization/move") {
    const input = z.object({
      id: z.string().min(1),
      parentId: z.string().min(1),
      position: z.number().int().nonnegative().optional(),
    }).parse(await body(request));
    return send(response, 200, service.moveOrganization({
      id: input.id,
      parentId: input.parentId,
      ...(input.position === undefined ? {} : { position: input.position }),
    }));
  }
  if (method === "POST" && url.pathname === "/organization/group") {
    const input = z.object({
      parentId: z.string().min(1),
      title: z.string().min(1),
      position: z.number().int().nonnegative().optional(),
      nodeIds: z.array(z.string()).optional(),
    }).parse(await body(request));
    return send(response, 200, service.createGroup({
      parentId: input.parentId,
      title: input.title,
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.nodeIds === undefined ? {} : { nodeIds: input.nodeIds }),
    }));
  }
  if (method === "POST" && url.pathname === "/organization/rename") {
    const input = z.object({
      id: z.string().min(1),
      title: z.string().optional(),
      outputSlug: z.string().nullable().optional(),
    }).parse(await body(request));
    return send(response, 200, service.renameOrganization({
      id: input.id,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.outputSlug === undefined ? {} : { outputSlug: input.outputSlug }),
    }));
  }
  if (method === "POST" && url.pathname === "/organization/diagram") {
    const input = z.object({
      id: z.string().min(1),
      diagramRoot: z.boolean().optional(),
      diagramDepth: z.number().int().nullable().optional(),
    }).parse(await body(request));
    return send(response, 200, service.setDiagramSettings({
      id: input.id,
      ...(input.diagramRoot === undefined ? {} : { diagramRoot: input.diagramRoot }),
      ...(input.diagramDepth === undefined ? {} : { diagramDepth: input.diagramDepth }),
    }));
  }
  if (method === "POST" && url.pathname === "/reconciliation/resolve") {
    const input = z.object({
      priorNodeId: z.string().min(1),
      action: z.enum(["confirm", "new", "remove"]),
      candidateId: z.string().optional(),
    }).parse(await body(request));
    return send(response, 200, service.resolveReconciliation({
      priorNodeId: input.priorNodeId,
      action: input.action,
      ...(input.candidateId === undefined ? {} : { candidateId: input.candidateId }),
    }));
  }

  if (options.staticDirectory && method === "GET") {
    return serveStatic(options.staticDirectory, url.pathname, response);
  }
  send(response, 404, { error: "Not found" });
}

class RequestError extends Error {}

async function body(request: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function serveStatic(root: string, pathname: string, response: ServerResponse): Promise<void> {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const file = resolve(root, `.${relativePath}`);
  if (!file.startsWith(resolve(root))) throw new RequestError("Invalid path");
  try {
    const content = await readFile(file);
    response.writeHead(200, { "content-type": mime(extname(file)) });
    response.end(content);
  } catch {
    send(response, 404, { error: "Not found" });
  }
}

function mime(extension: string): string {
  return ({
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}

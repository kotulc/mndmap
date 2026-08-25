import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { block, draw_svg, review, validate } from "@mnd/kit";
import { addContainsEdges, buildGraph, deterministicOrdering } from "../graph/builder.js";
import { pageRoute, resolveRelativeTarget, sectionAnchor, slugifySegment, sourceLink } from "../routes.js";
import type { Diagnostic, EmitPreview, WorkingStoreSnapshot } from "../types.js";
import { WorkingStore } from "../working-store.js";

export async function emitPreview(snapshot: WorkingStoreSnapshot, documents: Map<string, string>): Promise<EmitPreview> {
  const diagnostics = collectPlanningDiagnostics(snapshot, documents);
  if (diagnostics.some((entry) => entry.severity === "error")) {
    return { files: [], assets: [], diagnostics };
  }
  const plan = planOutputs(snapshot, documents);
  return {
    files: plan.files.map((file) => ({ path: file.path, bytes: Buffer.byteLength(file.content, "utf8") })),
    assets: plan.assets,
    diagnostics,
  };
}

export async function emitApply(
  root: string,
  store: WorkingStore,
  snapshot: WorkingStoreSnapshot,
  documents: Map<string, string>,
): Promise<EmitPreview> {
  const preview = await emitPreview(snapshot, documents);
  if (preview.diagnostics.some((entry) => entry.severity === "error")) {
    throw new Error("Emit blocked by diagnostics");
  }
  const plan = planOutputs(snapshot, documents);
  const staging = join(root, ".mndmap", `emit-${randomUUID()}`);
  const destination = join(root, snapshot.config.destination);

  await mkdir(staging, { recursive: true });
  for (const file of plan.files) {
    const target = join(staging, file.path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }

  const backup = join(root, ".mndmap", `site-backup-${randomUUID()}`);
  try {
    await rename(destination, backup).catch(() => undefined);
    await rename(staging, destination);
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rename(backup, destination).catch(() => undefined);
    store.recordAbandonedStaging(staging);
    throw error;
  }
  return preview;
}

function collectPlanningDiagnostics(snapshot: WorkingStoreSnapshot, documents: Map<string, string>): Diagnostic[] {
  const diagnostics = [...snapshot.diagnostics];
  if (snapshot.sourceNodes.some((node) => node.resolution !== "resolved")) {
    diagnostics.push({ code: "unresolved-identity", severity: "error", message: "Unresolved or missing source nodes block emit" });
  }
  const { graph, notes } = buildGraph(snapshot);
  const withEdges = deterministicOrdering(addContainsEdges(graph));
  for (const fault of validate(withEdges)) {
    diagnostics.push({ code: "graph-validate", severity: "error", message: fault.what });
  }
  for (const note of notes) {
    diagnostics.push({ code: "graph-review", severity: "error", message: note.what });
  }
  const paths = new Set<string>();
  for (const file of planOutputs(snapshot, documents).files) {
    if (paths.has(file.path)) {
      diagnostics.push({ code: "path-collision", severity: "error", message: `Duplicate output path ${file.path}` });
    }
    paths.add(file.path);
  }
  return diagnostics;
}

interface PlannedFile { path: string; content: string }

function planOutputs(snapshot: WorkingStoreSnapshot, documents: Map<string, string>): { files: PlannedFile[]; assets: string[] } {
  const files: PlannedFile[] = [];
  const assets: string[] = [];
  const childrenByParent = new Map<string | null, typeof snapshot.organization.nodes>();
  for (const node of snapshot.organization.nodes) {
    const bucket = childrenByParent.get(node.parentId) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parentId, bucket);
  }
  for (const bucket of childrenByParent.values()) bucket.sort((left, right) => left.position - right.position);

  const sourceById = new Map(snapshot.sourceNodes.map((node) => [node.id, node]));

  const emitNode = (node: typeof snapshot.organization.nodes[number], prefix: string): string => {
    const segment = node.outputSlug ?? slugifySegment(node.title);
    const pathPrefix = node.parentId === null ? "" : `${prefix}/${segment}`.replace(/^\//, "");

    if (node.kind === "group") {
      const { graph } = buildGraph(snapshot);
      const svg = draw_svg(block.project(addContainsEdges(graph), "block_docs"));
      const landing = [
        "---",
        `title: ${node.title}`,
        "compose:",
        "  pages: []",
        "---",
        "",
        `# ${node.title}`,
        "",
        svg,
      ].join("\n");
      files.push({ path: `${pathPrefix ? `${pathPrefix}/` : ""}index.md`.replace(/^\//, ""), content: landing });
      for (const child of childrenByParent.get(node.id) ?? []) emitNode(child, pathPrefix);
      return pathPrefix;
    }

    const source = node.sourceNodeId ? sourceById.get(node.sourceNodeId) : undefined;
    if (!source) return pathPrefix;

    if (source.kind === "folder") {
      for (const child of childrenByParent.get(node.id) ?? []) emitNode(child, pathPrefix);
      return pathPrefix;
    }

    if (source.kind === "page") {
      const extension = String(source.sourceData.extension ?? ".md");
      const outputPath = `${pathPrefix}${extension}`.replace(/^\//, "");
      let content = documents.get(source.sourcePath) ?? "";
      content = rewriteLinks(content, source.sourcePath, outputPath);
      if (node.diagramRoot) {
        const { graph } = buildGraph(snapshot);
        content += `\n\n${draw_svg(block.project(addContainsEdges(graph), "block_docs"))}\n`;
      }
      files.push({ path: outputPath, content });
      return pathPrefix;
    }

    return pathPrefix;
  };

  const root = snapshot.organization.nodes.find((node) => node.id === snapshot.organization.rootId);
  if (root) emitNode(root, "");
  return { files, assets };
}

function rewriteLinks(content: string, sourcePath: string, outputPath: string): string {
  return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text: string, target: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return match;
    const hashIndex = target.indexOf("#");
    const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const hash = hashIndex >= 0 ? target.slice(hashIndex + 1) : "";
    const resolved = resolveRelativeTarget(sourcePath, pathPart || sourcePath);
    if (!resolved) return match;
    const link = sourceLink(resolved.replace(/^docs\//, ""), hash ? hash : undefined);
    return `[${text}](${link})`;
  });
}

export async function reportAbandonedStaging(store: WorkingStore): Promise<string[]> {
  const paths = store.unreportedAbandonedStaging();
  if (paths.length) store.markAbandonedStagingReported(paths);
  return paths;
}

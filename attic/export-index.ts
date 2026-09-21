import { access, copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { block, draw_svg, validate } from "@mnd/kit";
import { addContainsEdges, buildGraph, deterministicOrdering, projectLayer } from "../graph/builder.js";
import { documentWorkspacePath } from "../config.js";
import { loadMdsiteTemplate, buildNavOrder, mergeMdsiteConfig, serializeMdsiteConfig } from "./mdsite-config.js";
import { fillFrontmatter } from "../metadata.js";
import { childSegments, segmentsForPage } from "../segments.js";
import { TIER_ROOT_ID } from "../vocab/docs.js";
import { pageRoute, resolveRelativeTarget, sectionAnchor, slugifySegment, sourceLink } from "../routes.js";
import type { Diagnostic, ExportPreview, OrganizationNode, SourceNode, WorkingStoreSnapshot } from "../types.js";
import { WorkingStore } from "../working-store.js";

export async function exportPreview(
  snapshot: WorkingStoreSnapshot,
  documents: Map<string, string>,
  root?: string,
): Promise<ExportPreview> {
  const plan = planOutputs(snapshot, documents);
  const diagnostics = collectPlanningDiagnostics(snapshot, plan);
  if (root) {
    for (const asset of plan.assets) {
      try {
        await access(resolve(root, asset.workspacePath));
      } catch {
        diagnostics.push({
          code: "missing-asset",
          severity: "error",
          message: `Referenced local asset does not exist: ${asset.sourcePath}`,
          document: asset.fromDocument,
        });
      }
    }
  }
  if (diagnostics.some((entry) => entry.severity === "error")) {
    return { files: [], assets: plan.assets.map((asset) => asset.outputPath), diagnostics };
  }
  return {
    files: plan.files.map((file) => ({ path: file.path, bytes: Buffer.byteLength(file.content, "utf8") })),
    assets: plan.assets.map((asset) => asset.outputPath),
    diagnostics,
  };
}

export async function exportApply(
  root: string,
  store: WorkingStore,
  snapshot: WorkingStoreSnapshot,
  documents: Map<string, string>,
  options: { ephemeral?: boolean } = {},
): Promise<ExportPreview> {
  const preview = await exportPreview(snapshot, documents, root);
  if (preview.diagnostics.some((entry) => entry.severity === "error")) {
    throw new Error(`Export blocked by diagnostics:\n${preview.diagnostics.map((entry) => entry.message).join("\n")}`);
  }
  const plan = planOutputs(snapshot, documents);
  const stagingRoot = options.ephemeral ? join(tmpdir(), "mndmap-export") : join(root, ".mndmap");
  const staging = join(stagingRoot, `export-${randomUUID()}`);
  const destination = join(root, snapshot.config.destination);

  await mkdir(staging, { recursive: true });
  for (const file of plan.files) {
    const target = join(staging, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  for (const asset of plan.assets) {
    const target = join(staging, asset.outputPath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, asset.workspacePath), target);
  }

  const mdsiteTemplate = await loadMdsiteTemplate(root, snapshot.config);
  const mdsiteConfig = mergeMdsiteConfig(mdsiteTemplate, buildNavOrder(snapshot));
  await writeFile(join(staging, "mdsite.yaml"), serializeMdsiteConfig(mdsiteConfig), "utf8");

  const backup = join(stagingRoot, `site-backup-${randomUUID()}`);
  try {
    await rename(destination, backup).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await rename(staging, destination);
    await rm(backup, { recursive: true, force: true });
    if (options.ephemeral) await rm(stagingRoot, { recursive: true, force: true });
  } catch (error) {
    await rename(backup, destination).catch(() => undefined);
    if (!options.ephemeral) store.recordAbandonedStaging(staging);
    throw error;
  }
  return preview;
}

interface PlannedFile { path: string; content: string; sectionAnchors: string[] }
interface PlannedAsset {
  sourcePath: string;
  workspacePath: string;
  outputPath: string;
  fromDocument: string;
}
interface OutputPlan { files: PlannedFile[]; assets: PlannedAsset[]; diagnostics: Diagnostic[] }

function collectPlanningDiagnostics(snapshot: WorkingStoreSnapshot, plan: OutputPlan): Diagnostic[] {
  const diagnostics = [...snapshot.diagnostics, ...plan.diagnostics];
  if (snapshot.sourceNodes.some((node) => node.resolution !== "resolved")) {
    diagnostics.push({ code: "unresolved-identity", severity: "error", message: "Unresolved or missing source nodes block export" });
  }
  const placedSourceIds = new Set(snapshot.segmentPlacements.map((placement) => placement.sourceNodeId));
  for (const placement of snapshot.segmentPlacements) {
    const source = snapshot.sourceNodes.find((node) => node.id === placement.sourceNodeId);
    if (!source || source.resolution !== "resolved") {
      diagnostics.push({
        code: "missing-placed-segment",
        severity: "error",
        message: `Placed segment ${placement.sourceNodeId} is missing or unresolved`,
        sourceNodeId: placement.sourceNodeId,
      });
    }
  }
  for (const source of snapshot.sourceNodes.filter((node) => node.kind === "section")) {
    if (!placedSourceIds.has(source.id) && source.resolution === "missing") {
      // sections not placed are fine; only placed missing ones block
    }
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
  for (const file of plan.files) {
    if (paths.has(file.path)) {
      diagnostics.push({ code: "path-collision", severity: "error", message: `Duplicate output path ${file.path}` });
    }
    paths.add(file.path);
    const anchors = new Set<string>();
    for (const anchor of file.sectionAnchors) {
      if (anchors.has(anchor)) {
        diagnostics.push({ code: "anchor-collision", severity: "error", message: `Duplicate heading anchor '${anchor}' in ${file.path}` });
      }
      anchors.add(anchor);
    }
  }
  return diagnostics;
}

function planOutputs(snapshot: WorkingStoreSnapshot, documents: Map<string, string>): OutputPlan {
  const files: PlannedFile[] = [];
  const assets = new Map<string, PlannedAsset>();
  const diagnostics: Diagnostic[] = [];
  const childrenByParent = new Map<string | null, OrganizationNode[]>();
  for (const node of snapshot.organization.nodes) {
    const bucket = childrenByParent.get(node.parentId) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parentId, bucket);
  }
  for (const bucket of childrenByParent.values()) bucket.sort((left, right) => left.position - right.position);

  const sourceById = new Map(snapshot.sourceNodes.map((node) => [node.id, node]));
  const orgById = new Map(snapshot.organization.nodes.map((node) => [node.id, node]));
  const outputPathByContainer = new Map<string, string>();
  const outputPathBySourcePage = new Map<string, string>();

  const indexOutputs = (node: OrganizationNode, prefix: string, containerPath?: string): void => {
    const segment = node.outputSlug ?? slugifySegment(node.title);
    const pathPrefix = node.parentId === null ? "" : `${prefix}/${segment}`.replace(/^\//, "");

    if (node.kind === "group" || node.kind === "folder") {
      const landingPath = `${pathPrefix ? `${pathPrefix}/` : ""}index.md`.replace(/^\//, "");
      outputPathByContainer.set(node.id, landingPath);
      for (const child of childrenByParent.get(node.id) ?? []) indexOutputs(child, pathPrefix, landingPath);
      return;
    }

    if (node.kind === "page") {
      const source = node.sourceNodeId ? sourceById.get(node.sourceNodeId) : undefined;
      if (!source) return;
      const extension = String(source.sourceData.extension ?? ".md");
      const outputPath = `${pathPrefix}${extension}`.replace(/^\//, "");
      outputPathByContainer.set(node.id, outputPath);
      outputPathBySourcePage.set(source.sourcePath, outputPath);
      return;
    }
  };

  const root = snapshot.organization.nodes.find((node) => node.id === snapshot.organization.rootId);
  if (root) indexOutputs(root, "");

  /** Containers the source already gives a landing. mndmap generates one only
   *  where there is none, so an author's `index` page is the landing rather
   *  than a second file fighting it for the same path. */
  const landingFromSource = new Set<string>();
  for (const [containerId, landingPath] of outputPathByContainer) {
    if (orgById.get(containerId)?.kind === "page") continue;
    const supplied = (childrenByParent.get(containerId) ?? []).some((child) =>
      child.kind === "page" && outputPathByContainer.get(child.id) === landingPath);
    if (supplied) landingFromSource.add(containerId);
  }

  const sectionSources = snapshot.sourceNodes.filter((node) => node.kind === "section");
  const sectionByTarget = new Map<string, SourceNode>();
  for (const section of sectionSources) {
    const headingPath = Array.isArray(section.sourceData.headingPath) ? section.sourceData.headingPath.map(String) : [];
    sectionByTarget.set(`${section.sourcePath}#${sectionAnchor(headingPath.at(-1) ?? String(section.sourceData.title ?? ""))}`, section);
  }

  const placementBySource = new Map(snapshot.segmentPlacements.map((placement) => [placement.sourceNodeId, placement]));

  const owningOutput = (sourceNodeId: string): string | undefined => {
    const placement = placementBySource.get(sourceNodeId);
    if (!placement) return undefined;
    return outputPathByContainer.get(placement.pageOrganizationId);
  };

  const registerAsset = (sourcePath: string, fromDocument: string): string => {
    const normalized = sourcePath.replaceAll("\\", "/");
    if (normalized.includes("..") || normalized.startsWith("/")) {
      diagnostics.push({
        code: "asset-outside-source",
        severity: "error",
        message: `Local reference escapes source root: ${normalized}`,
        document: fromDocument,
      });
      return normalized;
    }
    const workspacePath = documentWorkspacePath(snapshot.config, normalized);
    const outputPath = `_assets/${normalized}`;
    assets.set(normalized, { sourcePath: normalized, workspacePath, outputPath, fromDocument });
    return outputPath;
  };

  const rewrite = (content: string, sourcePath: string, outputPath: string): string => {
    const rewriteTarget = (target: string, isAssetHint: boolean): string => {
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return target;
      const hashIndex = target.indexOf("#");
      const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
      const hash = hashIndex >= 0 ? target.slice(hashIndex + 1) : "";
      const resolved = pathPart ? resolveRelativeTarget(sourcePath, pathPart) : sourcePath;
      if (!resolved) {
        diagnostics.push({ code: "reference-outside-source", severity: "error", message: `Local reference escapes source root: ${target}`, document: sourcePath });
        return target;
      }
      const markdown = /\.(md|mdx)$/i.test(resolved);
      if (!isAssetHint && (markdown || documents.has(resolved))) {
        const section = hash ? sectionByTarget.get(`${resolved}#${sectionAnchor(hash)}`) : undefined;
        const targetOutput = section ? owningOutput(section.id) : outputPathBySourcePage.get(resolved);
        if (!targetOutput) {
          diagnostics.push({ code: "unresolved-link", severity: "error", message: `Cannot resolve internal link ${target}`, document: sourcePath });
          return target;
        }
        return sourceLink(targetOutput, section ? String(section.sourceData.title ?? hash) : (hash || undefined));
      }
      const assetOutput = registerAsset(resolved, sourcePath);
      let relative = posix.relative(posix.dirname(outputPath), assetOutput);
      if (!relative.startsWith(".") && !relative.startsWith("/")) relative = `./${relative}`;
      return relative;
    };

    let rewritten = content.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
      (_match, bang: string, text: string, target: string) =>
        `${bang}[${text}](${rewriteTarget(target, bang === "!")})`);
    rewritten = rewritten.replace(/\b(import|export)\s+([^;\n]*?\s+from\s+)?(["'])([^"']+)\3/g,
      (match, keyword: string, clause: string | undefined, quote: string, target: string) => {
        if (!target.startsWith(".")) return match;
        return `${keyword} ${clause ?? ""}${quote}${rewriteTarget(target, true)}${quote}`;
      });
    if (/\bimport\s*\(\s*[^"'`\s]/.test(rewritten) || /\bimport\s*\(\s*`[^`]*\$\{/.test(rewritten)) {
      diagnostics.push({ code: "dynamic-mdx-reference", severity: "error", message: "Dynamic local MDX imports cannot be rewritten", document: sourcePath });
    }
    return rewritten;
  };

  const sectionRange = (source: SourceNode): { start: number; end: number } | undefined => {
    const value = source.sourceData.range as { start?: unknown; end?: unknown } | undefined;
    return typeof value?.start === "number" && typeof value.end === "number"
      ? { start: value.start, end: value.end }
      : undefined;
  };

  const overrideContent = (sourceNodeId: string): string | undefined =>
    snapshot.segmentOverrides.find((override) => override.sourceNodeId === sourceNodeId && override.field === null)?.content;

  const ownSectionText = (source: SourceNode): string => {
    const overridden = overrideContent(source.id);
    if (overridden !== undefined) return overridden;
    const document = documents.get(source.sourcePath) ?? "";
    const range = sectionRange(source);
    if (!range) return "";
    const firstChild = sectionSources
      .filter((candidate) => candidate.sourcePath === source.sourcePath)
      .map(sectionRange)
      .filter((candidate): candidate is { start: number; end: number } =>
        Boolean(candidate && candidate.start > range.start && candidate.start < range.end))
      .sort((left, right) => left.start - right.start)[0];
    return document.slice(range.start, firstChild?.start ?? range.end).trimEnd();
  };

  const renderPlacedSections = (
    pageOrganizationId: string,
    parentSegmentId: string | null,
    depth: number,
    outputPath: string,
  ): { content: string; anchors: string[] } => {
    const rows = segmentsForPage(pageOrganizationId, snapshot.segmentPlacements, snapshot.segmentOverrides);
    const chunks: string[] = [];
    const anchors: string[] = [];
    for (const row of childSegments(rows, parentSegmentId)) {
      const source = sourceById.get(row.sourceNodeId);
      if (!source || source.kind !== "section") continue;
      const placement = snapshot.segmentPlacements.find((entry) =>
        entry.pageOrganizationId === pageOrganizationId && entry.sourceNodeId === row.sourceNodeId)!;
      const title = String(source.sourceData.title ?? "");
      const originalDepth = Number(source.sourceData.depth ?? depth);
      const headingDepth = Math.min(6, Math.max(depth, Number.isFinite(originalDepth) ? originalDepth : depth));
      let own = ownSectionText(source).replace(/^#{1,6}(?=\s)/, "#".repeat(headingDepth));
      own = rewrite(own, source.sourcePath, outputPath);
      chunks.push(own);
      anchors.push(sectionAnchor(title));
      const nested = renderPlacedSections(pageOrganizationId, placement.id, depth + 1, outputPath);
      if (nested.content) chunks.push(nested.content);
      anchors.push(...nested.anchors);
    }
    return { content: chunks.filter(Boolean).join("\n\n"), anchors };
  };

  const childLinks = (parentId: string): string => {
    const children = (childrenByParent.get(parentId) ?? [])
      .filter((node) => node.kind === "page" || node.kind === "group" || node.kind === "folder");
    if (children.length === 0) return "";
    const lines = children.map((child) => {
      const output = outputPathByContainer.get(child.id);
      const title = child.title;
      if (!output) return `- ${title}`;
      const route = child.kind === "group" ? pageRoute(output) : pageRoute(output);
      return `- [${title}](${route})`;
    });
    return ["", ...lines].join("\n");
  };

  const diagramFor = (nodeId: string): string => {
    if (!snapshot.config.diagrams.enabled) return "";
    const { graph, layer, depth } = projectLayer(snapshot, nodeId);
    return draw_svg(block.project(graph, layer, { n: depth }));
  };

  for (const node of snapshot.organization.nodes) {
    const outputPath = outputPathByContainer.get(node.id);
    if (!outputPath) continue;
    if (node.kind === "group" || node.kind === "folder") {
      if (landingFromSource.has(node.id)) continue;
      const svg = diagramFor(node.id);
      const links = childLinks(node.id);
      const landingBody = [
        `# ${node.title}`,
        "",
        links ? links.trimStart() : null,
        svg || null,
      ].filter((line): line is string => line !== null).join("\n");
      const landing = fillFrontmatter(`---\ntitle: ${node.title}\n---\n\n${landingBody}`);
      files.push({ path: outputPath, content: landing, sectionAnchors: [sectionAnchor(node.title)] });
      continue;
    }
    if (node.kind !== "page") continue;
    const source = node.sourceNodeId ? sourceById.get(node.sourceNodeId) : undefined;
    if (!source) continue;
    const document = documents.get(source.sourcePath) ?? "";
    const firstSectionStart = sectionSources
      .filter((section) => section.sourcePath === source.sourcePath)
      .map(sectionRange)
      .filter((range): range is { start: number; end: number } => Boolean(range))
      .sort((left, right) => left.start - right.start)[0]?.start ?? document.length;
    const preamble = rewrite(document.slice(0, firstSectionStart).trimEnd(), source.sourcePath, outputPath);
    const sections = renderPlacedSections(node.id, null, 1, outputPath);
    let content = [preamble, sections.content].filter(Boolean).join("\n\n");
    if (node.diagramRoot) content += `\n\n${diagramFor(node.id)}\n`;
    content = fillFrontmatter(content, [preamble, sections.content].filter(Boolean).join("\n\n"));
    files.push({ path: outputPath, content, sectionAnchors: sections.anchors });
  }

  return { files, assets: [...assets.values()].sort((left, right) => left.outputPath.localeCompare(right.outputPath)), diagnostics };
}

export async function reportAbandonedStaging(store: WorkingStore): Promise<string[]> {
  const paths = store.unreportedAbandonedStaging();
  if (paths.length) store.markAbandonedStagingReported(paths);
  return paths;
}

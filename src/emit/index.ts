import { access, copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { block, draw_svg, validate } from "@mnd/kit";
import { addContainsEdges, buildGraph, deterministicOrdering } from "../graph/builder.js";
import { loadMdsiteTemplate, buildNavOrder, mergeMdsiteConfig, serializeMdsiteConfig } from "./mdsite-config.js";
import { fillFrontmatter } from "../metadata.js";
import { TIER_ROOT_ID } from "../vocab/docs.js";
import { resolveRelativeTarget, sectionAnchor, slugifySegment, sourceLink } from "../routes.js";
import type { Diagnostic, EmitPreview, OrganizationNode, SourceNode, WorkingStoreSnapshot } from "../types.js";
import { WorkingStore } from "../working-store.js";

export async function emitPreview(
  snapshot: WorkingStoreSnapshot,
  documents: Map<string, string>,
  root?: string,
): Promise<EmitPreview> {
  const plan = planOutputs(snapshot, documents);
  const diagnostics = collectPlanningDiagnostics(snapshot, plan);
  if (root) {
    for (const asset of plan.assets) {
      try {
        await access(resolve(root, asset.sourcePath));
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

export async function emitApply(
  root: string,
  store: WorkingStore,
  snapshot: WorkingStoreSnapshot,
  documents: Map<string, string>,
  options: { ephemeral?: boolean } = {},
): Promise<EmitPreview> {
  const preview = await emitPreview(snapshot, documents, root);
  if (preview.diagnostics.some((entry) => entry.severity === "error")) {
    throw new Error(`Emit blocked by diagnostics:\n${preview.diagnostics.map((entry) => entry.message).join("\n")}`);
  }
  const plan = planOutputs(snapshot, documents);
  const stagingRoot = options.ephemeral ? join(tmpdir(), "mndmap-emit") : join(root, ".mndmap");
  const staging = join(stagingRoot, `emit-${randomUUID()}`);
  const destination = join(root, snapshot.config.destination);

  await mkdir(staging, { recursive: true });
  for (const file of plan.files) {
    const target = join(staging, file.path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  for (const asset of plan.assets) {
    const target = join(staging, asset.outputPath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, asset.sourcePath), target);
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
interface PlannedAsset { sourcePath: string; outputPath: string; fromDocument: string }
interface OutputPlan { files: PlannedFile[]; assets: PlannedAsset[]; diagnostics: Diagnostic[] }

function collectPlanningDiagnostics(snapshot: WorkingStoreSnapshot, plan: OutputPlan): Diagnostic[] {
  const diagnostics = [...snapshot.diagnostics, ...plan.diagnostics];
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

    if (node.kind === "group") {
      const landingPath = `${pathPrefix ? `${pathPrefix}/` : ""}index.md`.replace(/^\//, "");
      outputPathByContainer.set(node.id, landingPath);
      for (const child of childrenByParent.get(node.id) ?? []) indexOutputs(child, pathPrefix, landingPath);
      return;
    }

    const source = node.sourceNodeId ? sourceById.get(node.sourceNodeId) : undefined;
    if (!source) return;

    if (source.kind === "folder") {
      for (const child of childrenByParent.get(node.id) ?? []) indexOutputs(child, pathPrefix, containerPath);
      return;
    }

    if (source.kind === "page") {
      const extension = String(source.sourceData.extension ?? ".md");
      const outputPath = `${pathPrefix}${extension}`.replace(/^\//, "");
      outputPathByContainer.set(node.id, outputPath);
      outputPathBySourcePage.set(source.sourcePath, outputPath);
      for (const child of childrenByParent.get(node.id) ?? []) indexOutputs(child, prefix, outputPath);
      return;
    }

    if (containerPath) outputPathByContainer.set(node.id, containerPath);
    for (const child of childrenByParent.get(node.id) ?? []) indexOutputs(child, prefix, containerPath);
  };

  const root = snapshot.organization.nodes.find((node) => node.id === snapshot.organization.rootId);
  if (root) indexOutputs(root, "");

  const sectionSources = snapshot.sourceNodes.filter((node) => node.kind === "section");
  const sectionByTarget = new Map<string, SourceNode>();
  for (const section of sectionSources) {
    const headingPath = Array.isArray(section.sourceData.headingPath) ? section.sourceData.headingPath.map(String) : [];
    sectionByTarget.set(`${section.sourcePath}#${sectionAnchor(headingPath.at(-1) ?? String(section.sourceData.title ?? ""))}`, section);
  }

  const owningOutput = (node: OrganizationNode): string | undefined => {
    let cursor: OrganizationNode | undefined = node;
    while (cursor) {
      const output = outputPathByContainer.get(cursor.id);
      if (output) return output;
      cursor = cursor.parentId ? orgById.get(cursor.parentId) : undefined;
    }
    return undefined;
  };

  const sourceRoot = snapshot.config.source.root.replace(/\/$/, "");
  const registerAsset = (sourcePath: string, fromDocument: string): string => {
    const normalized = sourcePath.replaceAll("\\", "/");
    if (!normalized.startsWith(`${sourceRoot}/`)) {
      diagnostics.push({
        code: "asset-outside-source",
        severity: "error",
        message: `Local reference escapes source root: ${normalized}`,
        document: fromDocument,
      });
      return normalized;
    }
    const outputPath = `_assets/${normalized.slice(sourceRoot.length + 1)}`;
    assets.set(normalized, { sourcePath: normalized, outputPath, fromDocument });
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
        const sectionOrg = section
          ? snapshot.organization.nodes.find((entry) => entry.sourceNodeId === section.id)
          : undefined;
        const targetOutput = sectionOrg ? owningOutput(sectionOrg) : outputPathBySourcePage.get(resolved);
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
  const ownSectionText = (source: SourceNode): string => {
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

  const renderSections = (parentId: string, depth: number, outputPath: string): { content: string; anchors: string[] } => {
    const chunks: string[] = [];
    const anchors: string[] = [];
    for (const child of childrenByParent.get(parentId) ?? []) {
      const source = child.sourceNodeId ? sourceById.get(child.sourceNodeId) : undefined;
      if (!source || source.kind !== "section") continue;
      const title = String(source.sourceData.title ?? child.title);
      const originalDepth = Number(source.sourceData.depth ?? depth);
      const headingDepth = Math.min(6, Math.max(depth, Number.isFinite(originalDepth) ? originalDepth : depth));
      let own = ownSectionText(source).replace(/^#{1,6}(?=\s)/, "#".repeat(headingDepth));
      own = rewrite(own, source.sourcePath, outputPath);
      chunks.push(own);
      anchors.push(sectionAnchor(title));
      const nested = renderSections(child.id, depth + 1, outputPath);
      if (nested.content) chunks.push(nested.content);
      anchors.push(...nested.anchors);
    }
    return { content: chunks.filter(Boolean).join("\n\n"), anchors };
  };

  const diagramsEnabled = snapshot.config.diagrams.enabled;
  const { graph } = buildGraph(snapshot);
  const drawable = addContainsEdges(graph);
  for (const node of snapshot.organization.nodes) {
    const outputPath = outputPathByContainer.get(node.id);
    if (!outputPath) continue;
    if (node.kind === "group") {
      const sections = renderSections(node.id, 2, outputPath);
      const svg = diagramsEnabled ? draw_svg(block.project(drawable, node.id === snapshot.organization.rootId ? TIER_ROOT_ID : node.id)) : "";
      const landingBody = [
        `# ${node.title}`,
        "",
        sections.content,
        sections.content ? "" : null,
        svg || null,
      ].filter((line): line is string => line !== null).join("\n");
      const landing = fillFrontmatter(`---\ntitle: ${node.title}\n---\n\n${landingBody}`);
      files.push({ path: outputPath, content: landing, sectionAnchors: [sectionAnchor(node.title), ...sections.anchors] });
      continue;
    }
    const source = node.sourceNodeId ? sourceById.get(node.sourceNodeId) : undefined;
    if (!source || source.kind !== "page") continue;
    const document = documents.get(source.sourcePath) ?? "";
    const firstSectionStart = sectionSources
      .filter((section) => section.sourcePath === source.sourcePath)
      .map(sectionRange)
      .filter((range): range is { start: number; end: number } => Boolean(range))
      .sort((left, right) => left.start - right.start)[0]?.start ?? document.length;
    const preamble = rewrite(document.slice(0, firstSectionStart).trimEnd(), source.sourcePath, outputPath);
    const sections = renderSections(node.id, 1, outputPath);
    let content = [preamble, sections.content].filter(Boolean).join("\n\n");
    if (diagramsEnabled && node.diagramRoot) content += `\n\n${draw_svg(block.project(drawable, node.id))}\n`;
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

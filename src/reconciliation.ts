import type { SourceNode } from "./types.js";
import { locatorKey } from "./source-nodes.js";

export interface ReconciliationResult {
  nodes: SourceNode[];
  unresolved: Array<{ priorId: string; candidates: string[] }>;
  missing: string[];
}

export function reconcileSourceNodes(
  scanned: SourceNode[],
  prior: SourceNode[],
): ReconciliationResult {
  const priorByExplicit = new Map(prior.filter((node) => node.explicitKey).map((node) => [node.explicitKey!, node]));
  const priorByLocator = new Map(prior.map((node) => [locatorKey(node), node]));
  const priorByFingerprint = new Map<string, SourceNode[]>();

  for (const node of prior) {
    const key = `${node.contentFingerprint}\0${node.shapeFingerprint}`;
    const bucket = priorByFingerprint.get(key) ?? [];
    bucket.push(node);
    priorByFingerprint.set(key, bucket);
  }

  const matchedPrior = new Set<string>();
  const nodes: SourceNode[] = [];
  const unresolved: Array<{ priorId: string; candidates: string[] }> = [];

  for (const node of scanned) {
    let match: SourceNode | undefined;

    if (node.explicitKey) {
      const explicit = priorByExplicit.get(node.explicitKey);
      if (explicit && !matchedPrior.has(explicit.id)) match = explicit;
    }

    if (!match) {
      const locator = priorByLocator.get(locatorKey(node));
      if (locator && !matchedPrior.has(locator.id)
        && locator.contentFingerprint === node.contentFingerprint
        && locator.shapeFingerprint === node.shapeFingerprint) {
        match = locator;
      }
    }

    if (!match) {
      const bucket = priorByFingerprint.get(`${node.contentFingerprint}\0${node.shapeFingerprint}`) ?? [];
      const candidates = bucket.filter((candidate) => !matchedPrior.has(candidate.id));
      if (candidates.length === 1) match = candidates[0];
      else if (candidates.length > 1) {
        unresolved.push({ priorId: candidates[0]!.id, candidates: candidates.map((candidate) => candidate.id) });
        nodes.push({ ...node, resolution: "unresolved", candidates: candidates.map((candidate) => candidate.id) });
        continue;
      }
    }

    if (match) {
      matchedPrior.add(match.id);
      nodes.push({ ...node, id: match.id, resolution: "resolved" });
    } else {
      nodes.push({ ...node, resolution: "resolved" });
    }
  }

  const missing = prior
    .filter((node) => !matchedPrior.has(node.id))
    .map((node) => node.id);

  for (const priorId of missing) {
    const node = prior.find((entry) => entry.id === priorId);
    if (node) nodes.push({ ...node, resolution: "missing", scanId: scanned[0]?.scanId ?? node.scanId });
  }

  return { nodes, unresolved, missing };
}

export function resolveReconciliation(
  nodes: SourceNode[],
  priorId: string,
  action: "confirm" | "new" | "remove",
  candidateId?: string,
): SourceNode[] {
  const next = [...nodes];
  if (action === "remove") {
    return next.filter((node) => node.id !== priorId);
  }
  if (action === "new") {
    return next.map((node) => node.id === priorId ? { ...node, resolution: "missing" as const } : node);
  }
  if (action === "confirm" && candidateId) {
    const scanned = next.find((node) => node.candidates?.includes(priorId) || node.id === candidateId);
    const prior = next.find((node) => node.id === priorId);
    if (!scanned || !prior) return next;
    return next
      .filter((node) => node.id !== scanned.id && node.id !== priorId)
      .concat([{ ...scanned, id: prior.id, resolution: "resolved" as const }]);
  }
  return next;
}

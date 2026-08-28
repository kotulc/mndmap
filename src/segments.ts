import type { SegmentOverride, SegmentPlacement, SourceNode } from "./types.js";

export interface SegmentRow {
  sourceNodeId: string;
  pageOrganizationId: string;
  parentSegmentId: string | null;
  position: number;
  overrides: SegmentOverride[];
}

/** Seed segment placements for a page from its source sections in document order. */
export function seedPlacementsForPage(
  pageOrganizationId: string,
  pageSourcePath: string,
  sections: SourceNode[],
): SegmentPlacement[] {
  const pageSections = sections
    .filter((node) => node.sourcePath === pageSourcePath && node.kind === "section")
    .sort((left, right) => {
      const leftStart = Number((left.sourceData.range as { start?: number })?.start ?? 0);
      const rightStart = Number((right.sourceData.range as { start?: number })?.start ?? 0);
      return leftStart - rightStart;
    });

  const placementByHeadingPath = new Map<string, string>();
  const placements: SegmentPlacement[] = [];

  for (const [index, section] of pageSections.entries()) {
    const headingPath = Array.isArray(section.sourceData.headingPath)
      ? section.sourceData.headingPath.map(String)
      : [];
    const parentHeadingPath = headingPath.slice(0, -1).join("/");
    const parentSegmentId = parentHeadingPath ? placementByHeadingPath.get(parentHeadingPath) ?? null : null;
    const placementId = `seg:${pageOrganizationId}:${section.id}`;
    placementByHeadingPath.set(headingPath.join("/"), placementId);
    placements.push({
      id: placementId,
      sourceNodeId: section.id,
      pageOrganizationId,
      parentSegmentId,
      position: index,
    });
  }

  return placements;
}

export function segmentsForPage(
  pageOrganizationId: string,
  placements: SegmentPlacement[],
  overrides: SegmentOverride[],
): SegmentRow[] {
  const overridesBySource = new Map<string, SegmentOverride[]>();
  for (const override of overrides) {
    const bucket = overridesBySource.get(override.sourceNodeId) ?? [];
    bucket.push(override);
    overridesBySource.set(override.sourceNodeId, bucket);
  }

  return placements
    .filter((placement) => placement.pageOrganizationId === pageOrganizationId)
    .sort((left, right) => left.position - right.position)
    .map((placement) => ({
      sourceNodeId: placement.sourceNodeId,
      pageOrganizationId: placement.pageOrganizationId,
      parentSegmentId: placement.parentSegmentId,
      position: placement.position,
      overrides: overridesBySource.get(placement.sourceNodeId) ?? [],
    }));
}

/** Direct children of a parent segment (or page root when parentSegmentId is null). */
export function childSegments(
  rows: SegmentRow[],
  parentSegmentId: string | null,
): SegmentRow[] {
  return rows
    .filter((row) => row.parentSegmentId === parentSegmentId)
    .sort((left, right) => left.position - right.position);
}

export function normalizeSegmentPositions(
  placements: SegmentPlacement[],
  pageOrganizationId: string,
  parentSegmentId: string | null,
): SegmentPlacement[] {
  const siblings = placements
    .filter((placement) =>
      placement.pageOrganizationId === pageOrganizationId
      && placement.parentSegmentId === parentSegmentId)
    .sort((left, right) => left.position - right.position);
  const positions = new Map(siblings.map((placement, index) => [placement.id, index]));
  return placements.map((placement) =>
    positions.has(placement.id) ? { ...placement, position: positions.get(placement.id)! } : placement);
}

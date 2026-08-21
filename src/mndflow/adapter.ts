import type { FieldDefinition, FieldValue, RecordView } from "../types.js";

/**
 * The intentionally small, serializable envelope shared with mndflow-shaped
 * consumers. It does not import or reproduce mndflow's application model.
 */
export interface Graph {
  id: string;
  elements: Element[];
  edges: Edge[];
}

export interface Element {
  id: string;
  kind: "record";
  label: string;
  order: number;
  data: {
    collectionId: string;
    values: Record<string, FieldValue>;
    scratch: Record<string, string>;
    claimed: boolean;
    staged: boolean;
  };
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  kind: "order";
}

export interface GraphCollection {
  id: string;
  name: string;
  fields: FieldDefinition[];
}

export function toMndflowGraph(collection: GraphCollection, records: readonly RecordView[]): Graph {
  const ordered = [...records].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const labelField = collection.fields.find((field) => field.sourceBacked)?.id;
  const elements = ordered.map((record): Element => ({
    id: record.id,
    kind: "record",
    label: displayLabel(record, labelField),
    order: record.order,
    data: {
      collectionId: record.collectionId,
      values: { ...record.values },
      scratch: { ...record.scratch },
      claimed: record.claim !== null,
      staged: record.staged,
    },
  }));

  return {
    id: collection.id,
    elements,
    edges: elements.slice(1).map((element, index) => ({
      id: `order:${elements[index]!.id}:${element.id}`,
      source: elements[index]!.id,
      target: element.id,
      kind: "order",
    })),
  };
}

function displayLabel(record: RecordView, labelField: string | undefined): string {
  const value = labelField ? record.values[labelField] : undefined;
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return record.id;
}

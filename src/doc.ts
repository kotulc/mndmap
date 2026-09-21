/** The vocabularies a translated collection speaks.
 *
 *  mndflow ships these as packages, so a translated file opens there with its
 *  look. mndmap reads them rather than carrying a copy: the JSON below is the
 *  pinned release's, byte for byte, and `mndflow-pin.json` says which commit
 *  it came from. What mndmap adds is the ids, so the reader and the emitter
 *  name the same things the package does. */

import type { Definition, Graph, Id } from "@mnd/kit";
import doc_package from "./packages/doc.json" with { type: "json" };
import req_package from "./packages/requirements.json" with { type: "json" };

/** The kit names these in its types but does not export them, so they are
 *  taken from the one shape that does travel. */
export type Holder = Graph["holders"][string];
export type Package = Graph["packages"][string];

/** The set every collection is filed under. */
export const TIER_ROOT = "doc";

export const SET = "doc.set";
export const PAGE = "doc.page";
export const SECTION = "doc.section";
export const ITEM = "doc.item";
export const CODE = "doc.code";
export const LINK = "doc.link";

/** The kit's own holder definitions. A table and a list need none of their
 *  own: a holder is not a block, and these two carry the look one draws with. */
export const GRID = "grid";
export const GROUP = "group";

/** `doc.section` carries the heading depth; `doc.code` the fence's word. */
export const LEVEL = "level";
export const LANG = "lang";
/** A task's box. The package says nothing about one, so it is a field on the
 *  usage rather than a definition of its own. */
export const DONE = "done";

/** A relation some body in the collection already carries, so the emitter
 *  writes it nowhere else. Where a definition reads a line the other way the
 *  mark stays: the link is still written, just on the page that named it.
 *  A line has tags and no fields, so this is said as a word. */
export const IN_BODY = "body";

/** One file mndflow ships: its id, its name, and the definitions in it. */
interface Vocabulary {
  id: string;
  name: string;
  defs: Record<Id, Definition>;
}

const SHIPPED: Vocabulary[] = [vocabulary(doc_package), vocabulary(req_package)];


/** Every package a set of type ids reaches, and the definitions in each.
 *  A vocabulary is a package and a map, so which ones are loaded is read from
 *  the map rather than declared. */
export function packages_for(types: Iterable<Id>): Vocabulary[] {
  const families = new Set([...types].map((type) => type.split(".")[0]));
  return SHIPPED.filter((shipped) =>
    Object.keys(shipped.defs).some((id) => families.has(id.split(".")[0]!)));
}

/** A graph with those packages in it, registered and merged. */
export function with_packages(graph: Graph, wanted: Vocabulary[]): Graph {
  const packages: Record<Id, Package> = { ...graph.packages };
  const defs: Record<Id, Definition> = { ...graph.defs };
  for (const held of wanted) {
    packages[held.id] = { id: held.id, name: held.name };
    for (const [id, definition] of Object.entries(held.defs)) defs[id] = definition;
  }
  return { ...graph, packages, defs };
}


/** One field's value, or undefined where the block does not carry it. */
export function field(fields: { name: string; value?: string }[] | undefined, name: string): string | undefined {
  return fields?.find((entry) => entry.name === name)?.value;
}

/** The same fields with one name set, in place or appended. An empty value
 *  drops the field, so clearing one leaves no blank row behind. */
export function with_field<T extends { name: string; value?: string }>(fields: T[] | undefined, next: T): T[] {
  const held = fields ?? [];
  const at = held.findIndex((entry) => entry.name === next.name);
  if (!next.value) return held.filter((entry) => entry.name !== next.name);
  if (at < 0) return [...held, next];
  return [...held.slice(0, at), next, ...held.slice(at + 1)];
}

/** Whether a type is one of a shipped vocabulary's. */
export function is_shipped(type: Id | undefined): boolean {
  return Boolean(type) && SHIPPED.some((held) => Boolean(held.defs[type!]));
}


function vocabulary(file: unknown): Vocabulary {
  const held = file as { id: string; graph: { defs: Record<Id, Definition> } };
  return { id: held.id, name: held.id, defs: held.graph.defs };
}

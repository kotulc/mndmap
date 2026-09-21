/** Every shape mndmap passes around: the config, the map, and what the
 *  translator hands back. The graph itself is the kit's — nothing here
 *  redeclares one. */

import type { Id } from "@mnd/kit";


/** Where a page takes its name from, in order of preference. */
export type NameSource = "title" | "heading" | "filename";

/** One `map` section: what each markdown construct becomes. Every value is
 *  from a closed set, so a map is data rather than code. */
export interface DocMap {
  folder: { as: "doc.set" };
  page: { as: "doc.page"; name: NameSource[] };
  section: { as: "doc.section"; depth: number; beyond: "body" | "block" };
  prose: "body";
  frontmatter: { as: "fields"; tags: "tags"; related: "relation" };
  link: { as: "relation" | "body"; type: Id; external: "relation" | "body" };
  /** `rows` makes one block per data row, of `type`, named by the `key`
   *  column and carrying the rest as fields. */
  table: { as: "grid" | "body" | "rows"; header: "row"; type: Id; key: string };
  list: { as: "body" | "group" };
  task: { as: "body" | "block" };
  fence: { as: "body" | "block" };
  image: "body";
}

/** A different map under a heading path. */
export interface MapOverride {
  under: string[];
  map: Partial<DocMap>;
}

export interface Config {
  version: 2;
  source: { root: string; include: string[]; exclude: string[] };
  destination: string;
  publish?: { mdsite: string };
  suggest: { taggly: string | null; count: number };
  map: DocMap;
  overrides: MapOverride[];
}


/** One document on the way in. `path` is relative to `source.root`. */
export interface SourceFile {
  path: string;
  text: string;
}

/** One file on the way out. `path` is relative to the collection root. */
export interface OutFile {
  path: string;
  text: string;
}

/** An asset to copy verbatim, named by where it came from. */
export interface OutAsset {
  path: string;
  from: string;
}

/** What a run became, and what it could not read. */
export interface Report {
  sets: number;
  pages: number;
  sections: number;
  holders: number;
  relations: number;
  faults: string[];
}

/** Up to `suggest.count` candidates per block or relation. Read-only, keyed
 *  by the id it is about, and never emitted. */
export type Suggestions = Record<Id, {
  name?: string[];
  tags?: string[];
  group?: string[];
  type?: Id[];
}>;

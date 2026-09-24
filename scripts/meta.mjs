/** Section metadata for a collection of markdown documents, from taggly.
 *
 *  Every document is cut into sections (see `meta/sections.mjs`) and every
 *  section into passages taggly can read. Each stage runs over every passage
 *  of the collection at once, in batches; identical passages are asked about
 *  once, and anything already in the cache not at all. Then the answers are
 *  gathered back onto their sections, one JSON file per document, and the
 *  connections between sections into one index.
 *
 *  | Stage | Gives a section |
 *  |---|---|
 *  | `key`   | keywords |
 *  | `ent`   | named entities |
 *  | `embed` | a vector, used for `related` in the index and then dropped |
 *  | `ext`   | typed concepts, one list per `--kinds` group (a language model; the slow one) |
 *  | `rel`   | `[from, verb, to]` triples between its concepts (opt in; slower still) |
 *
 *  Usage: npm run meta -- <file or folder>... [--out meta] [--stages key,ent,embed,ext]
 *         [--taggly http://127.0.0.1:8000] [--batch 16] [--kinds "concepts, entities, topics"]
 *         [--fresh ent,ext]   (ask these stages again: the cache cannot see taggly's code change)
 *
 *  Writes <out>/docs/<doc>.json, <out>/index.json, and <out>/cache.jsonl. */

import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import { collect } from "./meta/collect.mjs";
import { chunks, sections } from "./meta/sections.mjs";
import { cache, key, run, status } from "./meta/taggly.mjs";


/** Every stage, in the order it runs; `rel` reads what `ext` found. */
const STAGES = ["key", "ent", "embed", "ext", "rel"];

/** Stages that call a language model, batched smaller so progress lands often. */
const SLOW = new Set(["ext", "rel"]);

/** A section with less prose than this is a heading over its subsections: nothing to tag. */
const LEAST = 40;

/** How many terms a section keeps per group, and a document per group. */
const KEEP = 8;
const SUMMARY = 12;

/** How many concept names `rel` is shown for one passage. */
const TERMS = 12;


const { values: opts, positionals: inputs } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "meta" },
    taggly: { type: "string", default: "http://127.0.0.1:8000" },
    stages: { type: "string", default: "key,ent,embed,ext" },
    batch: { type: "string", default: "16" },
    cap: { type: "string", default: "800" },
    kinds: { type: "string", default: "concepts, entities, topics" },
    relations: { type: "string" },
    fresh: { type: "string", default: "" },
    timeout: { type: "string", default: "600000" },
  },
});

if (!inputs.length) {
  console.error("usage: npm run meta -- <file or folder>... [--out meta] [--stages key,ent,embed,ext]");
  process.exit(2);
}

const stages = opts.stages.split(",").map((s) => s.trim()).filter(Boolean);
const unknown = stages.filter((s) => !STAGES.includes(s));
if (unknown.length) fail(`unknown stage: ${unknown.join(", ")} (known: ${STAGES.join(", ")})`);
if (stages.includes("rel") && !stages.includes("ext")) fail("rel needs ext: its terms are ext's concepts");

main().catch((error) => fail(error.message));


async function main() {
  const began = Date.now();
  const models = await status(opts.taggly);
  mkdirSync(join(opts.out, "docs"), { recursive: true });
  const store = cache(join(opts.out, "cache.jsonl"));

  // Documents → sections → passages, each distinct passage once
  const docs = read(inputs);
  const passages = [];
  const seen = new Map();
  for (const doc of docs) {
    for (const section of doc.sections) {
      section.passages = section.body < LEAST ? [] : chunks(section.text, Number(opts.cap)).map((text) => {
        if (!seen.has(text)) { seen.set(text, passages.length); passages.push(text); }
        return seen.get(text);
      });
    }
  }
  const tagged = docs.reduce((n, doc) => n + doc.sections.filter((s) => s.passages.length).length, 0);
  say(`${docs.length} documents, ${tagged} sections to tag, ${passages.length} distinct passages`);

  // Each stage over every passage; answers land in the store as they come
  const errors = [];
  const found = {};
  for (const stage of STAGES.filter((s) => stages.includes(s))) {
    found[stage] = await pass(stage, models[stage]?.model ?? "", passages, found, store, errors);
  }

  // Answers back onto sections; one file per document, then the index
  for (const doc of docs) {
    for (const section of doc.sections) gather(section, found);
    write(join(opts.out, "docs", `${doc.id}.json`), shape(doc));
  }
  const index = collect(docs, { least: 2, top: 5, floor: 0.5 });
  write(join(opts.out, "index.json"), {
    generated: new Date().toISOString(),
    taggly: { url: opts.taggly, stages, models: Object.fromEntries(stages.map((s) => [s, models[s]?.model])) },
    documents: docs.map((doc) => ({ id: doc.id, title: doc.title, sections: doc.sections.length })),
    ...index,
    errors,
  });

  const took = ((Date.now() - began) / 1000).toFixed(1);
  say(`wrote ${docs.length} documents, ${Object.keys(index.terms).length} shared terms, `
    + `${index.related.length} related pairs, ${index.links.length} links to ${opts.out} in ${took}s`
    + (errors.length ? ` — ${errors.length} passages failed, listed in index.json` : ""));
}


/** One stage over every passage: what the cache holds, plus what taggly answers now. */
async function pass(stage, model, passages, found, store, errors) {
  const params = stage_params(stage);
  const inputs = passages.map((text, n) => stage_input(stage, text, found.ext?.[n]));
  const keys = inputs.map((input) => input && key(stage, model, params, input));
  const fresh = opts.fresh.split(",").map((s) => s.trim()).includes(stage);
  const answers = keys.map((k) => (k && !fresh ? store.held.get(k) : undefined));
  const asked = keys.flatMap((k, n) => (k && answers[n] === undefined ? [n] : []));

  say(`[${stage}] ${asked.length} to ask, ${keys.filter(Boolean).length - asked.length} cached`);
  if (!asked.length) return answers;

  const began = Date.now();
  let landed = 0;
  await run(opts.taggly, stage, params, asked.map((n) => inputs[n]), {
    size: SLOW.has(stage) ? Number(opts.batch) : Number(opts.batch) * 4,
    timeout: Number(opts.timeout),
    done: (i, output) => {
      const n = asked[i];
      answers[n] = stage_value(stage, output);
      store.put(keys[n], answers[n]);
      if (++landed % (SLOW.has(stage) ? Number(opts.batch) : 256) === 0) progress(stage, landed, asked.length, began);
    },
    failed: (i, error) => {
      errors.push({ stage, passage: passages[asked[i]].slice(0, 80), error: error.message });
      say(`[${stage}] failed: ${error.message.slice(0, 160)}`);
    },
  });
  progress(stage, landed, asked.length, began);
  return answers;
}

/** The query params a stage is called with. */
function stage_params(stage) {
  // Single words: without MMR, KeyBERT's pairs are one word shuffled; ext gives the phrases
  if (stage === "key") return { top_n: KEEP, ngram_max: 1, normalize: true };
  if (stage === "ent") return { top_n: KEEP, max_ngram: 3 };
  if (stage === "ext") return { concepts: opts.kinds, top_n: KEEP, max_ngram: 3 };
  if (stage === "rel" && opts.relations) return { relations: opts.relations };
  return {};
}

/** One passage as a stage's input, or null where the stage has nothing to ask. */
function stage_input(stage, text, ext) {
  if (stage === "embed") return { texts: [text] };
  if (stage !== "rel") return { content: text };
  const terms = [...new Set(Object.values(ext ?? {}).flat())].slice(0, TERMS);
  return terms.length >= 2 ? { content: text, terms } : null;
}

/** The part of a stage's output worth keeping. */
function stage_value(stage, output) {
  if (stage === "key") return output.keywords;
  if (stage === "ent") return output.entities;
  if (stage === "embed") return output.vectors[0].map((x) => Math.round(x * 1e4) / 1e4);
  if (stage === "ext") return output.concepts;
  return output.triples;
}

/** A section's passages' answers, merged: lists in first-seen order, one mean vector. */
function gather(section, found) {
  const each = (stage) => section.passages.map((n) => found[stage]?.[n]).filter(Boolean);
  const merge = (lists) => [...new Set(lists.flat())].slice(0, KEEP);

  if (found.key) section.keywords = merge(each("key"));
  if (found.ent) section.entities = merge(each("ent"));
  if (found.ext) {
    const groups = each("ext");
    section.concepts = Object.fromEntries(
      [...new Set(groups.flatMap(Object.keys))].map((g) => [g, merge(groups.map((c) => c[g] ?? []))]),
    );
  }
  if (found.rel) {
    const triples = each("rel").flat();
    section.relations = [...new Map(triples.map((t) => [t.join("\u0000"), t])).values()];
  }
  if (found.embed) section.vector = mean(each("embed"));
}

/** A document as written: its sections without passages or vectors, and its
 *  most common terms per group as the document's own. */
function shape(doc) {
  const out = doc.sections.map(({ passages, vector, ...section }) => section);
  const top = (lists) => {
    const count = new Map();
    for (const term of lists.flat()) count.set(term, (count.get(term) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).slice(0, SUMMARY).map(([term]) => term);
  };
  const groups = [...new Set(out.flatMap((s) => Object.keys(s.concepts ?? {})))];
  return {
    id: doc.id, source: doc.source, title: doc.title, front: doc.front,
    keywords: top(out.map((s) => s.keywords ?? [])),
    entities: top(out.map((s) => s.entities ?? [])),
    concepts: Object.fromEntries(groups.map((g) => [g, top(out.map((s) => s.concepts?.[g] ?? []))])),
    sections: out,
  };
}

/** Every markdown file under the inputs, read into sections. A file that will
 *  not read is reported and skipped, not fatal. Ids are paths relative to the
 *  folder given, or the file's own name. */
function read(paths) {
  const docs = [];
  for (const input of paths) {
    const folder = statSync(input).isDirectory();
    for (const file of folder ? walk(input) : [input]) {
      try {
        const id = (folder ? relative(input, file) : basename(file)).split(sep).join("/");
        docs.push({ id, source: file, ...sections(readFileSync(file, "utf8")) });
      } catch (error) {
        say(`skipped ${file}: ${error.message}`);
      }
    }
  }
  return docs;
}

/** Markdown files under a folder, depth first, in name order. */
function walk(folder) {
  return readdirSync(folder, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return entry.name.startsWith(".") || entry.name === "node_modules" ? [] : walk(path);
      return entry.name.endsWith(".md") ? [path] : [];
    });
}

/** The unit-length mean of some unit vectors, or nothing. */
function mean(vectors) {
  if (!vectors.length) return undefined;
  const sum = vectors[0].map((_, i) => vectors.reduce((total, v) => total + v[i], 0));
  const length = Math.hypot(...sum) || 1;
  return sum.map((x) => x / length);
}

/** Write JSON through a temporary file, so a crash never leaves half a file. */
function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 1));
  renameSync(`${path}.tmp`, path);
}

function progress(stage, landed, total, began) {
  const seconds = (Date.now() - began) / 1000;
  const left = landed ? (seconds / landed) * (total - landed) : 0;
  say(`[${stage}] ${landed}/${total} in ${seconds.toFixed(1)}s${landed < total ? `, ~${left.toFixed(0)}s left` : ""}`);
}

function say(line) {
  console.log(line);
}

function fail(line) {
  console.error(`meta: ${line}`);
  process.exit(1);
}

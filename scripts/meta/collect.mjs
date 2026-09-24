/** What connects a collection's sections to each other.
 *
 *  Three kinds of connection, each from data the sections already carry:
 *
 *  | Connection | From |
 *  |---|---|
 *  | `terms`   | the same term named in two or more sections, in any tag group |
 *  | `related` | sections whose passages sit close in embedding space |
 *  | `links`   | a markdown link from a section to another document of the collection |
 *
 *  Pure: sections in, index out. */

import { posix } from "node:path";


/** Articles dropped from the front of a term before comparing it. */
const ARTICLES = /^(a|an|the)\s+/;


/** The collection index over every document's sections. */
export function collect(docs, { least, top, floor }) {
  const refs = docs.flatMap((doc) => doc.sections.map((s) => ({ ref: `${doc.id}#${s.id}`, doc, section: s })));
  return {
    terms: terms(refs, least),
    related: related(refs.filter((r) => r.section.vector), top, floor),
    links: links(refs, new Set(docs.map((doc) => doc.id))),
  };
}

/** A term's comparable form: lowercase, no backticks or quotes, no leading
 *  article, no trailing plural. `parsers` and `the parser` are one term. */
export function norm(term) {
  const bare = term.toLowerCase().replace(/[`"'*]/g, "").replace(/\s+/g, " ").trim().replace(ARTICLES, "");
  return bare.length > 3 && /[^s]s$/.test(bare) ? bare.slice(0, -1) : bare;
}


/** Every term named in at least `least` sections: its most common spelling,
 *  how often each tag group named it, and the sections that do. */
function terms(refs, least) {
  const found = new Map();
  for (const { ref, section } of refs) {
    for (const [group, term] of tagged(section)) {
      const form = norm(term);
      if (form.length < 2 || !/\p{L}/u.test(form)) continue;
      const entry = found.get(form) ?? { spellings: new Map(), kinds: {}, sections: new Set() };
      entry.spellings.set(term, (entry.spellings.get(term) ?? 0) + 1);
      entry.kinds[group] = (entry.kinds[group] ?? 0) + 1;
      entry.sections.add(ref);
      found.set(form, entry);
    }
  }

  const out = {};
  for (const [form, entry] of found) {
    if (entry.sections.size < least) continue;
    const name = [...entry.spellings].sort((a, b) => b[1] - a[1])[0][0];
    out[form] = { name, kinds: entry.kinds, sections: [...entry.sections] };
  }
  return out;
}

/** A section's tags as `[group, term]` pairs: its keywords, entities, each
 *  concept group, and the code spans and bold terms it marks. */
function tagged(section) {
  return [
    ...(section.keywords ?? []).map((t) => ["keyword", t]),
    ...(section.entities ?? []).map((t) => ["entity", t]),
    ...Object.entries(section.concepts ?? {}).flatMap(([group, list]) => list.map((t) => [group, t])),
    ...section.marks.code.map((t) => ["code", t]),
    ...section.marks.strong.map((t) => ["strong", t]),
  ];
}

/** For each section, its `top` nearest others at cosine `floor` or above,
 *  each pair listed once. Vectors are unit length, so a dot product is the cosine. */
function related(refs, top, floor) {
  // One flat buffer, and each pair scored once for both its ends: the scan is
  // quadratic, so this is where a large collection spends its time
  const width = refs[0]?.section.vector.length ?? 0;
  const flat = new Float32Array(refs.length * width);
  refs.forEach((r, n) => flat.set(r.section.vector, n * width));

  const near = refs.map(() => []);
  for (let a = 0; a < refs.length; a++) {
    for (let b = a + 1; b < refs.length; b++) {
      let score = 0;
      for (let i = 0, x = a * width, y = b * width; i < width; i++) score += flat[x + i] * flat[y + i];
      if (score < floor) continue;
      near[a].push([b, score]);
      near[b].push([a, score]);
    }
  }

  const pairs = new Map();
  near.forEach((list, a) => {
    list.sort((x, y) => y[1] - x[1]);
    for (const [b, score] of list.slice(0, top)) {
      const [low, high] = a < b ? [a, b] : [b, a];
      pairs.set(`${low} ${high}`, { a: refs[low].ref, b: refs[high].ref, score: round(score) });
    }
  });
  return [...pairs.values()].sort((x, y) => y.score - x.score);
}

/** Links from a section to another document of the collection, by relative path. */
function links(refs, ids) {
  const out = [];
  for (const { ref, doc, section } of refs) {
    for (const { text, href } of section.marks.links) {
      if (/^[a-z]+:/i.test(href) || href.startsWith("#")) continue;
      const [path, anchor] = href.split("#");
      const target = posix.normalize(posix.join(posix.dirname(doc.id), decode(path)));
      if (ids.has(target)) out.push({ from: ref, to: target, ...(anchor ? { anchor } : {}), text });
    }
  }
  return out;
}

/** A link path with its escapes undone, or as written when they are malformed. */
function decode(path) {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}

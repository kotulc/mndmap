---
name: Concept map
overview: Replace the document lattice with a concept map. A block is a concept named across the collection, defined once and referenced wherever a page speaks of it. Taggly finds and types the concepts and the relations the text states; mndmap merges, ranks, lays out, and links them back to their sections.
---

# Concept map

A diagram that mirrors headings is a table of contents in boxes. The value of a diagram is what the prose does not show at a glance: **what the collection is about, how those things relate, and where each one is explained.**

A block is now a **concept** — a component, artifact, command, setting or term the collection names. It is defined once, in a per-collection vocabulary, and appears on any layer as a reference (`of`). Sections stay what they are: the outline in the tray and the anchors every box links to.

## What landed, and why it fails

| Symptom | Cause |
|---|---|
| Every section, list and fence is its own box | the projection is a 1:1 transcription of the parse tree (`introduceBodies`, `placeLattice`) |
| Every box shows the same content | [Tray.tsx:70](src/ui/Tray.tsx#L70) renders the whole page outline for any content block |
| Boxes hide information | a card holds a truncated first line; the reader must open it to see what the page already said |
| Nothing is reused | the same idea in five sections is five unrelated boxes; no type carries meaning |
| Taggly is wired to nothing | [suggest.ts](src/suggest.ts) posts `{count, blocks, relations}` to an endpoint taggly does not have |

## Goal shape

| Layer | Shows | Answers |
|---|---|---|
| root | top folders, and **Concepts** | where do I start |
| **Concepts** | the collection map: top concepts by kind, typed relations between them | what is this system made of |
| a set | its pages, joined by links and by shared concepts (`3 shared`) | which pages overlap, which stand alone |
| a page | references to the concepts this page speaks of, and the relations it states | what this page covers, in the shared visual language |

Tray, for the picked block:

| Picked | Tray shows |
|---|---|
| page | its outline (today's `documentOutline`) |
| section | **that section's own rows only** |
| concept or reference | kind, other names (`aka`), home section, every mention (page › section + the sentence), related concepts |

Explorer: sets, pages, and **Concepts** with one row per concept. Sections are not rows; they are reorganized in the tray content panel, as the README describes.

## Pipeline

```
sections ─▶ passages ─▶ lexical pass ──┐
                    └─▶ taggly pass ───┼─▶ canonicalize ─▶ rank ─▶ relate ─▶ vocabulary ─▶ layers
                        (cached)       ┘
```

| Stage | Input → output | Runs |
|---|---|---|
| **passages** | a section's own content → plain text, ≤ 800 chars, `{id, hash, text}` | always |
| **lexical** | code spans, headings, bold terms, link texts → mentions with a shape-kind | always, pure |
| **taggly** | passage → typed mentions (`ext`), triples (`rel`) | optional, async, cached by hash |
| **canonicalize** | mentions → concepts; merge by normal form, then embedding similarity | always; embeddings only with taggly |
| **rank** | concepts → salient concepts, a home section each | always |
| **relate** | co-occurrence, stated triples, page overlap → relations | always; triples only with taggly |
| **vocabulary** | kinds and verbs → `defs` | always |
| **layers** | the above → `viewingGraph` blocks, references, edges, coordinates | always |

### Passages

- One per section: the heading plus its direct prose, list items and table rows. Subsections are their own passages.
- Flattened: a table row becomes `header: value; header: value.`, a list item a sentence, a link its text. Fences are excluded (not prose); their `lang` is kept as a lexical mention.
- Split at paragraph boundaries above 800 chars. Measured: `ext` returns nothing for a 2.5k page or a raw markdown table, and works on the same section as plain text.

### Lexical pass (no taggly)

Technical docs already mark their concepts. This pass gives a working map with taggly off.

| Signal | Kind by shape |
|---|---|
| `` `path/x.ts` ``, `` `x.yaml` `` | artifact |
| `` `--flag` ``, `` `key:` `` in a yaml fence | setting |
| `` `mndmap emit` ``, `` `npm run dev` `` | command |
| `` `Name()` ``, `` `PascalCase` `` | component |
| heading text, **bold** term, other `` `code` `` | term |

### Taggly pass

- `ext` with `concepts=<kinds>` per passage → typed mentions. Kind by majority across mentions; lexical shape wins ties.
- `rel` per passage with ≥ 2 concepts: the passage, its concept names, and the verb list → `[from, verb, to]` triples.
- Results stored in `workspace.json` under `concepts.cache`, keyed by passage hash and model id. Re-translate re-asks only changed passages.

### Canonicalize

- Junk filter: ≥ 2 chars, has a letter, ≤ 4 words, not a stopword, no leading punctuation (measured junk: `". and"`, `"paths +"`).
- Normal form: lowercase, strip backticks, articles, trailing plural. Same normal form → one concept.
- With taggly: `embed` every name; union pairs at cosine ≥ 0.8 (`concepts.merge`). Measured: `parser`/`parse` 0.88, `parser`/`markdown reader` 0.38 — merges spellings, not synonyms.
- Name: the most frequent surface form; one found in a heading wins a tie. Other forms are `aka`.

### Rank

- Score: sections mentioning it, +2 if in a heading, +1 if a code span.
- Dropped: named in one section and in no heading.
- Named on more than 60% of pages: the collection's subject (`mndmap`). It names the Concepts layer instead of being a box linked to everything.
- Caps: Concepts layer top 24; a page layer top 9 by page-local count.
- **Home**: the section whose heading matches the concept best, else the one mentioning it most. Every box links there on emit and in the tray.

### Relate

| Relation | From | Drawn when |
|---|---|---|
| `concept.related` | two concepts in one passage | ≥ 2 passages; top 3 per concept |
| a verb (`reads`, `writes`, `uses`, `contains`, `produces`, `configures`) | `rel` triples | stated once; replaces `related` on that pair |
| page overlap | two pages sharing ≥ 2 salient concepts | on the set layer, named `n shared` |
| `doc.link` | markdown links between pages | on the set layer, as today |

Triples are validated: both ends in the given names, verb in the list (else `related`). Measured on a sample passage: 6 of 10 correct, one reversed, one off-list term, one off-list verb — so validation is not optional, and direction is weak evidence.

## Vocabulary

Generated per collection into `graph.defs` as workspace definitions, not a package. Kinds and verbs come from `mndmap.yaml`:

```yaml
concepts:
  taggly: http://127.0.0.1:8000   # null: lexical pass only
  kinds: [component, artifact, command, setting, term]
  relations: [reads, writes, uses, contains, produces, configures]
  merge: 0.8
```

| Definition | Extends | Carries |
|---|---|---|
| `concept.<kind>` | `block` | fields `aka`, `home`; one style family per kind |
| `concept.<verb>`, `concept.related` | `line` | arrow for verbs, none for `related` |
| `concept.map` | `folder` | holds `concept.*` |

A kind is a look that repeats: every `command` reads the same on every layer and in every emitted diagram. That is the reuse.

## Layout

The kit arranges free and grid only. Concept layers need a layered layout, so mndmap seats them with **`@dagrejs/dagre`** (verbs top-down, `related` unconstrained) and snaps to the existing 24px lattice. Set and root layers keep the kit's row.

## Curation

Concepts are derived; corrections are the user's work, like the organization.

| Gesture | Stored as |
|---|---|
| rename (explorer double-click) | `{rename: id, to}` |
| merge (drop one concept row on another) | `{merge: id, into}` |
| drop | `{drop: id}` |
| retype kind (tray) | `{kind: id, to}` |
| pin (keep regardless of rank) | `{pin: id}` |

Held in `workspace.json` under `concepts.curation`, applied after canonicalize and before rank, undone through the existing edit log. Ids are the normal form, so a curation survives re-translate.

## Changes

### taggly

| Change | Why |
|---|---|
| `rel` command: `content`, `terms[]`, param `relations` → validated triples | open extraction returned nothing; constrained works |
| `embed` command: `texts[]` → vectors (shares `load_embedder`) | collection-wide merge needs vectors, not one-query `score` |
| `POST /{name}/batch` for every command, in the framework | one round trip per stage, not per passage |
| CORS middleware, origins from config | the browser is the product |
| endpoints `def`, not `async def`; a lock around `generate` | blocking calls stall the loop; `key`/`embed` can run while `ext` generates |
| `ext`: drop candidates with no letter or leading punctuation | junk seen in measured output |

### mndmap

| File | Change |
|---|---|
| `src/concepts/passages.ts` | sections → passages |
| `src/concepts/lexical.ts` | lexical mentions |
| `src/concepts/taggly.ts` | batch client, cache by hash; replaces [suggest.ts](src/suggest.ts) |
| `src/concepts/map.ts` | canonicalize, curation, rank, relate, vocabulary — pure |
| [src/ui/project.ts](src/ui/project.ts) | `viewingGraph` builds the four layers; dagre seating |
| [src/ui/Tray.tsx](src/ui/Tray.tsx) | section shows its own rows; concept panel |
| [src/ui/App.tsx](src/ui/App.tsx) | **Map concepts** action with progress; explorer on org + Concepts |
| [src/emit.ts](src/emit.ts) | page diagram = page concept layer; Concepts map on the index; boxes link to home |
| [src/cli.ts](src/cli.ts) | `mndmap concepts <workspace.json>` fills the cache; `translate` stays pure |
| [src/types.ts](src/types.ts), [src/config.ts](src/config.ts) | `concepts` config; `suggest` retired |

### What happens to what landed

| Keep | Remove |
|---|---|
| `documentOutline`, `heldId` / `isProjectionId` guards (reused for concept ids) | `introduceBodies`, `placeLattice`, `body:` / `prose:` / `stand:` blocks, `contains:` edges |
| explorer reveal to the parent layer | explorer on `view`; sections and items as rows |
| | lattice tests in [test/project.test.ts](test/project.test.ts) |

The uncommitted `free()` fill in mndflow `arrange.ts` is generic and harmless; it is not needed here.

No new tests until the layers stop moving.

## Cost

Measured on the local instance, `qwen-0.8b`, warm.

| Call | Per passage |
|---|---|
| `key` | 0.3 s |
| `ext` | 2–2.7 s |
| `rel` | ~5 s (14.6 s including model load) |

This repo's docs: 100 sections. Cold: ~4 min `ext`, ~8 min `rel`, serial. Warm: only changed passages. `rel` is a separate step so a map is visible after `ext`. A larger model is one config line through taggly's external LLM endpoint.

## Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | README goal: *"Structure is inferred, meaning is not."* A concept map infers meaning. | Revise the goal: meaning is **proposed** and every proposal is correctable (curation). Otherwise this plan is out of scope. |
| 2 | README: *"Nothing is uploaded."* A non-local `concepts.taggly` sends passages off the machine. | Allow any URL; warn in the UI when the host is not local. |
| 3 | Kinds: fixed list or discovered per collection? | Configured list with defaults. A 0.8B model does not discover categories reliably (`export` came back as both component and command). |
| 4 | Concept detail: a layer (double-click) or the tray? | Tray first. A layer needs sections back in the graph as reference targets. |
| 5 | Emit a generated glossary page (`concepts.md`: kind, home, mentions)? | Yes — the same data, and the most direct reader value on the published site. |
| 6 | Workspace definition ids: `concept.<kind>` or minted `def_…` (mndflow's rule)? | `concept.<kind>` — regenerated every run, so a derived id is the stable one. Confirm with mndflow. |

## Verification

Browser on `samples/workspace.json` (this repo's docs), taggly on and off.

- Taggly off: Concepts shows ≥ 10 concepts from code spans and headings (`translate`, `emit`, `workspace.json`, `mdsite.yaml`, …). No section or list item is a box.
- Taggly on: the same concepts plus prose ones; `parse` and `parser` are one concept; no junk names.
- Picking a section shows only its own rows. Picking `mdsite.yaml` lists every page and sentence that names it, and its home.
- The `docs/publishing` set layer joins `deployment` and `mdsite-handoff` with an `n shared` line.
- A page layer has ≤ 9 boxes, each a reference with the concept's name and kind colour. No box's content is a copy of the page's text.
- Rename and merge a concept, re-translate: both survive. Undo reverts each.
- Emit: a page's SVG boxes link to their home sections; the index carries the Concepts map.
- Second **Map concepts** run with no source change makes no taggly calls.

---

## Element fixture

Everything below exists so the parser has one of each. It says nothing about
the design; it is the corpus.

### Text

A plain paragraph. It carries **bold**, *emphasis*, ~~strikethrough~~, `inline
code`, a [link](https://example.com), and a footnote-ish aside — all inside one
block.

A second paragraph, so two adjacent text blocks are distinguishable from one
block holding a line break.

#### A fourth-level heading

Depth matters: a heading block carries its level, and four levels appear in
this document.

##### A fifth-level heading

### Lists

An unordered list:

- first item
- second item, with `code` in it
- third item

An ordered list:

1. step one
2. step two
3. step three

A task list:

- [x] done
- [ ] not done
- [ ] also not done

A nested list:

- outer one
  - inner one
  - inner two
- outer two
  1. inner ordered
  2. inner ordered again

### Quotes

> A blockquote is its own block.
> It may run to several lines.

> A second quote, separated from the first.
>
> > And a nested one inside it.

### Code

An indented fence with a language:

```ts
export function parse(text: string): Block[] {
  return text.split("\n").map(line => ({ line }));
}
```

A fence with no language:

```
plain, unlabelled, still a code block
```

### Media

![A placeholder image](https://example.com/diagram.png)

A reference-style [link][ref] and an autolink <https://example.com>.

[ref]: https://example.com/reference

### Tables

A table whose rows are records — one block each:

| Element | Block type | Carries |
|---|---|---|
| heading | `md.heading` | level |
| paragraph | `md.text` | the prose |
| list | `md.list` | ordered, tasks |
| code | `md.code` | language |
| quote | `md.quote` | depth |
| table row | `md.row` | one field per column |

A table with alignment:

| Left | Centre | Right |
|:---|:---:|---:|
| a | b | c |
| d | e | f |

### Rules

Three rules follow, and each is its own block.

---

***

___

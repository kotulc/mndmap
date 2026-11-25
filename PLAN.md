# Plan

**From the first deck (2026-11-24) to cards that work across documentation.** What exists, the questions to settle first, where to expand, and the steps for the next session. The vision is in [VISION.md](VISION.md).


## Where we are

| Built | State |
|---|---|
| **cards** (```` ```cards ````) | working: headings → deck, open/close layouts, camera, lines, panel, keys, swipe, hash per card; mndsite About sample (`npm run try`) |
| flows (```` ```mermaid ````) | working: Mermaid's parser, mndflow look, `click` links checked |
| site map (```` ```sitemap ````) | working: treemap of the site, zoom and find on its own page |
| pipeline | `mndmap build` / `check`, relative links, self-contained pages, gallery, verified through a real mndsite build |
| not yet | tests (design still moving), commits of this work, an authoring guide for cards |


## First: why the rewrite

The mndsite About page made a poor deck as written and a good one rewritten. Settle why before expanding.

| Original About | Rewritten (`samples/mndsite/about.md`) |
|---|---|
| sections by reader question: Purpose, Pipeline split, How It Works, Features, Roadmap | sections by part of the system: Configuration, Ingest, Build, Site, Publish |
| sections repeat each other (pipeline told three times) | each part told once |
| long lists and tables as the content | one sentence of meaning, then detail |
| few links between sections | sections link to what they hand to or read |

| Question | Options to weigh |
|---|---|
| what makes content card-able? | one idea per section, a first sentence that stands alone, links between sections |
| who reshapes content that isn't? | the author (a guide and a lint), an agent (proposes cards from the original), or both |
| must every page be a system? | no: other shapes need other card kinds (see below) |
| what does the original become? | compare decks of the original and the rewrite side by side, then decide |


## Where to expand

| Direction | Ideas |
|---|---|
| **card sources** | headings (now); agent-created cards proposed as markdown and reviewed; explicit card fences; a whole site as one deck (pages as cards, folders as parts) |
| **card kinds** | system block (now); step (a tutorial, read in order); concept (a glossary, linked by "is a" / "uses"); decision (context, choice, consequence); example (code and output); update (a feed post, for Trendly) |
| **relationships** | typed by link text or a small syntax (hands to, reads, uses); drawn in the relation's own dash and colour, as mndflow does |
| **inside a card** | flows and code in the panel; a small drawing that comes forward as the card is approached; images |
| **presentations** | narrated paths through a deck (stops and steps, as mndflow's presentations); play / pause; a link to any step |
| **layouts** | grid (now); a flow layout for steps; a radial one for concepts; chosen per deck |
| **portability** | a web component as well as a frame; theme tokens a host can set; frame sizing that fits its content; a full-width deck page in mndsite (a small mndsite option: needs your decision) |
| **quality** | card length lint; checked relationships; keyboard and screen reader passes; decks of 100+ cards; tests once the shape settles |
| **back to mndflow** | which motions to port (layout morph, rising flight, line draw-in, panel turn); a shared motion and token module |


## Next session

| # | Step | Done when |
|---|---|---|
| 1 | build a deck from the **original** About page and compare it with the rewrite | we agree what makes content card-able |
| 2 | write the card authoring guide and a lint (length, a standalone first sentence, links between cards) | `mndmap check` reports card problems |
| 3 | try **agent-created cards**: an agent reads a page and proposes cards and relationships as markdown | one page decked from an agent's proposal, judged against the heading deck |
| 4 | add a second card kind, **steps** (a tutorial such as Getting Started), with a layout that reads in order | a step deck that feels different from a system deck |
| 5 | add **presentations**: a narrated path through a deck | the About deck plays as a short tour |
| 6 | decide what moves to mndflow and what mndsite might offer (full-width deck page) | a short list agreed |

**Housekeeping first:** commit this work; decide whether flows and the site map stay as their own fences or become things that live inside cards.

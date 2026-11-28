# Plan

**Handoff, 2026-11-27: cards inferred from plain markdown, and the whole site as one deck.** What exists, how to pick it up, what comes next. The vision is in [VISION.md](VISION.md).


## Where we are

| Built | State |
|---|---|
| **page decks** | headings → cards; inferred parts (term lists, numbered steps, labelled lists); mention lines; card faces (description / first sentence / digest); camera, panel, keys, swipe, hash per card |
| **site deck** (`--cards`) | `_assets/mndmap/site.html`: site → folders → pages → sections → parts; Esc zooms out; page links as lines; "Read the page ↗" in the panel |
| **card ids** | a heading's card id is its anchor (slugged as the site slugs, every heading counted); parts are `<card>.<slug>`; in the site deck, `/page#anchor` |
| flows, site map | Mermaid flowcharts; treemap of the site (```` ```sitemap ````) |
| pipeline | `mndmap build` / `check`, relative links, self-contained pages, gallery |
| dev | `npm run dev`: builds mndsite's docs with `samples/mndsite/` laid over them into `dist/try/build`, serves it, reloads on edit. Reads `../mndsite/docs` only |
| not yet | the Cards toggle in a host page (step 1); tests (design still moving) |


## Picking it up

| | |
|---|---|
| branch | `dynamic-content-linking`; the work after commit `d59b165` is **uncommitted** |
| run | `npm install`, `npm run dev`, then `http://localhost:7342/build/_assets/mndmap/site.html` (the site deck) or `.../index.html` (gallery) |
| samples | `about-original.md` (mndsite's About as written: **the target**), `about.md` (rewritten by hand: a reference only), `site-map.md` (the treemap, to compare) |
| verified | in a real browser (Edge, headless): faces, zoom out page → site, into folders and pages, same-page and cross-page links, "Read the page" |
| reviewed | a code review's findings are fixed but one: broken links inside the site deck are not added to `mndmap check`'s report |

**mndsite is a shell, read only.** Never edit `../mndsite` (its source, config, generated `pages/`, or caches): it is worked on separately. Everything the cards need is built here and handed to mndsite through what it already offers.


## Next

| # | Step | Done when |
|---|---|---|
| 1 | **shell**: `npm run dev` exports a commit of mndsite (`git archive`) into `dist/shell/`, links its `node_modules`, writes its own `mndsite.yaml` there (content: the try build; `components:` mndmap's `site/components/`), ingests and runs `next dev` in that copy | mndsite shows mndmap's output, and `git status` in `../mndsite` never changes |
| 2 | **Cards toggle**, as a consumer component: mndmap's build puts `<CardsView />` at the top of each page it writes (the source stays as written); a floating button, not in the navbar | the toggle works in the shell as it did in the trial (below) |
| 3 | **site deck or treemap**: compare the two in the shell | one is chosen |
| 4 | the open questions below, then tests once the shape holds | |

What the trial (since removed from mndsite) proved, for step 2:

| Piece | How |
|---|---|
| the frame | `site.html?embed&host#<card id>`, fixed full width under the navbar; the page holds still under it |
| where it opens | the last heading in the top third of the window (`article .subheading-anchor[id]`), as `/route#anchor` |
| where it closes | the panel's `.mm-read[data-read]` (the card's own heading, or the nearest above a part), else the frame's hash; another page by `router.push`, the same page by scrolling |
| "Read the page" | the deck posts `{ mndmap: "read", id }` to its host, only with `?host`; without it the link is followed |
| remembered | `localStorage["mndsite-view"]` is `cards` or `page` |
| routes | mndsite uses trailing slashes (`/about/`); a card's page url has none (`/about`) |


## Open questions

| Question | Notes |
|---|---|
| step titles | numbered items are whole sentences, clipped on blocks; "Step n" with the sentence as the face is the alternative |
| tables | a table is detail today; its first column as parts is possible but riskier |
| folder routes | `/updates` and `/features` (folders without an index) are reported broken; mndsite may route them |
| fences | with the site deck, does ```` ```cards ```` stay (a deck placed in a page), and do flows live inside cards? |
| site deck colour | a page's sections all wear the page's colour; in a page's own deck each section has its own |
| site deck size | 392 cards, ~380 KB, all loaded at once; load a page's cards as it opens once sites grow |


## Known issues

| Issue | Notes |
|---|---|
| broken links in the site deck | not reported by `check` / `--strict` (pages without a fence are only read there) |
| Windows: a page missed after re-ingest | Next's watcher can miss a page ingest swaps in by rename; touching the file brings it back (mndsite's own sync) |
| stopping `npm run dev` | if the task is killed rather than interrupted, its Vite server can keep port 7342; free it by stopping the listener |
| browser automation | Playwright's `click()` scrolls the page to reach a sticky navbar button, which moves the reading position; click from the page (`el.click()`) when testing where a deck opens |


## Where to expand

| Direction | Ideas |
|---|---|
| **card sources** | headings and lists (now); agent-proposed cards, reviewed |
| **card kinds** | system block and steps (now); concept (a glossary); decision (context, choice, consequence); example (code and output); update (a feed post, for Trendly) |
| **relationships** | written links (labelled), mentions and page links (unlabelled) now; typed relations drawn in their own dash, as mndflow does |
| **inside a card** | flows and code in the panel; a small drawing that comes forward as the card is approached; images |
| **presentations** | narrated paths through a deck (stops and steps, as mndflow's presentations); play / pause; a link to any step |
| **layouts** | grid (now); a flow layout for steps; a radial one for concepts; chosen by what the content is |
| **portability** | a web component as well as a frame; theme tokens a host can set |
| **back to mndflow** | which motions to port (layout morph, rising flight, line draw-in, panel turn); a shared motion and token module |

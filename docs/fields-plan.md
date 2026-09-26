# Fields plan

**Tables become typed block fields, and fields become something a card, the explorer and a layer can
show.** Spans mndflow (the shell) and mndmap (the translator).

**Status: steps 1–11 done.** Steps 8–11 are **unreleased**: they
live in mndflow's working tree and reach mndmap only through the linked dev server. mndmap's
`package.json` still pins `@mnd/kit` 0.8.0 (mndflow `8871eaf`), which has none of them.


## Vision

| Piece | End state |
|---|---|
| **explorer** | three sections inside the workspace: `packages` (imported content), `definitions` (the user's working definitions), `usages` (the block tree, under a root node) |
| **root node** | heads `usages`, wears its own root mark |
| **schema** | a block's fields are declared by its definition — a table's header row is a schema |
| **values** | a table's data rows are values in a grid, headed by the schema — data, not parts. A block is kept for what is reusable |
| **DB mark** | any card whose block has a schema or set field values says so at a glance |
| **field layer** | a block's fields project into a view of their own: a class diagram |
| **card** | a head, a divider, and a compartment: fields for a table-like block, a formatted preview of the body for content |


## Steps

| # | Step | Where | Status |
|---|---|---|---|
| 1 | **table → schema + usages**: each unique header row is one workspace definition (extends `md.row`, a field per column); each row is a usage, a child of its table, named by the table's `key` column | mndmap `read.ts`, `packages/markdown.ts` | done |
| 2 | **field forms inferred**: numbers → `number`, yes/no → `flag`, links → `link`, else `text` | mndmap `read.ts` | done |
| 3 | **explorer sections**: `packages` · `definitions` · `usages` | mndflow `explorer` | done |
| 4 | **root mark**: a root icon on the root row, never filled | mndflow `theme`, `explorer` | done |
| 5 | **DB mark**: a drawn database on cards with values or a workspace schema; marks stack | mndflow `core`, `theme`, `stage` | done |
| 6 | **field diagram**: a class card for the schema and a card per usage, opened from the canvas's view toggle | mndflow `views` (`fields_graph`), `stage`, `tray`, kit `Viewer` | done |
| 7 | **field model revised**: markdown's own syntax lives in the body; the package declares only a table's `key` | mndmap `read.ts`, `packages/markdown.ts` | done |
| 8 | **card overhaul**: card traits, compartments, markdown on cards, content icons, the class diagram laid out, the `markdown` tab | mndflow `core`, `views`, `stage`, `theme`, `explorer`, `tray`, `kit`; mndmap `read.ts`, `packages/markdown.ts`, `ui/` | done |
| 9 | **parts mark**: a four-box system mark on any card whose block has children | mndflow `core` `stamps_of`, `theme` | done — on trial |
| 10 | **tables and backbone**: rows as a grid, the diagram inside the table's frame, the view toggle, the two-column backbone | mndflow `core`, `views`, `stage`, `kit`; mndmap `read.ts`, `packages/markdown.ts`, `ui/App.tsx` | done |
| 11 | **values, not blocks**: a grid cell holds a plain value; a table is one grid of its rows' values, headed by its schema; a list's items stay in its body. `sample.md` goes from 218 blocks to 111 | mndflow `core` (holder `values`, `schema`, `size`; door; line edits; `schema_def`, `is_container`), `views`, `stage`, `kit`; mndmap `read.ts`, `packages/markdown.ts`, `ui/` | done |


## What step 8 built

| Piece | What it is |
|---|---|
| **card traits** | `card.height: fit` (grows to its content), `card.body: show` (the body under the divider), `card.name: hide` (the body is the whole card), `card.fields: show`, and `card.height: free`. Ports and holding stay under `allows` |
| **markdown on cards** | `marked` read into React elements, never an HTML string. Bodies and field values both. A link opens on ctrl+click; a plain click picks the card |
| **preview** | a body is cut off with `…` at the card height. `full content` lets a `fit` card grow to show all of it |
| **content icons** | `content_heading`, `_text`, `_list`, `_code`, `_quote`, `_image`, `_front`, `_lead` (`_item`, `_more`, `_row` and `_rule` are drawn but unused). The package names one per definition with `card.icon`; the explorer wears them too |
| **icon and marks** | a card holding parts lights its icon rather than filling it; system marks are grey |
| **class diagram** | the open table's layer drawn another way, in its own frame and navigated as it is: the class card on top, its instances in rows of four under it, a dashed *instance of* line from each. An instance is a block typed by the schema, or a line of a grid it heads, drawn as a card only while the diagram is. The class is named for the section its table sits in |
| **view toggle** | `contents` · `diagram`, bottom right of the canvas, offered only inside a block whose children carry fields. Leaving the layer leaves the diagram |
| **tables as grids** | a table's layer holds one grid: a header line read from the schema's fields, then a line per row of plain values, 6 × 2 unit cells, named by its row count |
| **two-column backbone** | a heading sits beside its one block, or beside a container (`N blocks`) holding them all, its body listing their names |
| **stacking** | mndmap stacks by each card's measured height and centres every row on its tallest card. Cards grow two units at a time, so centres stay on the lattice |
| **tray** | the `markdown` tab leads and opens first: the block's text in full. The rest are placeholders for debugging |
| **display** | the workspace's `layer` row: `lattice` and `full content` |


## Todo

| Task | Where | Notes |
|---|---|---|
| **release the kit** | mndflow `release:kit`, mndmap `vendor/`, `package.json` | steps 8–11 exist only in mndflow's working tree. Cut 0.9.0 when the card settles, and re-pin |
| **name duplicate schemas** | mndmap `read.ts` `schema_for` | two tables under one heading with different headers get the same class name (`Goal shape` twice). Deferred: name by the key column instead, or qualify the second |
| **mark the key column** | mndflow `views` `listed`, `stage` | the class card lists columns but does not say which one names the rows |
| **a diagram card keeps room for its hidden value** | mndflow `views` `size.ts` | the value repeating the card's name is dropped when drawn, but still counted in its height |
| **editing values** | mndflow `core` actions, `stage` | a cell's value is read, validated and moved with its line, but no action or gesture writes one yet |
| **values in the SVG export** | mndflow `views` `svg.ts` | the export draws a grid's lattice but not its values |
| **a diagram instance is not pickable into the tray** | mndflow `kit` `Viewer`, mndmap `App.tsx` | a grid line drawn as a card has no block behind it, so the tray says it is not there |
| **a table's markdown tab** | mndmap `ui/Preview.tsx` | a table shows no preview; its grid could be rendered as the table it was written as |
| **column widths** | mndflow `core` `size`, `views` | every cell of a grid is one size, so a short column wastes room and a long one clips |
| **front matter and image bodies** | mndmap `packages/markdown.ts`, mndflow `stage` | both are notes or references and show no body. Front matter is YAML, not markdown; an image's source is rarely reachable from the page |
| **heights are estimated** | mndflow `views` `size.ts` `wrapped` | a `fit` card's height is counted in characters before anything draws, so prose may keep a line of slack under `full content`. Measuring the DOM would take a second layout pass |
| **a tall document zooms far out** | mndflow `stage` camera, or mndmap stacking | the root layer is one long column, so fitting it shrinks the cards past reading. Options: fit to width, cap the zoom-out, or lay long layers in columns |
| **the `key` column can't be changed** | mndmap, and a tray edit | the decision says *settable per table block*; it is only ever the first column |
| **read-only tabs that still look live** | mndflow `tray` | without `onAct`, the definitions, packages and usages tabs act with nothing but draw their inputs as usual. Recorded in mndflow `docs/stories.md` |
| **one diagram pick lights two rows** | mndflow `tray` / mndmap `App.tsx` | the class card holds its definition while the table stays picked. Recorded in mndflow `docs/stories.md` |
| **mndflow's own docs** | mndflow `README.md`, `docs/`, `packages/*/docs` | the card traits, the parts mark and the reversed *holding is not a mark* rule are not written down there |
| **`vendor/mnd-kit-0.7.0.tgz`** | mndmap `vendor/` | nothing names it any more; safe to delete |


## Not yet driven

| | |
|---|---|
| **themes** | only `retro` was looked at since step 8; `modern` and `light` may draw the body, links and grey marks differently |
| **the folder case** | `scan.ts` graphs go through the same stacking, tray and root rules, but no folder was opened |
| **import / export** | not exercised against the new definitions, fields and card traits |
| **tests** | none written for steps 8–11: the design is still moving. mndflow's suite (374) passes; three assertions were rewritten where they named the filled icon and the old marks rule |


## Decisions

| | |
|---|---|
| **schema lives on a definition** | one per unique header row and form, filed in `definitions`; tables sharing one share it |
| **rows are values** | a table's rows are a grid's lines, not blocks: blocks are reusable parts, and a row is data. *Replaces "rows are usages"* |
| **a grid cell holds a value or a block** | a plain value where no block is seated; a seated block draws over it |
| **headers come from the schema** | a grid naming a schema reads its first line from the schema's fields, never from stored text, so a column has one name. A column becomes a block only once it proves reusable |
| **list items are body** | a list's items stay in its body as written; no item blocks |
| **schemas wear the base icon** | `md.row`, and every table's schema over it, names no icon of its own |
| **headings read centred** | a heading's card centres its name; nothing else does |
| **no rule blocks** | a thematic break carries no block; content after one joins the heading before it |
| **markdown lives in the body** | a block's body is its element as written — `## Title`, a fence with its language, `- [x] item`. The package declares one field, a table's `key` |
| **link cells keep their markdown** | `[b](http://b.io)` is stored whole, so a card draws the link with its text |
| **workspace** | the session's container: state and metadata, plus the user package. Imported and exported whole |
| **user package** | `definitions` + `usages`: the root and its tree, plus the user's definitions. Imported and exported apart; another user's lands under `packages` |
| **root** | shows the document's own name, with a root mark. Nothing picked on the root layer is the root picked, on its `workspace` tab |
| **marks describe** | a stand-in wears one written word — `Def`, `Ref`, `Pkg`. Anything else wears what describes it, drawn, and those stack: `data` is a database, `parts` is four boxes. A reference to a definition or package is never *missing* |
| **traits live in `card`** | what a card can do is a definition's `card` component, per definition and overridable per block — not a new key |
| **markdown renders in the kit** | as React elements through `marked`, general to any host; mndflow never reads markdown for meaning |
| **links answer ctrl+click** | a plain click is the card's |
| **content is a preview** | a card previews its body and cuts it off; the `markdown` tab and `full content` show all of it |
| **holding lights the icon** | a fill would blot a drawn mark like ¶, so colour says it. The `parts` mark says it again, on trial |
| **the shell is mndflow's** | `Tray`, `useTray`, `useDisplay`, the root default and the fields diagram (`Viewer` `fields`) ship in the kit, and mndflow's app runs on the same hooks. mndmap keeps reading, stacking, the `markdown` tab and reorganizing |
| **the tray is read only in mndmap** | handed no `onAct`, it offers only the tabs that read. Display answers go to `onDisplay`, since how a drawing looks is the session's. A host's tabs lead a block's |
| **content-centric cards** | mndmap starts cards at 10 × 3 units; the document restacks to each card's height as it draws |
| **the explorer bar** | each tool toggles on its own (`filter`, `block`, `folder`, `remove`, `fold`); a host's tools go in `extra`, after the filter. mndmap turns `block` off and adds *add document*. Folds are one chevron, as an editor's tree draws them |

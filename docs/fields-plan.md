# Fields plan

**Tables become typed block fields, and fields become something a card, the explorer and a layer can
show.** Spans mndflow (the shell) and mndmap (the translator).

**Status: steps 1–18 done.** mndmap pins `@mnd/kit` 0.9.0. Steps 12–18 are **unreleased**: their
kit half lives in mndflow's working tree and reaches mndmap only through the linked dev server.
Release once they settle.


## Vision

| Piece | End state |
|---|---|
| **explorer** | three sections inside the workspace: `packages` (imported content), `definitions` (the user's working definitions), `usages` (the block tree, under a root node) |
| **root node** | heads `usages`, wears its own root mark |
| **schema** | a table's own: a field per column, with the form its cells read as, and its key column marked. Never a definition |
| **column types** | each distinct column name is a workspace block type; a table's header allocates them |
| **definitions** | only what is reused across the document. Picking a library section charts its definitions, each beside what it types or what allocates it |
| **page** | one document reads as one flat page: headings anchor rows, and only focus blocks open |
| **values** | a table's data rows are values in a grid, headed by its column types — data, not parts. A block is kept for what is reusable |
| **DB mark** | any card whose block has a schema or set field values says so at a glance |
| **opened table** | a cutout of its section: the table in the middle, its section's heading above, its neighbours at either side, its columns' definitions and its schema below — on one layer, with no view to toggle |
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
| 12 | **flat page**: headings anchor rows instead of opening; each level steps right a card column; content starts beside its heading; a flow line from the parent or the sibling before | mndmap `read.ts` (`paged`, `laid`), `series.ts` | done |
| 13 | **focus blocks**: a table, or a fence or list of 12+ lines, previews on the page and opens alone, fitted to the canvas. `open` is offered only on a block holding something | mndmap `read.ts`, `ui/App.tsx`; mndflow `stage` `Flow`, `views` `derive` | done |
| 14 | **reader camera and keys**: the pick centred, `READ` 2 cards wide, never more than `WIDEST` 6 (`widest`); an unpicked page read from its top; ↓/↑ keep to one level; vite waits for the kit's first build | mndflow `stage` (`room`, `arrays`, `Flow`), kit `Viewer`; mndmap `ui/App.tsx`, `scripts/dev.mjs` | done |
| 15 | **column block types**: a workspace definition per distinct column name, extending `md.column`; a grid's header allocates them (`Grid.columns`) and reads their names; the key is a table's own field (`Field.key`) and its header and schema wear a key icon. Fields past a card's height are cut with `…` | mndflow `core` types, `views` (`block`, `derive`), `stage` (`nodes`, css), `theme` icons; mndmap `read.ts`, `packages/markdown.ts`, `series.ts`, `ui/Preview.tsx` | done |
| 16 | **schemas are the table's; the opened table**: no schema definitions — a table carries a field per column with its form. Opened, it draws its grid with each column's definition over its column (dashed `allocates`), and a reference to its section's heading and its `schema` card beside it. The class diagram toggle goes | mndmap `read.ts` (`beside`, `around`), `packages/markdown.ts`, `ui/App.tsx` | done |
| 17 | **definition charts**: picking `definitions`, `packages`, a package or one definition charts those block definitions in the page's place. Enter reads a block on the page; Escape leaves | mndmap `read.ts` (`charted`), `series.ts` (`is_spine`), `ui/App.tsx` | done |
| 18 | **cutouts and groups**: an opened table shows its section around it (heading above, neighbours at either side, columns and schema below). A chart groups definitions in labelled boxes — column types by section, `shared` first, the rest by kind (`KINDS`) — packed by the kit. One definition opens in context: the table cards allocating it under their headings, it under them, related columns below. The unpicked camera fits a drawing's width, not its room | mndmap `read.ts` (`beside`, `around`, `grouped`, `local`), `packages/markdown.ts` (`KINDS`), `ui/App.tsx`; mndflow `stage` `room` | done |


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
| **release the kit** | mndflow `release:kit`, mndmap `vendor/`, `package.json` | steps 12–17 exist only in mndflow's working tree. Cut a release once they settle, and re-pin |
| **allocation lines meet at one point** | mndflow `views` routing | each column's dashed line ends at the middle of the grid's bottom edge, not under its own column |
| **two meanings of "allocated"** | mndflow `core` `allocations_of` | the kit already calls a block seated under a header reference *allocated*; a header naming a column type is a second meaning. Settle one word |
| **charts ignore shelf folders** | mndmap `ui/App.tsx` `chart` | a folder under `definitions` charts its whole group, not only what is filed in it |
| **a picked definition card is hard to read** | mndflow `theme` | a picked stand-in for a definition fills blue, and its dim name nearly vanishes |
| **a package definition in context can be long** | mndmap `read.ts` `local` | `heading` in context is every heading in the document, four to a row |
| **keys on a grouped chart** | mndmap `ui/App.tsx` | ↓/↑ step through groups and cards in order; nothing yet moves across the kit's packing |
| **opened fences are one card wide** | mndflow `views` `size`, `stage` | a card is sized from the one card width and ignores its own, so an opened fence or list cuts long lines |
| **a focus layer's frame label** | mndflow `stage` frame | fitted to its block, an opened table's frame label draws under the crumbs |
| **previews wear `Ref`** | mndflow `core` `stamps_of` | a focus block's preview is a reference, so it wears the reference mark; it may read better as the block itself |
| **editing values** | mndflow `core` actions, `stage` | a cell's value is read, validated and moved with its line, but no action or gesture writes one yet |
| **values in the SVG export** | mndflow `views` `svg.ts` | the export draws a grid's lattice but not its values |
| **a table's markdown tab** | mndmap `ui/Preview.tsx` | a table shows no preview; its grid could be rendered as the table it was written as |
| **column widths** | mndflow `core` `size`, `views` | every cell of a grid is one size, so a short column wastes room and a long one clips |
| **front matter and image bodies** | mndmap `packages/markdown.ts`, mndflow `stage` | both are notes or references and show no body. Front matter is YAML, not markdown; an image's source is rarely reachable from the page |
| **heights are estimated** | mndflow `views` `size.ts` `wrapped` | a `fit` card's height is counted in characters before anything draws, so prose may keep a line of slack under `full content`. Measuring the DOM would take a second layout pass |
| **the key column can't be changed** | mndmap `read.ts`, and a tray edit | the key is a table's first field; no gesture sets another |
| **read-only tabs that still look live** | mndflow `tray` | without `onAct`, the definitions, packages and usages tabs act with nothing but draw their inputs as usual. Recorded in mndflow `docs/stories.md` |
| **mndflow's own docs** | mndflow `README.md`, `docs/`, `packages/*/docs` | the card traits, the parts mark and the reversed *holding is not a mark* rule are not written down there |
| **`vendor/mnd-kit-0.7.0.tgz`** | mndmap `vendor/` | nothing names it any more; safe to delete |


## Not yet driven

| | |
|---|---|
| **themes** | only `retro` was looked at since step 8; `modern` and `light` may draw the body, links and grey marks differently |
| **the folder case** | `scan.ts` graphs go through the same stacking, tray and root rules, but no folder was opened |
| **import / export** | not exercised against the new definitions, fields and card traits |
| **tests** | none written for steps 8–15: the design is still moving. mndflow's suite (374) passes; three assertions were rewritten where they named the filled icon and the old marks rule |


## Decisions

| | |
|---|---|
| **a table's schema is its own** | a field per column on the table block, with the form its cells read as. Never a definition. *Replaces "schema lives on a definition"* |
| **definitions are what is reused** | a definition earns its place by recurring — a column type now |
| **charts group, they don't flow** | definitions have no reading order, so a chart draws no backbone: column types group by section (`shared` first), the rest by kind. Relations show only in one definition's context |
| **context shows cards** | a definition in context shows the tables allocating it as cards, never as grids |
| **rows are values** | a table's rows are a grid's lines, not blocks: blocks are reusable parts, and a row is data. *Replaces "rows are usages"* |
| **a grid cell holds a value or a block** | a plain value where no block is seated; a seated block draws over it |
| **headers come from column types** | a grid reads its header from the definitions it allocates (`Grid.columns`), never from stored text, so a column has one name |
| **a column is a block type** | each distinct column name is one workspace definition, extending `md.column`, identified by name alone. *Replaces "a column becomes a block only once it proves reusable"* |
| **a header allocates, not uses** | a grid's header names the column type each column allocates. An allocation is not a usage: it adds no block to the tree |
| **the key is the table's** | the key column is marked on the table's own field (`Field.key`), the first for now |
| **an opened table is a cutout** | its grid in full at the centre, its section's heading above, the blocks read before and after it at either side, its columns' definitions and its schema below. *Replaces the class diagram toggle* |
| **headings anchor, not contain** | on the page a heading is the row its content reads in, never a layer to open. The held graph keeps the sections; only the drawing is flat. Deep nesting is left to the multi-document case |
| **only what holds opens** | `open` is offered only on a block with child content — a focus block's preview, a folder. A link is followed by double-click |
| **list items are body** | a list's items stay in its body as written; no item blocks |
| **icons for tables' parts** | a column type wears `md.column`'s `header_col`; a table's schema card wears `data` |
| **headings read centred** | a heading's card centres its name; nothing else does |
| **no rule blocks** | a thematic break carries no block; content after one joins the heading before it |
| **markdown lives in the body** | a block's body is its element as written — `## Title`, a fence with its language, `- [x] item`. The package declares no fields |
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
| **the shell is mndflow's** | `Tray`, `useTray`, `useDisplay`, the root default and the fields diagram (`Viewer` `fields`) ship in the kit, and mndflow's app runs on the same hooks. mndmap keeps reading, stacking, the `markdown` tab and reorganizing, and no longer draws the fields diagram |
| **the tray is read only in mndmap** | handed no `onAct`, it offers only the tabs that read. Display answers go to `onDisplay`, since how a drawing looks is the session's. A host's tabs lead a block's |
| **content-centric cards** | mndmap starts cards at 10 × 3 units; the document restacks to each card's height as it draws |
| **the reader's camera** | the pick is centred, two cards wide; zoomed out, never more than six. Both are constants in `ui/App.tsx` |
| **the explorer bar** | each tool toggles on its own (`filter`, `block`, `folder`, `remove`, `fold`); a host's tools go in `extra`, after the filter. mndmap turns `block` off and adds *add document*. Folds are one chevron, as an editor's tree draws them |

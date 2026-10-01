# Fields plan

**Tables become typed block fields, and fields become something a card, the explorer and a layer can
show.** Spans mndflow (the shell) and mndmap (the translator).

**Status: steps 1–23 done.** mndmap pins `@mnd/kit` 0.10.0. Step 23's kit half, and anything since
0.10.0, is **unreleased**: it lives in mndflow's working tree and reaches mndmap only through the
linked dev server. Release once it settles.


## Vision

| Piece | End state |
|---|---|
| **explorer** | three sections inside the workspace: `packages` (imported content), `definitions` (the user's working definitions), `usages` (the block tree, under a root node) |
| **root node** | heads `usages`, wears its own root mark |
| **schema** | a table's own: a field per column, with the form its cells read as, and its key column marked. Never a definition |
| **terms** | what two or more blocks mention — a column name, a value, a marked term — normalized to one key |
| **definitions** | only terms, filed by kind (`columns`, `tags`, `values`); a header allocates a shared column's, every other block is tagged with what it mentions |
| **projections** | diagrams drawn from the one explorer tree, each its own view under the same rules: the document (the page) and the library (packages and definitions) |
| **page** | one document reads as one flat page: headings anchor rows, and only focus blocks open |
| **values** | a table's data rows are values in a grid, headed by its column types — data, not parts. A block is kept for what is reusable |
| **DB mark** | any card whose block has a schema or set field values says so at a glance |
| **opened focus** | a cutout of its section: a box of the block and its neighbours, its section's heading above, a table's schema below — on one layer, with no view to toggle |
| **definition in context** | the definition in the middle, what it extends above, a box of its usages below pointing up to it |
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
| 18 | **cutouts and groups** *(groups replaced by 21)*: an opened table shows its section around it (heading above, neighbours at either side, columns and schema below). A chart groups definitions in labelled boxes — column types by section, `shared` first, the rest by kind (`KINDS`) — packed by the kit. One definition opens in context: the table cards allocating it under their headings, it under them, related columns below. The unpicked camera fits a drawing's width, not its room | mndmap `read.ts` (`beside`, `around`, `grouped`, `local`), `packages/markdown.ts` (`KINDS`), `ui/App.tsx`; mndflow `stage` `room` | done |

| 19 | **the tree walk**: the arrows walk the explorer's tree, in the kit — ↓/↑ siblings, out past a branch's end or up to its holder; → the next row in reading order; ← out. A row walked to is chosen as a click chooses it; `usages` is a row like the others. Double-click opens as Enter does (`Viewer` `onOpen`). mndmap's row-by-row keys go | mndflow `explorer` (`keys`), kit `Viewer`; mndmap `ui/App.tsx` | done |
| 20 | **folding**: the tree stays open only along the way to the pick; the bar's fold toggle holds them, so what the arrows open stays open. A section's fold shuts its branches but leaves it listed. The section holding the pick is lit, folded or not | mndflow `explorer`; mndmap `ui/App.tsx` | done |
| 21 | **one organisation**: a package files its definitions on a shelf of its own (`Package.shelf`), frozen with it, and lists as the workspace does — blocks and relations, folders, definitions; a package it extends reads inside it as a folder. The markdown package files `structure`, `prose`, `data`, `media`; the reader files column types by section. A band may say how wide it is, and a reference tied to nothing is shelved in it | mndflow `core` (`shelf_of`, `shelf_tree`), `explorer`, `views` `bands`; mndmap `read.ts` (`filed`), `packages/markdown.ts` | done |
| 23 | **shared terms**: a definition only for a term two or more blocks mention (`terms.ts`). Marked spans — column names, cell and short list-item values, code spans, bold, link text and targets, headings — normalize to one key: a value by its form (number, link, choice), words lowercase, separators cleaned, stemmed. Kind by strength: column, tag, value; filed `columns`, `tags`, `values`, named as most often written. A column heading one table only is plain text in its header (`Grid.columns` `""`). Other mentions tag the block (`Block.tags`), which the kit counts as usages. Opened focus blocks (tables, long lists and fences) draw a context box — before, the block, after — with the heading over it and a table's schema under it; column definitions leave the cutout. A definition opened draws its usages in one box under it, a directed `uses` line up to it. The crumbs are layers only, from the section. A table is named `<rows>x<columns> items`, a list `<n> items` | mndmap `terms.ts`, `read.ts` (`defined`, `filed`, `beside`, `around`), `library.ts` (`local`), `packages/markdown.ts`; mndflow `core` (`used_by`, types), `views` `block`, `stage` `Crumbs`, `theme` shell.css | done |
| 22 | **the library projection**: a row of `packages` or `definitions` drawn as nested boxes in the tree's order, `READ` (3) across; a row with definitions of its own draws them as a context — *extends*, *holds* and *allocates*, what lies outside dashed. `WIDEST` goes: an unpicked projection fits its width | mndmap `library.ts`, `ui/App.tsx` | done |


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
| **release the kit** | mndflow `release:kit`, mndmap `vendor/`, `package.json` | step 23's kit half exists only in mndflow's working tree. Cut a release once it settles, and re-pin |
| **two meanings of "allocated"** | mndflow `core` `allocations_of` | the kit already calls a block seated under a header reference *allocated*; a header naming a column type is a second meaning. Settle one word |
| **a picked definition card is hard to read** | mndflow `theme` | a picked stand-in for a definition fills blue, and its dim name nearly vanishes |
| **a package definition in context can be long** | mndmap `library.ts` `local` | `heading` in context is every heading in the document, `across` to a row |
| **tags are definition ids** | mndflow `core` `Block.tags` | `tags` held free words; mndmap now stores definition ids there. The kit's tray tags chip would show ids. A field of its own (`mentions`) may be cleaner |
| **term noise** | mndmap `terms.ts` | every marked span counts: `code`, `key`, `https://example.com` qualify on two mentions. A stoplist or a ranking may be needed once a corpus is read |
| **a picked usage box line jogs** | mndflow `views` `snap` | a card centred over a box snaps to the unit, so the line between them can bend by half a unit |
| **the document as a projection** | mndmap `read.ts`, `ui/App.tsx` | `usages` still draws the page on its own terms; it may become a narrowing projection like the library's |
| **`tree_of` lives in the React entry** | mndflow `explorer`, kit | `library.ts` reads the tree through `@mnd/kit/react`; the tree is pure and could ship from the core entry |
| **wide pages read small** | mndmap `ui/App.tsx` | with `WIDEST` gone, an unpicked page fits its widest row |
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
| **definitions are what is reused** | a definition earns its place by two or more blocks mentioning it — a column, a tag or a value. Nothing is defined for one block |
| **terms are normalized** | a value by its form, words lowercase, separators cleaned and stemmed, so `Passages`, `passage` and `**passages**` are one term |
| **tags, not lines** | blocks sharing a term are tagged with its definition, never joined by a line on the page; the definition in context shows them together |
| **projections follow the tree** | a projection draws what the explorer files, in its order, so the tree and the drawing never disagree and one walk reads both. Grouping is filing: a folder, in any section. *Replaces "charts group, they don't flow"* |
| **one organisation** | every section files the same way; a package differs only in being frozen |
| **context shows cards** | a definition in context shows its usages as cards, never as grids, in one box under it pointing up to it |
| **rows are values** | a table's rows are a grid's lines, not blocks: blocks are reusable parts, and a row is data. *Replaces "rows are usages"* |
| **a grid cell holds a value or a block** | a plain value where no block is seated; a seated block draws over it |
| **headers are the table's text** | a grid's first line holds its header as written; a shared column also allocates its definition (`Grid.columns`), `""` where none |
| **a column is a type once shared** | a column name heading two tables, or mentioned by another block, is a definition extending `md.column`. *Replaces "a column is a block type"* |
| **an allocation is a usage** | a table allocating a column counts among its usages, as a tagged block does |
| **the key is the table's** | the key column is marked on the table's own field (`Field.key`), the first for now |
| **an opened focus is a cutout** | a box of the block and the blocks read before and after it, its section's heading above joined to the box, a table's schema below. Column definitions are left to the definition in context. *Replaces the columns under the table* |
| **crumbs are layers** | one crumb per layer, from the section drawn — `usages`, `packages`, `definitions` — and what is opened on it. Folders are the explorer's to show; nothing is folded to `…` |
| **size names** | a table is named `<rows>x<columns> items`, a list `<n> items`: what it holds, not its first header |
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
| **the reader's camera** | the pick is centred, `READ` (3) cards wide; unpicked, a projection fits its width. A constant in `ui/App.tsx` |
| **navigation is the tree's** | the arrows walk the explorer, in the kit, and a row walked to is chosen as a click chooses it; folding follows the walk unless the bar's toggle holds it |
| **the explorer bar** | each tool toggles on its own (`filter`, `block`, `folder`, `remove`, `fold`); a host's tools go in `extra`, after the filter. mndmap turns `block` off and adds *add document*. Folds are one chevron, as an editor's tree draws them |

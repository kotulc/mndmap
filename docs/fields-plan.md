# Fields plan

**Working plan for this session.** Tables become typed block fields, and fields become a first-class
thing a card, the explorer and a layer can show. Spans mndflow (shell) and mndmap (translator).


## Vision

| Piece | End state |
|---|---|
| **explorer** | three sections inside the workspace: `packages` (imported content), `definitions` (the user's working definitions), `usages` (the block tree, under a root node) |
| **root node** | heads `usages`, wears its own root mark instead of the `wks` word |
| **schema** | a block's fields are declared by its definition — a table's header row is a schema |
| **values** | a usage carries values for those fields — a table's data row is one usage |
| **DB mark** | any card whose block has a schema or set field values says so at a glance |
| **field layer** | a block's fields project into a layer of their own: a sub-block / class-diagram view |
| **card** | overhauled to carry fields legibly; done last, once the above says what it must show |


## Steps

Each step is driven in the app before the next starts.

| # | Step | Where | Done when | Status |
|---|---|---|---|---|
| 1 | **table → schema + usages**: each unique header row is one workspace definition (extends `md.row`, a field per column); each row is a usage of it, a child of its table, named by the table's `key` column (first by default, set per table block) | mndmap `read.ts`, `packages/markdown.ts` | sample tables open with rows typed by their table's definition; tray shows the values | done |
| 2 | **field forms inferred**: a column of numbers is `number`, links `link`, `yes/no` `flag`, else `text` | mndmap `read.ts` | the sample's forms read right in the tray | done |
| 3 | **explorer sections**: `packages` · `definitions` · `usages` | mndflow `explorer` | both apps show the three sections; mndmap passes `section` so its library draws | done |
| 4 | **root mark**: a root icon for the root row | mndflow `theme`, `explorer` | root row reads as a root | done |
| 5 | **DB mark** on cards with schema or values | mndflow `core`, `theme`, `stage` | table and row cards wear it; plain text cards do not | done |
| 6 | **field layer**: the fields tab's `view diagram` chip draws a class card for the schema and a card per usage, listing values | mndflow `views` (`fields_graph`), `stage`, `tray`, kit `Viewer` | a table opens to a class-diagram-like view of its schema | done |
| 7 | **field model revised**: markdown's own fields move into the body; only a table's `key` stays a field | mndmap `read.ts`, `packages/markdown.ts` | headings, fences, lists no longer wear `DB` | done |
| 8 | **card overhaul**: first cut is card size and workspace display through the root, and the shell moved into mndflow | mndflow `kit`, `tray`, `explorer`; mndmap `App.tsx` | wider cards, settings on the root, tray open on the workspace | in progress |


## Open questions

| Question | Why it matters |
|---|---|
| **link cells keep only their target** | `[b](http://b.io)` stores `http://b.io`; the visible text is lost |
| **a tall document zooms far out** | the root layer is one long column, so fitting it shrinks the wider cards; worth a look in the card overhaul |
| **the class card sits under the usages** | a reference is seated after the blocks it stands beside; putting it on top wants the card overhaul |
| **kit release** | mndmap runs against `../mndflow`; the pinned `0.7.0` tarball predates this work, so a release and re-pin is due |


## Decisions

| | |
|---|---|
| **schema lives on a definition** | one per unique header row, filed in `definitions` |
| **rows are usages** | child blocks of their table, named by its `key` column — first column by default, settable per table block |
| **root row** | shows the document's own name, with a root mark |
| **workspace** | the session's container: state and metadata, plus the user package. Imported/exported whole. mndflow `definitions.md` to match |
| **user package** | `definitions` + `usages`: the graph root with its tree, plus the user's definitions. Imported/exported on its own |
| **`packages` section** | imported content only; another user's package lands here |
| **marks describe** | `Def` or `Ref`, never both; descriptive marks (`DB` = populated fields or schema) stack, never alongside `Def`/`Ref`. `Ext` goes away. A table and its rows both wear `DB`. mndflow `names.ts` to match |
| **no workspace heading** | the explorer panel is the workspace; its three sections sit at the top |
| **tray is read only** | the kit's `Tray`, handed no `onAct`, offers only the tabs that read; nothing takes input and option rows are left out. mndmap only reorganizes |
| **`card.fields`** | a card option that lists fields in a compartment; the diagram sets it on every card |
| **markdown lives in the body** | a block's body is its element as written — `## Title`, a fence with its language, `- [x] item`. The package declares one field, a table's `key` |
| **workspace display via the root** | picking the root opens the `workspace` tab: card size, legend, lattice. Session state, never in a file; the navbar lattice toggle is gone |
| **content-centric cards** | mndmap starts cards at 10 × 3 units; the document restacks to the card height as it draws |
| **`DB` is drawn** | a database cylinder, not letters; stand-in marks stay written words |
| **the shell is mndflow's** | `Tray`, `useTray`, `useDisplay`, the explorer's root-default pick and the fields diagram (`Viewer` `fields`) live in mndflow and ship in the kit; mndflow's own app runs on the same hooks. mndmap keeps reading, stacking, the `preview` tab and reorganizing |
| **tray open, root by default** | the tray starts open; nothing picked on the root layer is the root picked, on its `workspace` tab |

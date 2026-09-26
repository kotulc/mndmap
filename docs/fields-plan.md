# Fields plan

**Tables become typed block fields, and fields become something a card, the explorer and a layer can
show.** Spans mndflow (the shell) and mndmap (the translator).

**Status: steps 1–7 done; step 8, the card overhaul, has its first cut only.** Released as
`@mnd/kit` 0.8.0 (mndflow `8871eaf`); mndmap is pinned to it.


## Vision

| Piece | End state |
|---|---|
| **explorer** | three sections inside the workspace: `packages` (imported content), `definitions` (the user's working definitions), `usages` (the block tree, under a root node) |
| **root node** | heads `usages`, wears its own root mark |
| **schema** | a block's fields are declared by its definition — a table's header row is a schema |
| **values** | a usage carries values for those fields — a table's data row is one usage |
| **DB mark** | any card whose block has a schema or set field values says so at a glance |
| **field layer** | a block's fields project into a view of their own: a class diagram |
| **card** | overhauled to carry content and fields legibly |


## Steps

| # | Step | Where | Status |
|---|---|---|---|
| 1 | **table → schema + usages**: each unique header row is one workspace definition (extends `md.row`, a field per column); each row is a usage, a child of its table, named by the table's `key` column | mndmap `read.ts`, `packages/markdown.ts` | done |
| 2 | **field forms inferred**: numbers → `number`, yes/no → `flag`, links → `link`, else `text` | mndmap `read.ts` | done |
| 3 | **explorer sections**: `packages` · `definitions` · `usages` | mndflow `explorer` | done |
| 4 | **root mark**: a root icon on the root row, never filled | mndflow `theme`, `explorer` | done |
| 5 | **DB mark**: a drawn database on cards with values or a workspace schema; marks stack | mndflow `core`, `theme`, `stage` | done |
| 6 | **field diagram**: the fields tab's `view diagram` draws a class card for the schema and a card per usage | mndflow `views` (`fields_graph`), `stage`, `tray`, kit `Viewer` | done |
| 7 | **field model revised**: markdown's own syntax lives in the body; the package declares only a table's `key` | mndmap `read.ts`, `packages/markdown.ts` | done |
| 8 | **card overhaul** | mndflow `stage`, `views`, `theme` | **first cut** — content-centric card size, workspace display on the root, the shell moved into mndflow. The rest is below |


## Handoff: what remains

| Task | Where | Notes |
|---|---|---|
| **a tall document zooms far out** | mndflow `stage` camera, or mndmap stacking | the root layer is one long column, so fitting it shrinks the 10 × 3 cards to unreadable. Options: fit to width, cap the zoom-out, or lay long layers in columns |
| **class card sits under its usages** | mndflow `views` `arrange.ts` / `pack.ts` | a reference is a satellite, seated after the blocks beside it. A class diagram wants the schema on top |
| **usage → class lines** | mndflow `views/fields.ts` | the diagram draws no relation from a usage to its class; a dashed *instance of* line was proposed and never built |
| **the card face** | mndflow `stage` `nodes.tsx`, `flow.css` | a card still shows a clipped name only; content-centric cards want the body's first lines, and the field compartment's styling is a first pass |
| **the `key` column can't be changed** | mndmap, and a tray edit | the decision says *settable per table block*; it is only ever the first column, since mndmap edits nothing but order and names |
| **link cells lose their text** | mndmap `read.ts` `value_of` | `[b](http://b.io)` stores `http://b.io`. Keep the markdown as the value, or split text and target |
| **read-only tabs that still look live** | mndflow `tray` | without `onAct`, the definitions, packages and usages tabs act with nothing but draw their inputs as usual. Recorded in mndflow `docs/stories.md` |
| **one diagram pick lights two rows** | mndflow `tray` / mndmap `App.tsx` | the class card holds its definition while the table stays picked. Recorded in mndflow `docs/stories.md` |
| **`vendor/mnd-kit-0.7.0.tgz`** | mndmap `vendor/` | nothing names it any more; safe to delete |


## Not yet driven

| | |
|---|---|
| **the folder case** | `scan.ts` graphs now go through the same stacking, tray and root rules, but no folder was opened this session |
| **import / export** | the header's import and export were not exercised against the new definitions and fields |
| **tests** | none were written: the design moved every round. mndflow's suite (374) passes and was updated where its assertions named the old marks and tools |


## Decisions

| | |
|---|---|
| **schema lives on a definition** | one per unique header row and form, filed in `definitions`; tables sharing one share it |
| **rows are usages** | child blocks of their table, named by its `key` column — the first unless set |
| **markdown lives in the body** | a block's body is its element as written — `## Title`, a fence with its language, `- [x] item`. The package declares one field, a table's `key` |
| **workspace** | the session's container: state and metadata, plus the user package. Imported and exported whole |
| **user package** | `definitions` + `usages`: the root and its tree, plus the user's definitions. Imported and exported apart; another user's lands under `packages` |
| **root** | shows the document's own name, with a root mark. Nothing picked on the root layer is the root picked, on its `workspace` tab |
| **marks describe** | a stand-in wears one written word — `Def`, `Ref`, `Pkg`. Anything else wears what describes it, drawn, and those stack: `data` is a database. `Ext` is gone. A table and its rows both wear `data` |
| **`card.fields`** | a card option listing fields in a compartment; the diagram sets it on every card |
| **the shell is mndflow's** | `Tray`, `useTray`, `useDisplay`, the root default and the fields diagram (`Viewer` `fields`) ship in the kit, and mndflow's app runs on the same hooks. mndmap keeps reading, stacking, the `preview` tab and reorganizing |
| **the tray is read only in mndmap** | handed no `onAct`, it offers only the tabs that read. Display answers go to `onDisplay`, since how a drawing looks is the session's |
| **content-centric cards** | mndmap starts cards at 10 × 3 units; the document restacks to the card height as it draws |
| **the explorer bar** | each tool toggles on its own (`filter`, `block`, `folder`, `remove`, `fold`); a host's tools go in `extra`, after the filter. mndmap turns `block` off and adds *add document*. Folds are one chevron, as an editor's tree draws them |

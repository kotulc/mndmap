# Sections plan

**Explorer sections set a document's full context, and every section keeps mndflow's 1:1
alignment: one explorer row is one canvas layer, and a layer's `group` holders organize it locally,
never as folders.** Spans mndmap (the reader) and mndflow (the shell).

**Status: step 1 built** (kit half unreleased: mndflow working tree only).


## Vision

| Section | Role | Groups it sets |
|---|---|---|
| **packages** | the vocabularies imported and active for the content being read | — |
| **definitions** | grouping and pattern behavior: block sets | **collection** (folders, documents), **document** (sections, by heading), **content** (text, code, tables, …) |
| **usages** | the content's actual block structure | — |

| Rule | |
|---|---|
| **a package is vocabulary and projection** | the markdown package sets both the active vocabulary *and* how that vocabulary is drawn. Room to grow: other packages, other projections |
| **one row, one layer** | a row of the explorer is a layer on the canvas; its child rows are what that layer holds. No folder rows that are not layers |
| **references aren't rows** | a layer of references to blocks that live elsewhere (a definition's usages) opens on the canvas but lists nothing in the tree |
| **groups are local** | a group boxes blocks on its layer. It is membership, not parenthood |
| **groups are tags** | a block's groups are its `Block.tags` — the only tags. The explorer's filter will key off them |
| **no terms** | shared columns, tags and values go; groups are how blocks are organized across a document |
| **sections filter** | together the sections are the filter over content and views: vocabulary (packages), grouping (definitions), structure (usages) |
| **order is the user's** | dragging a section, group or block reorders it, and the explorer follows |


## Step 1: align the reader with mndflow

| Projection | Section | Shape |
|---|---|---|
| **group membership** | packages | flat: `markdown > {definition}`, the base package its own row under `packages`. The package layer boxes its definitions by group, drawn as now |
| **relationship tree** | definitions | a definition's child layer: what it extends over it, its usages under it. A leaf in the tree |
| **document chains** | usages | the document is one flat layer: blocks grouped by section (heading) and split at content-type boundaries |

| Change | Where |
|---|---|
| shelf entries are tagged with a group instead of filed `in` a folder; a package's base lists as its own package | mndflow `core` `shelf`, `explorer` |
| terms removed | mndmap `terms.ts`, `read.ts` `defined`/`filed`, `packages/markdown.ts` `COLUMN`/`VALUE`/`TAG` |
| one flat document layer: section groups, merged content blocks, tables, lists and fences inline | mndmap `read.ts`, `series.ts` |
| focus blocks, previews and cutouts removed | mndmap `read.ts` (`paged`, `beside`, `around`), `ui/App.tsx` |


## Sizing inline blocks

Proposed: a section lays its blocks on a grid of card columns. A block's size is a whole number of
default cards, so rows stay on the lattice.

| Rule | |
|---|---|
| **small blocks share a row** | text, a short list, a short fence: one card wide, `across` to a row |
| **big blocks take spans** | a table spans one column per ~2 of its columns, a long fence or list 2; never wider than the row |
| **a height cap** | a block is at most `TALL` default heights (e.g. 3); past it, it is cut with `…`. Picked or under `full content`, it grows |
| **a row is its tallest** | blocks in a row top-align; the section box grows to its rows |
| **a wide block breaks the row** | a block wider than what is left of a row starts the next one, so order is kept |


## Decisions

| | |
|---|---|
| **a heading is a section group and a heading block** | `md.section` extends `group`, named by the heading as written; `md.heading` is its first member, the backbone card. Nested headings are nested groups |
| **prose merges** | consecutive paragraphs and quotes are one `text` block; a table, list, fence or image is its own |
| **groups aren't rows** | the explorer lists a layer's blocks in reading order through its groups — headings among them; group holders are not listed, in any section |
| **flow lines** | directed `md.flow`: to each heading from its parent's or the sibling's before it, and from a heading through its content. Drawn, never stored. *Replaces "no flow or member lines"* |
| **the backbone** | headings down the page, each section's content in rows beside its heading, its own sections boxed inside it a column right — the staircase. Placed by hand: a section group is drawn `arrangement: free`, which the kit reads as *members keep their places* |
| **membership is truth** | `group` is stored; `Block.tags` are derived from it on read — a block's sections and its content group |
| **definitions are kinds** | the definitions section holds group kinds (`section`, and the content groups), not one per heading |
| **one set of content groups** | the package's groups (`structure`, `prose`, `data`, `media`) are the content groups |
| **relations group on their own** | a package's relation definitions sit in a group of their own on its layer: `flow` in markdown's, `line` and `tie` in base's |
| **packages nest** | the `packages` chart boxes each package, and inside it a box per group it files |
| **span and cap sizing** | as above; no masonry, so reading order holds |


## Open

| Item | Notes |
|---|---|
| **two `section` definitions** | `md.section` (vocabulary) and `kind.section` (group kind) share a name |
| **`section` tag is noise** | every block under a heading carries it; per-section tags would make it filterable |
| **collection groups** | not built: a single document's root stands in for it |
| **picked blocks don't grow** | the `TALL` cut lifts only under `full content` |
| **heading and box label repeat** | a section box's label and its heading card both say the heading |
| **span-2 heights** | measured at one card wide, so wide prose and lists run tall |
| **edits and groups** | a drag joins the group it lands beside; delete and rename of a section are unreachable (sections are not rows) and leave members ungrouped if reached |
| **folder layers** | `laid` places the root layer only; an opened folder's blocks are unplaced |
| **library folders in mndflow** | the explorer no longer lists shelf folders, so mndflow's app loses folder filing in its tree |
| **README** | still describes terms, focus blocks and the flat page |

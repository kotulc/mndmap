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
| **the backbone** | headings down the page, each section's content in rows beside its heading, its own sections boxed inside it, stepped `INDENT` (2 units) right — the staircase. A box is labelled `section (N blocks)`, counting the content beside its heading. Placed by hand: a section group is drawn `arrangement: free`, which the kit reads as *members keep their places* |
| **membership is truth** | `group` is stored; `Block.tags` are derived — a block is tagged with each kind that takes its definition as a member |
| **kinds take members** | a kind is a workspace group definition whose `allows.members` names the package definitions it takes: `structure` takes section, heading and frontmatter. No `section` kind: `structure` covers sections |
| **definitions are kinds** | the definitions section holds the content kinds, not one per heading. The explorer lists a group definition's members under it (kit, any group): `definitions > prose > text, list, code`. Usages are drawn, never rows |
| **one set of content groups** | the package's groups (`structure`, `prose`, `data`, `media`) are the content groups |
| **relations group on their own** | a package's relation definitions sit in a group of their own on its layer: `flow` in markdown's, `line` and `tie` in base's |
| **packages nest** | the `packages` chart boxes each package, and inside it a box per group it files |
| **groups may have a head** | a holder's `allows.heads` names what may head it; its head is its first member when that member is one. Derived, never stored. `md.section` is headed by `md.heading` (kit `group_head`, `headed_group`) |
| **heads are handles** | the explorer steps a headed group's other members in under the head's row, folds them there, and drags the whole group with it. Groups are still not rows |
| **a move lands by the row above** | moved blocks join the group of the row above where they land — the group it heads, where it heads one; landing before a head is landing before its group. What a move carries keeps its own grouping |
| **arrows read in order** | ↑ and ← go to the row before, ↓ and → to the row after, through the whole tree; the way opens as they walk |
| **every section folds** | a section of plain rows offers its fold toggle too, folding itself |
| **kind names** | a list is named `list (N items)`, a table `table (RxC items)`, a section box `section (N blocks)` |
| **one drawing per library section** | `packages` and `definitions` are each one drawing, as the page is for usages: a package row picks its box, a definition row its card, and the camera follows. No per-package charts |
| **definitions projects usages** | `definitions` draws the usages by kind as the page draws them by section, with the same backbone (`backbone.ts` `staircase`): a box per kind headed by its card, a box per definition it takes headed by that one's card, its usages flowing beside it in reading order |
| **packages jumps to definitions** | Enter or double-click on a definition in `packages` goes to its box on `definitions`. The definition-in-context view is gone |
| **one row lit** | a definition listed twice lights only its row in the section drawn, and the arrows walk from there |
| **span and cap sizing** | as above; no masonry, so reading order holds |


## Open

| Item | Notes |
|---|---|
| **collection groups** | not built: a single document's root stands in for it |
| **picked blocks don't grow** | the `TALL` cut lifts only under `full content` |
| **span-2 heights** | measured at one card wide, so wide prose and lists run tall |
| **edits and groups** | a section can't follow its last subsection as a sibling by drag (it nests under the row above); deleting a head leaves its group headless |
| **folder layers** | `laid` places the root layer only; an opened folder's blocks are unplaced |
| **library folders in mndflow** | the explorer no longer lists shelf folders, so mndflow's app loses folder filing in its tree |
| **wrapped rows flow back** | a row that wraps draws its flow line back across to the next row's start |
| **README** | still describes terms, focus blocks, the flat page and the old arrow keys |

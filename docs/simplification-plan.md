# Simplification plan

**One rule, one home.** Successive refactors left the same decision made in several places — each app, each panel, and core — each copy with its own special cases, drifting apart. This plan records what has been consolidated, how to find the rest, and the leads found so far. Spans mndflow (the kit and the editor) and mndmap (the reader). The model's rules are in rules.md; this is about where code lives, not what it decides.


## The smell

| Sign | Looks like |
|---|---|
| **a rule restated per host** | mndflow's `App.tsx` and mndmap's `App.tsx` each deciding what opening, leaving or a pick does |
| **glue syncing two states both ways** | effects tracing the sections from the canvas and the canvas from the sections |
| **a special mode with its own handlers** | `forest_pick` / `forest_act` beside `pick` / `act`; a prop added for one case (`drawn`) |
| **a heuristic standing in for a rule** | "the deepest row listing it" instead of "the row in the section the canvas shows" |
| **a magic id or kind leaking out of its owner** | `FOREST` used outside views; base ids (`"folder"`, `"note"`) branched on in panels |
| **a role re-derived by hand** | `parent === null`, `.def`, `type === "folder"` where core has `tree_of`, `in_domain`, `organizes` |
| **the same table twice** | two `NEEDS` maps saying what a kind cannot be made from |

**The test:** if changing one behaviour means editing more than one package, or both apps, the rule has no single home.


## Done: navigation (2026-10-04)

| Before | Now |
|---|---|
| open, leave and reveal decided in mndflow's `App.tsx`, again in mndmap's `App.tsx`, and in core's `open` / `reveal` actions, each with its own cases | **core `navigate.ts`**: `open_at`, `leave_at`, `reveal_at` say where the canvas goes; `held_at` says what the sections hold for it. Core's actions, mndflow and mndmap all call them |
| the overview as a separate app mode: `forest_graph` built in the app, `forest_pick`, `forest_act`, a slot filter, a second projection | `project(graph, null)` draws it; the stage gets the real graph and the ordinary handlers; read-only is `layer === null`. `FOREST` and `forest_graph` are internal to views |
| the explorer's accent edge from an `open` prop, a `drawn` prop and a deepest-row guess | one rule in the explorer: a structure's open layer in the structure section, else the overview's pick (or held package) in the sections above |
| sections traced by several effects and handlers | mndflow: one `follow()` after the canvas moves; mndmap: one `go(view)` |

**Where things live now**

| Concern | Home |
|---|---|
| roles by position (domain, tree, structure, holder) | core `defs.ts` (`tree_of`, `in_domain`, `owner_def`), `holders.ts` (`organizes`, `inline`, `layer_of`, `drawn_in`) |
| navigation | core `navigate.ts` |
| what a section lists | explorer `chain.ts` (`editor_slices`, `domain_listing`, `structure_listing`, `listed`) |
| rows, marks and highlights | explorer `rows.ts`, `Explorer.tsx` |
| what a layer draws, the overview, layouts | views `block.ts` (`project`), `packages.ts`, `page.ts`, `outline.ts`, `arrange.ts` |
| gestures to actions | stage `moves.ts`, `Stage.tsx` |
| settings resolution | core `defs.ts` (`stated`, `setting_of`, `traits_of`) |


## How to look

**Read both apps' `App.tsx` side by side first**: anything both decide is a rule without a home. Then search, and for each hit ask *does core or a kit package already answer this?*

| Hunt | Search |
|---|---|
| base kinds branched on outside core | `grep -rnE '"(folder\|note\|group\|grid\|reference\|interface\|tag\|tie\|line)"' --include=*.ts --include=*.tsx packages apps ../mndmap/src` (excluding core and defs) |
| roles derived by hand | `grep -rnE 'parent === null\|\.def\b' ...` outside core |
| the workspace standing in for "no layer" | `grep -rn '?? graph.root\|?? ctx.graph.root'` — 13 sites today; each should say which it means |
| per-host navigation or selection | `grep -n 'look(\|pick(\|onTrace\|onChoose' apps/web/src/App.tsx ../mndmap/src/ui/App.tsx` |
| tables kept twice | `grep -rn 'const NEEDS\|Record<string, string> = {'` |
| props added for one case | read each component's props for ones only one host passes |
| several "what kind is this" readers | `role_of` (core `names.ts`), `mark_of` (explorer `rows.ts`), `marks_of` (views `derive.ts`) |

**Survey counts (2026-10-04)** — base-kind strings outside core and defs: stage `Stage.tsx` 19, explorer `rows.ts` 16, stage `drag.ts` 10, tray `rows.ts` 9, views `scene.ts` 7, tray `Tray.tsx` 7. Hand-derived roles: stage `nodes.tsx` 5, explorer `rows.ts` 4, views `through.ts` 3. Some are drawing kinds (a node's type), not base ids — confirm before moving.


## Leads

| # | Lead | Suspicion | Likely home |
|---|---|---|---|
| 1 | **mndmap `edits.ts`** | a second action system: move, create, rename and delete re-implemented, with their own placement rules (`in_collection`, `filed`), beside core's actions | core's actions run on mndmap's held graph, or one shared placement check |
| 2 | **`NEEDS` twice** | web `App.tsx` and core `actions/helpers.ts` each say what a kind cannot be made from, in different words | core's alone; the drop asks `create`'s `check` |
| 3 | **drop resolution** | web `App.tsx` `dropped()` decides retype, tie or create; stage `moves.ts` resolves canvas drops; mndmap has its own | one resolver in stage or core |
| 4 | **three kind readers** | `role_of`, explorer `mark_of`, views `marks_of` each decide what a block reads as | one reader in core; the others map its answer to icons and classes |
| 5 | **`?? graph.root`** | the workspace root as a fallback for "no layer", from when `null` meant the workspace | each site says what it means: the overview, or the workspace's domain |
| 6 | **explorer `listed()` vs core roles** | the chain re-derives domain and structure membership | core's `in_domain` / `tree_of`, as `held_at` uses |
| 7 | **tray listings** | the tray's definition grouping and `rows.ts` may re-list what the explorer's chain lists | the chain's listings |
| 8 | **stage menus** | `Stage.tsx` offers per kind (box, band, seat, note) by base strings | the registry's scopes and `when` |
| 9 | **highlight rules** | `lights`, `holds` and the edge in `Explorer.tsx` each read the chain and the picks differently | one function from the canvas view and the chain |


## How to take one

| Step | |
|---|---|
| **confirm** | read every copy; list where they disagree — a disagreement is a bug one copy has |
| **pick the home** | the lowest package that can answer it without knowing a host: core for model rules, a kit package for presentation |
| **move, then delete** | one function in the home; each copy becomes a call; nothing kept for compatibility |
| **drive both apps** | the same browser scripts as the refactor; a rule moved is unverified until both hosts have run it |
| **record** | move the lead to *Done* with where it lives now |

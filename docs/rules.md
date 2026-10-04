# Rules

The model's rules, under review before the next refactor (holding by `parent`, organizers without `def`, flatten in projection). Each rule is **decided**, **open**, or **kept**. Spans mndflow (the kit and the editor) and mndmap (the reader).


## Concepts (decided)

| Term | Is |
|---|---|
| **package** | a root block (`parent: null`) |
| **definition** | a named tree in a package: a block carrying `def`. Usable or extendable by `type` whether or not anything does. Abstract: never placed or linked as an instance |
| **structure** | what a tree holds: usages and holders, to any depth |
| **usage** | a block without `def`. Its `type` is a definition, which may be a base |
| **holder** | a block that holds by `parent`: folder, group, grid. Not a definition. Organizes a domain or a structure alike |
| **tree** | a non-holder block whose ancestors up to its package are all holders: a definition, or a usage placed in the domain. A block has one parent; a tree's root is its first non-holder ancestor (or itself) |
| **domain** | a package root, the holders under it, and the trees they organize. Everything under a tree's root is that tree's structure |
| **projection** | a view of the slice the sections hold, from one layer; the overhead view is the top layer with folders flattened |


## Placement

| Rule | Status |
|---|---|
| a definition never sits inside a definition | decided |
| a definition may sit in holders, however deep; it is still a tree of its package | decided |
| a usage may sit in a domain, as a tree of its own | decided |
| the structure section opens on any tree: a definition or a usage in the domain | decided |
| holders, notes and references may sit anywhere | decided |
| a package holds no usages; a definition sits only in a package or a definition (`actions/blocks.ts` create and move) | drop |


## Holders

| Rule | Status |
|---|---|
| one containment: `parent`. `Block.group` and `set_group` go | decided |
| folder hides its contents (descend to see them); group and grid draw theirs inline | decided |
| a definition always draws as a card; its structure is reached by descending | decided |
| the layer a block draws on is its nearest ancestor that hides its contents | decided |
| the overhead view draws folders as groups (flatten) | decided |
| deleting a holder deletes its subtree | decided |
| anything in a grid cell draws compact (its plain card), so any block may sit in a cell, holders and grids included | decided |
| a holder takes only blocks on its own layer (`can_hold`) | drop |
| a grid sits in nothing and holds no group (`actions/groups.ts`) | drop |
| members outside their holder are freed or repaired (`fold.ts` `freed`, `door.ts`) | drop |
| an empty definition is no holder (`shape_of`) | drop: a definition is always a card |
| a grid header holds only a label or a reference (`actions/grid.ts`) | drop: a header holds any block, drawn compact |


## Relations, tags, traits

| Rule | Status |
|---|---|
| relations and tags hold no structure | decided |
| a tag is a definition with no structure, used by being carried in `tags` | decided |
| a **trait** is a tag carrying settings: a capability tag. A block lists its traits apart from its plain tags | decided |
| `tie` is a base relation type, chosen like any other; nothing forces it | decided |
| a relation touching a note is forced to `tie` and cannot be retyped (`derived_base`, `edge_base`) | drop |
| a tie trait links a block made from, or dropped on, another block to it with a relation of a given type, as a note is attached today (context menu, drag from the explorer). Made on its own, it is linked to nothing | decided |
| tags name in their own name space (`def_named`, `tag_named`) | drop: one name space per package |
| definitions are never linked, except by a tie trait (a note tied to a definition) | decided |
| a tie trait links only within one layer: the block it is made from or dropped on sits on its layer | decided |
| folder, group, grid and note stay bases: `base` enumerates the functionally distinct block kinds, a minimal set | decided |


## Capabilities

| Rule | Status |
|---|---|
| settings alone say what a kind may do | decided |
| a capability is added to or removed from a subtype as a trait, easily and visibly | decided |
| traits are stored in their own field, `traits`, apart from `tags` | decided |
| `allows.holder` goes: which holder a block is (folder, group, grid) is its base | decided |
| precedence: per link of the `type` chain, self first: its own settings, then its traits in order. Nearest wins | decided |
| traits are inherited until a subtype says its own; then its set is the only one. Reset gives it back to the chain, as with style | decided |
| `note` stays a base; it carries resizable and body content traits | decided |
| structure is a definition's own and is never inherited: a subtype inherits settings and traits, not structure | decided |
| a usage reads through one step: its type's own structure, never a chain | decided |
| **a definition never uses itself**: no usage typed by it anywhere in its own structure, at any depth. Refused at every gesture that makes or retypes a usage; reported (`review`) where loaded data breaks it | decided |
| self-use is checked directly only: `D` holding an `E` that holds a `D` is not checked, for now | decided |
| the check is by exact type: `D` may hold an `S` where `S extends D` | decided |
| `type` on a definition names one above it: never itself, never one that extends it. Refused at the gesture; `isa`'s guard stays for loaded files | decided |
| reference and note hold nothing whatever their settings say (`may_hold`) | drop |
| a note has no wall (`actions/relations.ts`) | drop: `ports: false` says it |
| bases that hold nothing (`FLAT` in `tags.ts`) | drop: read from settings |


## Definitions and packages

| Rule | Status |
|---|---|
| removing a definition that is used is refused | decided |
| removing a used definition rewrites its usages and subtypes (copies settings, schema to values) | drop |
| removing a definition that holds definitions is refused | drop: cannot happen |
| new definitions are filed into `blocks` / `relations` / `tags` by kind (`filed`) | drop: they land where the user is |
| organizing groups carry `def` (`empty_graph`, base package) | drop |
| a stand-in may not repeat one already in the layer, nor stand for a block already there | drop |
| a definition is named | kept |
| no block contains itself; no cycles | kept |
| a frozen package is read only; `base` and the workspace are not removed; a used package is not removed | kept |


## Canvas and sections

| Rule | Status |
|---|---|
| the explorer browses; the canvas is the target. Choosing a row selects it (the tray shows it) and leaves the canvas where it is | decided |
| the canvas draws what was last opened: double-click, Enter or → opens; ← and Backspace leave | decided |
| context highlighting and breadcrumbs show the canvas's context, never what is browsed | decided |
| a definition dragged from any package onto the canvas lands in the opened structure | decided |
| picking within the opened tree may change the layer drawn (reveal); browsing outside it never does | decided |

## Read-through in the explorer

| Rule | Status |
|---|---|
| a usage's row lists its definition's blocks, then its own children; listed when unfolded, folded by default | decided |
| a definition's block under a usage is marked: dimmed, a link glyph, "from `D`" on hover. Its card on the canvas wears the same mark | decided |
| rows and picks of such a block carry its route (`usage/block`), so two usages of one definition light apart | decided |
| opening a marked row (Enter, double-click) goes to its definition, the block picked there | decided |
| opening a usage's own row opens the usage: its parts and its own children | decided |
| after the refactor: release the kit (0.11.0), re-pin mndmap, and delete the older tarballs in `vendor/` | decided |

## Layouts

| Rule | Status |
|---|---|
| a layer's layout is a setting, `layout: { kind, … }`, said by its definition and overridable by the block, inherited like any setting | decided |
| the kit ships a small fixed set of named layouts: `free`, `auto`, `outline` (mndmap's backbone, moved in); an unknown kind draws as `auto` | decided |

## Collections (mndmap)

| Rule | Status |
|---|---|
| a scan records names and `source` paths only; no text enters the graph | decided |
| the host keeps the session's file handles (or `File`s) by `source`; opening a document reads its file then, current text, and parses it into structure | decided |
| which documents are read is session state, not a field | decided |
| `body` is a description only, never unread text | decided |

## Packages and the explorer

| Rule | Status |
|---|---|
| every package, `base` and `markdown` included, is defined, imported and exported as `.json`; hosts keep only the id constants their code reads | decided |
| a package is the smallest unit of export; no subtree files | decided |
| workspaces, settings and every element are definable as `.json` | decided |
| the explorer always has sections; the single-tree mode goes | decided |

## Schema changes

| Change | Replaces |
|---|---|
| `parent` is the only containment | `Block.group`, `set_group` |
| organizers carry no `def` | `def: {}` on organizing groups |
| a new workspace: root and `main`, nothing else; groupings are the user's, shown by samples | magic ids `workspace.blocks`, `.relations`, `.tags` |
| the samples (the extended sample in both repos) re-saved under these rules, to inspect the results | with the refactor |
| `layer: null` is the forest; the workspace is always `graph.root` | `@packages`, `packages_graph`, `package_card` |
| `traits`: a block's capability tags, apart from `tags` | new |
| file schema reset to `1.0`, not incremented until the model settles | `SCHEMA = "4.0"` |
| mndflow reads and writes only package and workspace files; a host's session state (mndmap's read documents) is the host's | |
| `layout` setting | `Block.arrangement`, `set_arrangement` |
| unchanged: `def`, `type`, `settings`, `values`, `tags`, `cell`, `grid`, `uses`, `of`, edges, `fromPart` / `toPart` | |


## Open

| Item | Notes |
|---|---|

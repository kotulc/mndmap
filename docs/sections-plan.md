# Sections plan

**Everything is a block, and a package is a graph.** A package's top-level blocks are its definitions; what a definition holds is its structure. The explorer's sections are depth in that one tree: packages → definitions → structure in the editor, collection → document in the reader. Spans mndflow (the kit and the editor) and mndmap (the reader).

**Status:** step 3 built in both repos, uncommitted. mndflow typechecks and passes 352 tests; mndmap typechecks against the rebuilt kit; both apps driven in a browser on the extended sample and `samples/docs`.


## Model

| Term | What it is |
|---|---|
| **package** | a graph's root block (`parent: null`). `base` is shipped; the workspace's is editable; any other is frozen and loaded from an exported `.json` |
| **workspace** | everything the user can edit: the workspace package and all it holds |
| **definition** | a block carrying `def` — explicit. Abstract: never allocated or linked as an instance. Every block in a package's domain is one, organizing groups and folders included |
| **structure** | what a definition holds that is not a definition: its usages, nested to any depth |
| **usage** | a block in a structure. Its `type` is the definition it uses; it reads that definition through and stores only its own overrides |
| **subtype** | a definition whose `type` is the definition it extends. Settings and tags inherit; structure does not (yet) |
| **base** | a definition in the `base` package with no `type`: `block`, `folder`, `reference`, `interface`, `group`, `grid`, `note`, `tag`, `line`, `tie`. Each has a description |

| Rule | |
|---|---|
| **one chain** | `type` is both *extends* (on a definition) and *is a* (on a usage). Anything resolves its own value first, then up the chain, nearest wins |
| **own values only** | a definition stores what it says; inherited values are resolved on read, never copied |
| **one id space** | `base` keeps bare ids (`block`, `line`); other packages namespace theirs (`md.heading`) |
| **parent is a block** | always. A package root holds its domain; a definition holds its structure |
| **domain** | a definition's domain (block or relation) is read off its base, never stored |
| **frozen** | a block under any package root other than the workspace's is read only |
| **no links between definitions** | relations between definitions are fields (`type`, `tags`); a tie may still join a definition to a note |
| **a new workspace** | the `workspace` package holding groups `blocks`, `relations`, `tags`, and one plain definition `main` in `blocks`, picked by default |


## Schema

| Block key | Holds | Was |
|---|---|---|
| `def` | `{ schema? }`: the definition marker, and its field definitions | `Definition` record, `Definition.fields` |
| `type` | the definition it extends or uses | `Definition.extends`, `Block.type` |
| `name`, `body`, `tags` | name; body (a definition's description); tag definition ids | `Definition.name`, `.about`, `.tags` |
| `settings` | how it draws and what it may do, by component (`card`, `style`, `allows`, …) | `Definition.components`, `Block.looks`, `Relation.looks` |
| `values` | a usage's field values | `Block.fields` |
| `uses` | on a package root: the packages it depends on | `Package.extends` |

| Removed | Why it existed |
|---|---|
| `Graph.defs`, `Graph.packages`, `Definition`, `Package` | definitions and packages lived apart from blocks |
| `default`, `stands_in_for`, a word about a base | editing a frozen definition; subtype it instead |
| shelf, `Shelved`, `set_shelf` | definitions had no place of their own |
| `ROOT_DEF`, `OLD_ROOT`, the root rename and the door's missing-root repair | the old migrations; samples are re-saved instead |
| trait tags (`trait.*`) | a readout of settings; shown as badges instead |
| `set_def`, `drop_def`, `set_package`, `drop_package`, `set_about` | definitions and packages are blocks: `add_block`, `delete_block`, `set_body`, `set_schema` |
| tags dropped at zero usages | simplicity: a tag stays until removed |


## Usages read through

| Rule | |
|---|---|
| **read, not copied** | a usage shows its definition's structure; it stores only its own overrides |
| **parts by path** | an edge end may name a part of a usage: `{ from, fromPart }` is the part `fromPart` of the definition `from` uses |
| **edits go home** | changing what a usage shows of its definition's structure edits the definition |
| **ports too** | a usage wears its definition's interfaces on its walls |


## Sections

| Rule | |
|---|---|
| **depth** | each section lists one level of the tree: what the section above holds |
| **host defined** | each app declares its sections: label, listing, default |
| **remembered** | a section remembers its pick per pick above; session state, never logged |
| **headers are labels** | clicking one folds its section |
| **two cues** | the focus lit strongly, each section's pick subtly |
| **arrows** | ↑ ↓ walk the rows of the section in focus; ← to the section above, → to the one below, each landing on what that section holds |
| **one row, one layer** | a row's children are what its layer holds; picking a row draws the layer it sits on |

| App | Sections | Lists |
|---|---|---|
| **mndflow** | packages → definitions → structure | package roots → the package's definitions, nested under the groups and folders that organize them → the definition's own row with its structure under it |
| **mndmap** | collection → document | the workspace's folders and documents (definitions) → the document's own row with its content (structure) under it |

| Section in focus | The canvas draws |
|---|---|
| packages | every package top down: a box per package holding its definitions in their groups |
| definitions | the package's top layer: its definitions in their groups |
| structure | the layer the picked block sits on |


## Packages view (regressed in step 3)

**What was lost:** the packages chart drew every package as a box, its definitions inside grouped as its domain organizes them, so the whole vocabulary read top down on one page. Step 3 replaced it with a card per package (`views/packages.ts`), which shows nothing inside. That was a mistake: this view is the one the definitions section drills into.

| Why it went | |
|---|---|
| **no layer holds the packages** | each package's domain is now a real layer (its root's), but package roots sit under nothing, and the null layer is the workspace's own domain. Drawing every package at once needs a layer above them, which no block is |
| **the old chart was synthetic** | `chart()` built its boxes and stand-in cards by hand, outside the block model. It was deleted with the `Definition` record rather than reworked, and a card per package was the shortest stand-in |

| Option | How | Cost |
|---|---|---|
| **A. view-only layer, real ids** (recommended) | `packages_graph` lays a drawn layer `@packages` with a box per package root, and lays each package's definitions on it in the view only — re-parented to the layer, a member of their package's box, organizing groups nested as groups in it. Drawn as `read_through` is: nothing stored | small: one view transform. Cards keep their ids, so a pick is the definition itself — held as the definitions section's pick, and opening one goes to its structure |
| B. stand-ins in boxes | as the old chart: a stand-in (`of`) per definition inside a box per package | ids are the stand-ins', mapped back on every pick; a second drawing of each definition |
| C. a real root above packages | a block every package root sits under | a schema change for a drawing; the workspace stops being a root |

| Rule kept from the old chart | |
|---|---|
| **drawn once** | each definition appears once, in its package's box |
| **rows pick cards** | a package row picks its box, a definition row its card |
| **a page** | laid as many cards across as the canvas holds; the camera follows the pick |
| **read only** | a package is picked and opened here, never edited |


## The reader

| Concept | Is |
|---|---|
| collection | the workspace package's domain |
| folder | an organizing definition on the `folder` base |
| document | a definition on `md.document`, read into structure when first opened |
| document content | usages of `md.*` definitions |
| `markdown` | a frozen package; the reader lists no packages or definitions sections |


## Step 3: blocks all the way (this step)

| Phase | Scope |
|---|---|
| **1. core** | schema above; resolution through blocks; door and fold without migrations; actions on blocks; samples and fixtures re-saved |
| **2. kit surfaces** | `defs` as a package; views, stage, tray, options, terminal on the block model; traits as badges; a definition's JSON in the tray (own and resolved) |
| **3. sections** | the three listings as block trees; organizing groups as branch rows; ← → across sections; charts replaced by drawing the package layer |
| **4. read through** | usages draw their definition's structure and ports; edges to parts |
| **5. mndmap** | markdown as a package; the collection as the workspace domain; documents as definitions |


## Open

| Item | Notes |
|---|---|
| **structure inheritance** | subtypes inheriting structure; deferred |
| **self-references and loops** | a definition's structure using itself |
| **relation and tag structure** | whether either may hold structure; `holds` decides, off by default |
| **content layouts** | the reader's backbone is app code; packages need a way to declare a layer's layout |
| **lazy collections** | every file's text is still read up front |
| **release the kit** | mndmap pins `vendor/`; re-pin once step 3 settles |
| **read-through in the explorer** | a usage's read-through parts draw on its layer but are not listed under its row; two usages of one definition in a layer would share row keys |
| **organizing groups as types** | `blocks`, `relations`, `tags` are group definitions, so they are offered as types for a block |
| **an unread document's text** | it rides on the document's `body` until read, which is otherwise a definition's description |
| **membership scans** | an empty definition is no holder, so `shape_of` scans for members; fine at package sizes, worth an index for large collections |
| **the no-sections explorer** | still supported and tested, though both hosts declare sections; drop it or keep it |
| **markdown as a file** | the markdown package is built in code; the base package ships as code too. Packages a user imports are `.json` |
| **mndflow's docs** | `docs/` and the package docs still describe the old record, the shelf and defaults |

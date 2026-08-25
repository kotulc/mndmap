# mndmap translator migration plan

## Status and authority

This is the implementation plan for the product described by `README.md` and
`translator.md`.

`archive.md` describes the completed ledger MVP and is retained only as history.
Claims, leases, scratch fields, staged source edits, source write-back, the
ledger MCP surface, and the collection dashboard are not requirements for the
new product.

## Product contract

mndmap is a local editor for the organization of a documentation site.

It:

1. reads `docs/**/*.{md,mdx}`;
2. parses documents into a working store;
3. lets a person organize folders, pages, sections, and generated groups;
4. derives a complete mndflow graph from that store;
5. previews the selected graph layer with `Explorer` and `Viewer`; and
6. emits a separate, committed document collection to `site/`.

mndmap never modifies source documents. Emission is explicit and replaces only
the mndmap-owned `site/` destination. Site building and deployment are outside
this repository's CI.

## Settled decisions

### Authority and publication

- Source Markdown remains authoritative for content.
- `.mndmap/` is authoritative for local organization and is not committed.
- `site/` is the committed publication input.
- CI does not re-emit, build, validate, or deploy `site/`.
- A fresh clone can read the committed site, but cannot reproduce its
  organization from source without reorganizing it.

### Source and destination

- Zero-config input is `docs/**/*.{md,mdx}`.
- Missing `docs/` is an error.
- `.mndmap/` and `site/` are always excluded from source discovery.
- The default destination is `site/`.
- The destination is wholly owned by mndmap.
- Emit builds a staged tree and atomically replaces the previous destination.
- Any parse, identity, selector, link, vocabulary, rendering, or collision error
  leaves the previous destination untouched.

### Organization and identity

- Organization persistence is required before the first live UI milestone.
- Every source-backed node receives a persisted internal ID.
- Explicit source IDs are used when present.
- Otherwise rescans reconcile prior IDs using path, content, and structural
  fingerprints.
- Reconciliation never guesses between multiple plausible matches.
- Ambiguous matches remain unresolved until a person confirms them.
- Unresolved identities and broken internal references block emit.
- Generated groups also have persisted internal IDs.
- mndflow block IDs are deterministically minted from these internal IDs.

### Emitted structure

- The emitted directory and document hierarchy physically matches the
  organization tree.
- Moving a page changes its emitted path.
- Moving a section changes which emitted page contains that section.
- Generated groups become folders with generated `index` pages.
- `compose:` is used only by generated folder/group landing pages in the first
  implementation.
- Ordinary emitted pages remain ordinary Markdown or MDX.
- Output path and anchor collisions require an explicit rename; silent suffixes
  are forbidden.

### Links, assets, and MDX

- Internal links are rewritten to their emitted targets.
- Local referenced assets are copied to deterministic output locations and
  links are rewritten.
- MDX is preserved.
- Static relative MDX imports and exports are rewritten when their targets move.
- Dynamic or unresolved local references block emit.
- Published routes and heading anchors follow a pinned mdsite contract.
- Cross-project fixtures prove mndmap's route and slug calculations match that
  mdsite version.

### Diagrams and graph behavior

- `mndmap graph` emits one complete, deterministic site graph by default.
- Layer selection affects projection and rendering, not graph construction.
- The default diagram depth is three.
- YAML supplies diagram defaults.
- Per-node inclusion and depth overrides live in the organization store.
- Inline SVG is emitted on generated folder/group landing pages and pages
  explicitly marked as diagram roots.
- Every diagram box links to the emitted page and heading represented by its
  source field.

### Live editor

- The supported command is `mndmap ui --root PATH`.
- It starts the local REST API, serves the UI, and opens the browser.
- Source is parsed when the editor starts.
- Source is not watched automatically.
- A user explicitly requests a rescan after changing source files.
- A rescan performs identity reconciliation and preserves organization.
- Emit occurs only through an explicit UI action or `mndmap emit`.
- The REST API remains for UI, import, rescan, organization, graph, and emit.
- MCP and all ledger-oriented routes are removed.

### Configuration and compatibility

- The redesigned configuration remains `version: 1`.
- Existing selector, key, and field-mapping capabilities survive under a
  redesigned parsing/selectors section.
- Claims, leases, scratch fields, writable fields, creation templates, generated
  source regions, and source write-back configuration are removed.
- Previous database and configuration formats are unsupported.
- An incompatible `.mndmap/state.sqlite` produces a clear error requiring the
  user to remove it; no migration or backup is performed.

### Taggly

- The migration defines a narrow optional suggestion interface.
- The taggly implementation is deferred until persistence and emit are stable.
- Taggly is never required for import, organization, graphing, emit, or CI.

## Working-store model

SQLite remains the local working store. Derived parse data may be replaced on a
rescan; identity and organization data may not.

### Source nodes

A source node represents a parsed folder, page, section, table, row, list,
item, term, or link.

Minimum persisted fields:

```text
source_node
  id                    internal stable ID
  kind                  folder | page | section | table | row | list | item | term | link
  explicit_key          optional author-provided identity
  source_path           normalized source-relative path
  source_locator        heading path or structural locator
  content_fingerprint   normalized-content fingerprint
  shape_fingerprint     parent/sibling/type fingerprint
  source_data           parsed values and source locations
  scan_id               most recent scan that observed the node
  resolution            resolved | unresolved | missing
```

The exact SQL shape may normalize large JSON fields, but it must preserve these
semantics.

### Organization nodes

An organization node either references a source node or represents a generated
group.

```text
organization_node
  id                    stable organization ID
  source_node_id        nullable for generated groups
  kind                  source | group
  parent_id             nullable only for the single root
  position              sibling order
  title                 user-facing title
  output_slug           explicit emitted path segment
  diagram_root          boolean
  diagram_depth         nullable per-node override
```

### Invariants

- There is exactly one organization root.
- Every non-root node has exactly one parent.
- The organization is acyclic.
- Sibling positions are unique and contiguous after each transaction.
- A source node appears at most once in the organization tree.
- Generated groups may contain groups, pages, and sections.
- Pages may contain sections and document content.
- Sections may contain nested sections and document content.
- Tables, rows, lists, items, terms, and links retain valid structural
  containment.
- A move that would create an invalid tree is rejected before mutation.
- A path collision is represented as a blocking diagnostic, not auto-renamed.
- Organization transactions are atomic.

## Rescan and reconciliation

Each explicit rescan runs as one transaction:

1. Parse all configured source documents into a new scan.
2. Match explicit IDs exactly.
3. Match unchanged normalized paths and structural locators.
4. Match a unique combination of content and shape fingerprints.
5. Create IDs for genuinely new nodes.
6. Mark unmatched prior nodes missing without deleting their organization.
7. Record multiple plausible matches as unresolved.
8. Commit derived parse data only after the full scan succeeds.

The UI must show missing and unresolved nodes and allow the user to:

- confirm a candidate match;
- treat a candidate as a new node; or
- remove the missing node from the organization.

No unresolved or missing node may be emitted.

## Configuration contract

The initial target shape is:

```yaml
version: 1

sources:
  include: docs/**/*.{md,mdx}
  exclude: []

destination: site

diagrams:
  depth: 3

selectors:
  - document: docs/reference.md
    match:
      kind: table
      under: [Reference, Commands]
      headers: [Command, Description]
    identity:
      field: Command
    fields:
      command:
        column: Command
      description:
        column: Description
```

Rules:

- Built-in exclusions for `.mndmap/**` and `site/**` cannot be disabled.
- Source and destination canonical paths must not overlap.
- A selector must match exactly one region.
- Zero or multiple matches are blocking diagnostics.
- Unknown keys are errors.
- Ledger-era keys are errors with a message that points to `archive.md`.

## Graph and vocabulary contract

The vocabulary is data in `src/vocab/docs.ts` and contains:

- `doc.set`
- `doc.page`
- `doc.section`
- `doc.table`
- `doc.row`
- `doc.item`
- `doc.term`
- `doc.link`

The graph builder:

- is pure and synchronous;
- accepts an immutable working-store snapshot;
- emits the real mndflow file schema, not a local envelope;
- includes the vocabulary on the tier root;
- produces deterministic IDs and ordering;
- includes a `source` link on every navigable block;
- builds the whole graph on each organization change;
- never stores layout or projected scenes; and
- passes `validate` and `review` before emit.

`mndmap graph` writes JSON to stdout unless an output path is requested.
Projection and SVG rendering accept a layer ID without changing the graph file.

## Emit contract

Emit is a pure read from source plus organization followed by an atomic
destination replacement.

### Planning

Before writing:

1. require a fully resolved organization;
2. derive every output path and route;
3. detect duplicate paths, routes, and anchors;
4. resolve and rewrite every internal Markdown link;
5. resolve static MDX imports and exports;
6. enumerate referenced local assets;
7. build and validate the complete graph;
8. run vocabulary review;
9. render required inline SVG diagrams; and
10. report all diagnostics together.

Any error stops before destination mutation.

### Staging

- Build under `.mndmap/emit-<unique-id>/`.
- Write complete Markdown/MDX pages, generated group index pages, and assets.
- Copy referenced assets beneath `_assets/` while preserving their normalized
  path relative to `docs/`.
- Rewrite references from emitted pages to those copied paths.
- Preserve source content bytes where no transformation is required.
- Preserve frontmatter except for generated navigation fields owned by mndmap.
- Generate `compose:` only for group landing pages.
- Render diagrams as inline SVG.
- Validate the staged collection before replacement.

References outside `docs/`, dynamic MDX references, unknown URL schemes that
require rewriting, and unresolved local targets are blocking errors unless a
future configuration explicitly allows them.

### Replacement

- Replace `site/` only after staging validates.
- The previous `site/` remains intact on any failure.
- A successful replacement removes stale files because the destination is
  wholly owned.
- Clean abandoned staging directories on the next startup after reporting
  them.

## REST surface

The local API supports only the translator:

```text
POST /import                 initial parse
POST /rescan                 explicit reparse and reconciliation
GET  /organization
POST /organization/move
POST /organization/group
POST /organization/rename
POST /organization/diagram
POST /reconciliation/resolve
GET  /graph
POST /emit/preview
POST /emit
GET  /diagnostics
GET  /health
```

Mutation payloads and response schemas are validated. Organization mutations
are transactional. There are no claims, leases, actors, fencing tokens, scratch
fields, staged source mutations, source patches, or MCP tools.

## Implementation stages

### S0 — Pin the external seams

Work:

- package and install the real `@mnd/kit`;
- pin the mndflow commit beside the dependency;
- pin the supported mdsite image/version;
- record the exact Graph, Definition, Explorer, Viewer, validation, review,
  projection, and `draw_svg` APIs;
- add a cross-project route and heading-anchor fixture.

Exit:

- TypeScript compiles against the real kit types.
- A checked-in fixture graph passes untouched through mndflow check, review,
  fold, and project commands.
- mndmap and the pinned mdsite fixture agree on routes and anchors.

### S1 — Replace ledger state with the working-store foundation

Work:

- introduce the new schema version and reject old databases;
- persist parsed source nodes and source locations;
- add organization tables and invariants;
- remove claims, leases, scratch, history, pending source changes, and
  source-write APIs;
- remove ledger config keys;
- keep and adapt `parser.ts`.

Exit:

- Import creates source and organization nodes.
- Reopening the service preserves organization.
- No service method can modify source content.

### S2 — Implement identity reconciliation and organizing transactions

Work:

- implement explicit ID, locator, content, and shape matching;
- persist unresolved and missing states;
- add move, group, rename, order, and diagram-setting transactions;
- add manual reconciliation resolution.

Exit:

- Organization survives a rescan after representative file and heading edits.
- Ambiguous matches never resolve automatically.
- Invalid moves and path collisions produce diagnostics.

### S3 — Add the vocabulary and real graph builder

Work:

- add `src/vocab/docs.ts`;
- add `mndmap vocab --check`;
- replace the custom record graph adapter with store-to-mndflow Graph;
- add `mndmap graph`.

Exit:

- The real mndflow CLI opens untouched graph output.
- Graph output is byte-for-byte deterministic for the same store snapshot.
- Validation and review pass for representative Markdown and MDX.

### S4 — Prove physical emit end to end

Work:

- implement output planning and collision detection;
- physically emit moved pages and sections;
- generate group folders and landing pages;
- rewrite links, static MDX references, and copied assets;
- render inline SVG through `draw_svg`;
- stage and atomically replace `site/`;
- build the staged fixture with pinned mdsite locally.

Exit:

- Source remains byte-for-byte unchanged.
- A moved section appears only in its new emitted page.
- Links and diagram boxes reach the correct emitted heading.
- Failed emit leaves the previous site unchanged.

### S5 — Replace the ledger UI with the persistent live surface

Work:

- implement `mndmap ui --root PATH`;
- retain a translator-only local REST server;
- replace `@xyflow/react` with `Explorer` and `Viewer`;
- map Explorer intents to organization transactions;
- rebuild the complete graph after each accepted organization edit;
- project only the open layer;
- add explicit Rescan and Emit actions.

Exit:

- Reorganizing a node redraws the diagram without reload.
- Reloading the UI preserves organization.
- Source changes are not observed until Rescan.
- Rescan surfaces unresolved matches and preserves resolved organization.

### S6 — Complete gestures, diagnostics, and recovery

Work:

- finish move, group, order, rename, fold, pick, and diagram controls;
- add reconciliation UI;
- aggregate blocking diagnostics before emit;
- handle abandoned staging directories;
- test wide layers and establish a practical redraw budget.

Exit:

- Every supported gesture is persistent and reversible through another
  organizing gesture.
- No invalid organization can be committed.
- The editor remains responsive on the agreed representative corpus.

### S7 — Retire legacy publication and align packaging

Work:

- remove `Exporter`, ledger REST/MCP surfaces, and the MCP binary;
- remove the custom publication embed and layout;
- remove old publication scripts and ledger acceptance tests;
- update package description, exports, scripts, `.gitignore`, and mdsite
  documentation;
- replace tests with translator fixtures;
- mark `archive.md` clearly as historical.

Exit:

- No production code imports ledger types or custom graph envelopes.
- README commands run as documented.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
- Repository CI tests the application but does not process committed `site/`.

### After the migration — optional taggly integration

Define now:

```ts
interface GroupingSuggester {
  suggest(snapshot: OrganizationSnapshot, signal: AbortSignal): Promise<GroupingSuggestion[]>;
}
```

Implement later:

- optional discovery and configuration;
- timeout and cancellation;
- suggestion invalidation after organization changes;
- accept/ignore UI;
- conversion of accepted suggestions into ordinary organization transactions.

Absence or failure of a suggester never changes core behavior.

## Test plan

### Unit

- parser source nodes and source locations;
- identity fingerprints and reconciliation precedence;
- organization invariants and transactions;
- selector cardinality;
- output slug and anchor collision detection;
- link and MDX reference rewriting;
- asset path mapping;
- graph determinism;
- emit planning and atomic replacement.

### Contract

- real `@mnd/kit` types compile;
- vocabulary validate/review;
- untouched graph accepted by mndflow CLI;
- route and anchor parity with pinned mdsite;
- inline SVG links target emitted routes.

### Integration

- initial import to persisted organization;
- explicit rescan after file rename and heading edit;
- manual resolution of ambiguous identity;
- physical page and section moves;
- generated group folder and landing page;
- Markdown links, images, and static MDX imports after moves;
- failed emit preserves previous `site/`;
- successful emit removes stale destination files;
- UI gesture updates graph and survives reload.

### Golden corpus

The fixture corpus must include:

- nested folders and repeated headings;
- duplicate titles that would collide as output slugs;
- Markdown links across pages and to headings;
- images and other local assets;
- MDX with static relative imports;
- tables, task lists, plain lists, terms, and links;
- explicit IDs and nodes requiring fingerprint reconciliation;
- ambiguous identity candidates;
- generated groups and diagram-depth overrides.

## Definition of done

The migration is complete when:

1. `mndmap ui --root PATH` opens the persistent organizer.
2. Explicit rescan reconciles source changes without guessing.
3. Explorer gestures update SQLite and redraw Viewer immediately.
4. `mndmap graph` emits a deterministic graph accepted untouched by mndflow.
5. `mndmap emit` atomically writes a physically reorganized `site/`.
6. Source documents are unchanged.
7. Internal links, assets, MDX references, routes, anchors, and inline SVG
   navigation work in the pinned local mdsite build.
8. Any blocking diagnostic preserves the previous emitted site.
9. Ledger code, MCP, custom graph rendering, and source write-back are gone.
10. Core tests, typecheck, and build pass without CI processing `site/`.

# mndmap enrichment pipeline plan

## Status and authority

This is the implementation plan for mndmap.

`README.md` describes the product. `archive.md` describes the retired ledger
product and is historical only. Where older documents disagree with this plan,
this plan is authoritative.

## Product contract

mndmap enriches and reshapes a Markdown or MDX collection without modifying its
source.

It supports two separate workflows:

1. `mndmap build --config mndmap.yaml` is a stateless, reproducible pipeline.
   It parses source into an ephemeral working store, applies configuration and
   deterministic defaults, and atomically emits the destination.
2. `mndmap ui --root PATH` is a persistent, user-driven workspace. It keeps
   one-off organization and content overrides in `.mndmap/state.sqlite` and
   emits a customized destination only when the user explicitly requests it.

The two workflows do not share hidden authority:

- `build` does not automatically read local dashboard state.
- dashboard decisions affect explicit workspace emits only.
- the emitted destination is the portable handoff to mdsite.
- neither SQLite nor an organization manifest needs to be committed.

The complete pipeline is:

```text
configured source
  -> parse
  -> optional enrichment
  -> working store
  -> defaults or dashboard decisions
  -> validated destination documents
  -> mdsite
  -> static site
```

Taggly enrichment is deferred. The initial product preserves manual metadata,
adds deterministic `description` and `reading_time` frontmatter when absent,
and defines the seam that a later Taggly adapter will use.

## Authority and immutability

- Source Markdown and MDX are authoritative for original content.
- mndmap never writes to the configured source root.
- Dashboard content edits are destination-only segment overrides.
- `.mndmap/` is authoritative only for the local interactive workspace.
- A stateless build starts from source and configuration every time.
- The destination is wholly owned by mndmap and is replaced atomically.
- mdsite consumes the destination and does not reorganize or semantically
  enrich it.

## Source and destination configuration

The first implementation supports one source root, include and exclude globs
relative to that root, and one destination:

```yaml
version: 1

source:
  root: docs
  include:
    - "**/*.{md,mdx}"
  exclude: []

destination: site

diagrams:
  enabled: true
  depth: 3

mdsite:
  config: mdsite.yaml  # optional template path

selectors: []
```

Rules:

- `source.root` and `destination` are workspace-relative directories.
- Neither canonical path may contain the other.
- The destination and `.mndmap/` are always excluded from discovery.
- No implementation may assume the source is named `docs` or the destination
  is named `site`.
- Missing source roots, empty matches, unknown keys, invalid globs, and path
  overlap are configuration errors.
- Selector document paths are source-root-relative.
- mdsite configuration precedence is: explicitly configured template, then a
  workspace-root `mdsite.yaml`, then built-in defaults.
- mndmap preserves user mdsite identity, theme, output, and deployment fields,
  but owns `content` and `nav_order` in the emitted copy.
- Ledger-era keys are rejected with a reference to `archive.md`.
- Configuration remains `version: 1`; pre-enrichment version-1 shapes are
  incompatible and receive a clear error.

## Stateless build

`mndmap build`:

1. loads and validates configuration;
2. creates an ephemeral SQLite working store;
3. parses every matching source document;
4. seeds deterministic organization that mirrors source folders and pages;
5. keeps each source section in its source page;
6. preserves manual frontmatter and fills deterministic metadata gaps;
7. derives and validates the complete mndflow graph;
8. plans links, assets, output paths, anchors, landing pages, and diagrams;
9. copies or defaults mdsite configuration and writes generated navigation;
10. reports all blocking diagnostics together;
11. stages the complete destination; and
12. atomically replaces the previous destination.

The same source, configuration, and dependency versions must produce
byte-identical output.

`build` succeeds without an existing `.mndmap/` directory and leaves no
persistent working state behind.

## Interactive workspace

`mndmap ui --root PATH`:

- loads configuration;
- opens or creates `.mndmap/state.sqlite`;
- parses source at startup;
- serves the local REST API and dashboard;
- does not watch source automatically;
- reconciles source only after an explicit Rescan;
- persists organization, generated groups, diagram settings, and segment
  overrides;
- previews output without mutating the destination; and
- emits only after an explicit action.

The workspace may also expose `mndmap emit --root PATH` as a non-interactive
way to emit the existing local workspace. It must never be confused with
stateless `mndmap build`.

## Working-store model

SQLite is used in both workflows:

- an in-memory or temporary database for stateless build;
- `.mndmap/state.sqlite` for the dashboard.

### Source nodes

A source node represents a parsed folder, page, section, table, row, list,
item, term, or link.

Minimum semantics:

```text
source_node
  id
  kind
  explicit_key
  source_path
  source_locator
  source_range
  content_fingerprint
  shape_fingerprint
  source_data
  scan_id
  resolution
```

Every path is normalized relative to `source.root`, never to the workspace.
A source root of `docs` yields `index.md` and `workflow/overview.md`, and
never a `docs` folder node, a `docs/` route prefix, or a second root frame.

### Organization nodes

Explorer organization contains only folders, generated groups, and pages:

```text
organization_node
  id
  source_node_id
  kind                  folder | group | page
  parent_id
  position
  title
  output_slug
  diagram_root
  diagram_depth
```

Rules:

- `kind` is closed: `folder | group | page`. There is no generic source kind.
- Sections, tables, lists, items, terms, and links are never seeded into
  organization; they reach a page through segment placement only.
- The organization root is the tier root itself, not a node inside it.

### Page composition and overrides

Sections are organized through a page-scoped segments model:

```text
segment_placement
  source_node_id
  page_organization_id
  parent_segment_id
  position

segment_override
  source_node_id
  field                 null for the whole segment
  content
  updated_at
```

Rules:

- a section appears in at most one emitted page;
- sibling positions are unique and contiguous;
- nesting is acyclic and produces valid heading depth;
- overrides replace only the corresponding emitted segment, or one field
  within it when `field` is set;
- a field override re-serializes one structure — a table cell rewrites that
  cell, a list item rewrites that item — and never the whole segment;
- the original source range remains available for reconciliation;
- deleting source never silently deletes a placement or override;
- unresolved or missing placed segments block workspace emit.

## Reconciliation

Each dashboard rescan is one transaction:

1. parse all configured source documents into a new scan;
2. match explicit IDs exactly;
3. match unchanged normalized path and structural locator;
4. match a unique content and shape fingerprint;
5. create IDs for genuinely new nodes;
6. mark unmatched prior nodes missing;
7. record multiple plausible matches as unresolved; and
8. commit derived parse data only after the full scan succeeds.

Reconciliation never guesses. The dashboard supports confirming a candidate,
treating it as new, or removing a missing placement. Existing segment
overrides follow a confirmed identity match.

## Dashboard contract

### Shell

The dashboard wears mndflow's chrome so the two applications read as one
family. The mndflow theme is vendored beside the pinned commit: `ramp.css`
for colour and `base.css` for the shell.

Layout is mndflow's `.app` grid and nothing else:

- a header spanning the top;
- the Explorer as the left column;
- the main panel filling the rest.

Header rules:

- the product name sits at the left;
- every control sits at the right in one `.tools` group;
- the controls are: panel toggle (Content / Diagram), Rescan, Preview,
  Export, Diagnostics, and theme;
- `Export` and `Preview` are the user-facing names for the emit contract
  below;
- nothing else occupies layout — the panel toggle changes what the main panel
  draws, never how much room it gets.

Diagnostics and parse logs never sit in the page. They open once in a
dismissible dialog on load when the scan produced any, and otherwise only when
the Diagnostics control is pressed. A one-line status reports the result of the
last action.

### Explorer

Explorer is the document tree and holds nothing else. Rows are folders,
generated groups, and pages — never sections. It supports:

- move and reorder;
- create and dissolve generated groups;
- rename and output-slug changes;
- folder and page selection; and
- document-level diagram selection.

Accepted intents update SQLite transactionally and immediately rebuild the
derived graph.

### Content panel

Selecting a page draws its content in the main panel as one vertical list of
segment blocks in emitted order — the page as a stack of parts, not a document
preview.

Each block:

- is collapsed by default to its heading, kind, and state;
- expands to reveal its content as mndflow fields, in the same shape mndflow
  gives a block's fields — prose is one `text` field, a table is one field per
  column with its rows beneath, a list is one field per item, a term is a
  name/value pair, and a link is a `link` field;
- is editable field by field, and every edit is a destination-only override;
- shows missing, unresolved, and overridden state on the block itself.

The list is managed by direct manipulation:

- drag to reorder within the page;
- drag onto an Explorer row to move to another page;
- remove to drop a section from the emitted page.

The first implementation does not create, split, or merge sections, and never
writes to source. Removing a block removes its placement, not the source.

### Diagram panel

The panel toggle swaps the content list for the mndflow diagram of the same
selection.

- Document view projects the organization tree.
- Page view projects the selected page and its placed segments.
- Every layer block carries `arrangement: "down"`, so a layer's children read
  as a vertical column and the diagram matches the Explorer's ordering.
- One layer draws exactly one frame. The organization root is the tier root,
  so there is never a `docs` block inside a `docs` frame.
- Layer selection changes projection, not graph construction.
- Fold and pick are view state, not persisted graph layout.

## Graph and mndflow contract

mndmap consumes an exact semantic version of `@mnd/kit` from the public npm
registry. The matching mndflow commit is recorded beside the dependency for
fixtures and debugging. A sibling checkout is never required for installation
or CI, and projects cannot select a different kit version through
`mndmap.yaml`.

The graph builder:

- is pure and synchronous;
- accepts an immutable working-store snapshot;
- emits the real mndflow file schema;
- includes the documentation vocabulary on the tier root;
- produces deterministic IDs and ordering;
- includes a destination link on every navigable block;
- sets `arrangement: "down"` on every layer block;
- never emits a block for the organization root;
- constructs the complete graph after every accepted organization change;
- applies global diagram depth and per-node overrides during projection;
- stores neither layout nor projected scenes; and
- passes `validate` and `review` before emit.

`mndmap graph` remains available as a diagnostic/developer command. Its output
must pass untouched through the real mndflow open, check, review, project, and
SVG APIs.

## Emit contract

### Documents and frontmatter

- Ordinary pages remain ordinary Markdown or MDX.
- Existing frontmatter values are preserved; mndmap does not overwrite
  page-specific metadata already supplied by the author.
- Missing `description` is generated from the first non-heading prose
  paragraph, normalized and length-capped.
- Missing `reading_time` is plain-text words divided by 200, rounded up, with a
  minimum of one minute.
- Tags, categories, publish dates, and related pages are preserved when present
  but are not generated before Taggly.
- Generated folder/group landing pages are ordinary `index.md` or `index.mdx`
  files with title, child links, deterministic metadata, and an optional
  diagram.
- There is no `compose:` protocol.

The handoff to mdsite is frontmatter-only: no mndmap-specific database or
required metadata sidecar accompanies the destination.

### mdsite configuration

- mndmap writes `mdsite.yaml` at the destination root.
- It copies an explicitly configured template when present.
- Otherwise it copies workspace-root `mdsite.yaml` when present.
- Otherwise it starts from built-in defaults.
- User-owned identity, theme, output, and deployment settings are preserved.
- mndmap sets `content: .` because the config lives at the destination root and
  replaces `nav_order` with maps derived from the physical organization and
  sibling positions.
- mdsite remains compatible with publication-ready Markdown not produced by
  mndmap.

### Structure and segments

- Emitted directories physically match the organization tree.
- Moving a page changes its emitted path.
- Moving a section changes the page containing its emitted content.
- Segment ordering and destination-only overrides are applied during planning.
- Duplicate output paths, routes, or anchors are blocking diagnostics.
- Silent suffixes are forbidden.

### Links, assets, and MDX

- Internal links are rewritten to emitted page and heading targets.
- Referenced local assets are copied beneath `_assets/` while preserving paths
  relative to `source.root`.
- Markdown and MDX references are rewritten relative to emitted locations.
- Static relative MDX imports and exports are rewritten when targets move.
- Dynamic or unresolved local references block emit.
- References escaping `source.root` block emit unless a future explicit policy
  allows them.

### Diagrams

- Generated landing pages include inline SVG by default.
- `diagrams.enabled: false` disables emitted diagrams globally.
- Ordinary pages include inline SVG only when explicitly marked as diagram
  roots in configuration or the dashboard.
- Inline SVG appears after title and introductory prose and before generated
  child links or page sections.
- Global depth defaults to three; per-node depth overrides it.
- Every diagram box links to the emitted page and anchor represented by its
  source.
- Complete mndflow graph JSON remains diagnostic output and is not included in
  the mdsite handoff.

### Atomic replacement

Planning and validation finish before destination mutation. Files are written
under `.mndmap/emit-<unique-id>/`, validated, then atomically replace the
destination. Any failure preserves the previous destination. Successful
replacement removes stale files.

## REST surface

The local API supports only the interactive workspace:

```text
POST /import
POST /rescan
GET  /organization
POST /organization/move
POST /organization/group
POST /organization/rename
POST /organization/diagram
GET  /pages/:id/segments
POST /segments/move
POST /segments/remove
POST /segments/override
POST /reconciliation/resolve
GET  /graph
GET  /graph/:layer
POST /emit/preview
POST /emit
GET  /diagnostics
GET  /health
```

Mutation payloads and responses are validated. Organization and segment
mutations are transactional. `/segments/override` takes an optional `field`
and rewrites only that field when given.

## Delivery stages

Each stage carries where it stands. `done` means the exit condition holds.

### S0 — Lock external contracts — done

- publish and install an exact `@mnd/kit` version from public npm;
- pin the matching mndflow commit and supported mdsite revision;
- define frontmatter fill-only rules and mdsite configuration ownership;
- replace legacy publication fixtures with cross-project fixtures.

Exit: clean checkout installation works without sibling repositories, and a
fixture graph passes real mndflow validation, review, projection, and SVG.

### S1 — Generalize configuration and stateless build — partial

- implement `source.root` plus relative include/exclude globs;
- remove hardcoded `docs/` and `site/` behavior;
- normalize every parsed path to `source.root`, so no source-root folder node,
  route prefix, or root frame is created;
- add `mndmap build`;
- create deterministic default organization in ephemeral SQLite;
- prove byte-identical stateless output.

Exit: a project with non-default source and destination names builds without
creating `.mndmap/`, and its emitted routes carry no source-root prefix.

### S2 — Complete the persistent workspace model — not started

- harden identity reconciliation;
- close `organization_node.kind` to `folder | group | page` and stop seeding
  sections into organization;
- add the `segment_placement` and `segment_override` tables and seed each
  page's sections as placements;
- persist destination-only segment and field overrides;
- enforce organization and composition invariants.

Exit: organization and overrides survive reload and representative rescans
without modifying source.

### S3 — Complete graph projection and diagrams — partial

- project Explorer, document, and page layers;
- apply configured and per-node depth;
- produce valid destination links;
- validate and review every complete graph.

Exit: document and page projections render through `Viewer` and `draw_svg`
with correct links and deterministic output.

### S4 — Complete physical emit — partial

- emit ordinary generated landing pages and ordered child links;
- apply page moves, segment moves, ordering, and overrides;
- preserve page metadata and fill missing description and reading time;
- merge mdsite template/defaults and generate `nav_order`;
- rewrite links, MDX references, and assets;
- stage, validate, and atomically replace the destination.

Exit: source is byte-identical, failed emit preserves the prior destination,
and all emitted references resolve.

### S5 — Build the complete dashboard — not started

- adopt mndflow's shell: vendored `ramp.css` and `base.css`, the `.app` grid,
  and every control in the header's right-hand `.tools` group;
- limit Explorer to folders, groups, and pages;
- wire all organization intents;
- draw the selected page as a vertical list of expandable segment blocks;
- reveal segment tables, lists, terms, and links as mndflow fields, and make
  each field a destination-only override;
- support drag to reorder, drag to another page, and remove;
- add the Content/Diagram toggle and document/page projection;
- move diagnostics into a load-time dialog and name the emit controls
  `Preview` and `Export`;
- add reconciliation workflows.

Exit: every supported action persists and redraws without reload, and explicit
export produces the previewed destination.

### S6 — Migrate mdsite — partial

- remove automatic local semantic tagging and related-page scoring;
- remove vendored model requirements;
- consume mndmap frontmatter and generated `nav_order`;
- avoid reorganization and semantic rewriting during ingest;
- retain rendering, theming, static export, and deployment.

Exit: the same mndmap destination builds locally and in the mdsite container.

### S7 — Cross-project hardening and legacy retirement — not started

- remove `.publication/`, ledger, MCP, and obsolete adapter artifacts;
- remove stale local-package and custom-renderer dependencies;
- add clean-checkout, Windows, and Linux workflow tests;
- establish dashboard redraw budgets on a representative corpus.

Exit: documented commands, tests, typecheck, build, and the cross-project
fixture all pass.

### After the core — optional Taggly integration

Define an optional enrichment interface over immutable parsed content and
organization snapshots. Add discovery, timeout, cancellation, suggestions,
accept/ignore, and invalidation. Absence or failure of Taggly must never block
parse, dashboard use, graphing, emit, mdsite build, or CI.

## Test plan

### Unit

- source-root-relative discovery and path safety;
- parser nodes, source ranges, and selectors;
- identity and reconciliation precedence;
- organization and segment invariants;
- destination-only segment and field override application;
- table, list, term, and link projection into fields, and back;
- output path, route, and anchor collisions;
- link, MDX, and asset rewriting;
- diagram depth and projection;
- frontmatter preservation and fill-only metadata;
- first-paragraph description and 200-WPM reading time;
- mdsite template precedence and `nav_order` generation;
- deterministic graph and emit planning.

### Integration

- stateless build without `.mndmap/`;
- persistent import, reload, and explicit rescan;
- page/group move and rename;
- section move and reorder within and across pages;
- destination-only segment edit;
- destination-only field edit inside a table and a list;
- segment removed from a page without touching source;
- generated landing with ordered links;
- global diagram disable and explicit page diagram;
- copied/default mdsite config with user fields preserved;
- successful replacement removes stale files;
- every planning failure preserves the prior destination;
- UI actions update SQLite and redraw immediately.

### Cross-project contract

- install released `@mnd/kit` in a clean checkout;
- open, validate, review, and project untouched mndmap graph output;
- build a mndmap destination with the pinned simplified mdsite;
- verify routes, anchors, frontmatter metadata, navigation order, assets, MDX,
  and diagram links in the built site.

### Golden corpus

Include nested folders, repeated headings, output collisions, cross-page and
heading links, images and other assets, static MDX imports, tables, lists,
explicit IDs, fingerprint reconciliation, ambiguous candidates, generated
groups, segment overrides, and diagram-depth overrides.

## Definition of done

The enrichment pipeline is complete when:

1. `mndmap build` reproducibly emits from any valid configured source root.
2. `mndmap ui` persists one-off organization and destination-only edits.
3. Explorer manages folders, groups, and pages while the content panel manages
   section placement, ordering, removal, and field-level overrides.
4. Document and page diagrams render through released mndflow APIs.
5. Emission atomically writes publication-ready Markdown/MDX without modifying
   source.
6. Generated landings, fill-only metadata, generated `nav_order`, links,
   assets, MDX, and diagram navigation work in simplified mdsite.
7. Taggly is optional and deferred without weakening the integration seam.
8. Legacy ledger/publication code and sibling-package assumptions are gone.
9. Core, dashboard, contract, and cross-project tests pass on clean checkouts.

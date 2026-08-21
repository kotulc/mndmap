# Markdown Document Ledger MVP

## Purpose

Build a local-first shared ledger that imports `.md` and `.mdx` documents into a queryable working store, lets agents claim and revise inferred records safely, and exports staged changes back into the original document structures on an explicit external signal.

The tool does not define project workflows, schedule work, authenticate agents, or replace Git. Agents and external tools decide what records mean and how work is organized.

## Architecture

- Use one TypeScript npm package and one local Node service.
- Treat Git-tracked `.md` and `.mdx` documents as the durable source of truth.
- Use YAML only for optional `mndmap.yaml` configuration and Markdown frontmatter, not as a source-document format.
- Persist imported state, claims, scratch fields, and staged changes in `.mndmap/state.sqlite`.
- Keep all CLI, REST, MCP, dashboard, and export operations on one shared core service.

```mermaid
flowchart LR
    Docs[MarkdownAndMDX] --> Parse[StructuralParser]
    Config[OptionalConfig] --> Parse
    Parse --> State[SQLiteWorkingState]
    State --> Query[ReadAndQuery]
    Query --> Claims[LeaseClaims]
    Claims --> Changes[AtomicChanges]
    Changes --> State
    State --> Preview[ExportPreview]
    Preview --> Write[ConflictCheckedExport]
    Write --> Docs
    State --> Graph[MndflowProjection]
    Graph --> Dashboard[DashboardAndPublishedViews]
```

## Structural import and inference

- Parse Markdown and MDX headings, sections, tables, lists, task items, links, and frontmatter while retaining exact source locations and untouched bytes.
- Infer only document structure:
  - tables become collections, headers become fields, and rows become records;
  - repeated structured lists may become collections;
  - headings and nested sections retain hierarchy;
  - checkboxes retain their raw checked state;
  - frontmatter contributes fields to its document or configured record.
- Do not infer workflow meaning, dependency semantics, ownership semantics, state transitions, enums, or acceptance rules.
- Treat unsupported MDX expressions and ambiguous prose as opaque content that can be read but not surgically rewritten.
- Choose record identity in this order: configured key, explicit source ID, unique table/list value, then stable source locator. Report unstable inferred identities.
- Allow one logical record to map to multiple source locations when configuration identifies repeated keyed representations. Diagnose conflicting source values and update all mapped locations on export.

## Optional configuration

`mndmap.yaml` is a partial override for ambiguities; it is not required for ordinary documents. It may define:

- source include/exclude globs;
- collection selectors;
- record identity fields;
- preferred record ordering;
- repeated source regions that represent the same logical collection;
- generated document regions or files;
- claim lease defaults;
- the exposed name of the default scratch field;
- additional predefined scratch fields.

Example:

```yaml
version: 1

sources:
  include: docs/**/*.{md,mdx}
  exclude: docs/generated/**

collections:
  work:
    sources:
      - document: docs/plan.md
        table_headers: [ID, Status, Waits, Owns]
    id: ID
    order: [ID]

claims:
  default_lease_seconds: 900

scratch_fields:
  default:
    id: open_field
    alias: implementation_plan
  additional:
    - id: review_notes
      alias: review_notes
```

Scratch aliases must not collide with source-backed field names or with one another.

## Closed source schema and scratch fields

- Agents may update existing source-backed fields on records they hold, but may not create source-backed fields or table columns.
- Every inferred collection exposes one predefined SQLite-only free-form field with internal ID `open_field`.
- Configuration may change its exposed alias and declare a small fixed set of additional scratch fields.
- Scratch fields accept free-form Markdown text, require a valid claim to update, persist across service restarts, and are queryable through the same record surface.
- Scratch fields and claims are operational metadata: they never modify or export to source documents.
- Re-import preserves scratch data when record identity remains stable. Missing or unstable records produce diagnostics rather than silently attaching scratch data elsewhere.

## Claims

Use expiring advisory leases backed by SQLite:

- A caller supplies an opaque `ownerId`, record IDs, and requested lease duration.
- One atomic claim request grants every currently available record and reports the denied subset.
- Every granted claim returns a server-generated monotonically increasing fencing token and expiration time.
- Updates to existing records and scratch fields require the current claim token.
- Claims can be renewed or released; release is idempotent and expiration recovers abandoned work.
- Owner IDs are coordination labels, not credentials or authorization.
- Domain fields such as an `Owns` table column remain ordinary document data and are unrelated to ledger claims.

The service supports no fairness guarantees, dependency scheduling, path-overlap scheduling, or automatic batch selection. External agents query and order records, decide what they want, then attempt to claim them.

## Atomic staged changes

- Apply a caller's complete operation list in one short SQLite transaction.
- Support only generic `create`, `update`, and `delete` record operations plus scratch-field updates.
- Require valid fencing tokens for operations on existing records.
- Reject duplicate caller-supplied record IDs.
- Record actor, operation list, and before/after values for review and reversal.
- Mark source-backed changes as pending export; scratch-only changes never enter the export set.
- Commit every operation or none, allowing an external agent to implement compound actions such as splitting a record and retargeting references without a workflow-specific API.

## Query and ordering

- List collections and their inferred fields.
- List/read records in source order by default.
- Support explicit sorting by source-backed fields, raw field-value filters, text search, and claimed/unclaimed filters.
- Return source-backed values, configured scratch fields, claim state, record identity confidence, and staged-change state together.
- Do not interpret readiness, dependencies, ownership, or status values.

## Explicit export

1. Validate that staged operations can be represented in their original source structures.
2. Generate a previewable patch set.
3. Verify every affected file still matches its imported revision.
4. Refuse stale files and report conflicts without overwriting external edits.
5. Refuse export while active claims exist unless explicitly forced.
6. Stage revised files and use a recovery journal while replacing them.
7. Re-import successful output as the new baseline and mark exported changes complete.

Writers update the smallest representable source region—table cell or row, list item, frontmatter value, or section body—and preserve unrelated bytes. Git remains responsible for history and cross-machine merging.

## Minimal surfaces

Implement one shared service and expose it through:

- CLI: `import`, `list`, `claim`, `renew`, `release`, `apply`, `changes`, `export --preview`, and `export`.
- REST and MCP: list collections/records, claim/renew/release records, apply atomic changes, inspect pending changes, and preview/apply export.
- Dashboard: collection list, ordered table/graph views, record detail, scratch editor, claim state, pending-change review, and export conflicts.

The MCP layer is a thin wrapper over the same service methods and validation as the CLI, REST API, and dashboard.

## mndflow compatibility and acceptance

- Project ledger records into mndflow's `Graph`/`Element`/`Edge` envelope through [`src/mndflow/adapter.ts`](src/mndflow/adapter.ts).
- Keep the adapter narrow because mndflow currently has no supported package exports.
- Use the current mndflow Markdown planning documents as the principal fixture:
  - import their tables, lists, sections, repeated IDs, and status glyphs without silent loss;
  - expose ordered records for external agents to interpret and claim;
  - allow claimed agents to place implementation plans and proposed modules/files in configured scratch fields;
  - stage edits to existing source-backed cells and entries;
  - export those edits back to every configured source location;
  - report ambiguous or conflicting repeated records.
- Dependency validation, ownership validation, and next-batch scheduling described by mndflow remain external consumers of the ledger API rather than mndmap behavior.

## Dashboard and publication

- Build a read-first React/Vite dashboard under [`src/ui/`](src/ui/) with `@xyflow/react`.
- Mirror only mndflow design tokens and graph-file semantics rather than copying its application.
- Generate a deterministic SVG, serialized graph JSON, and a small read-only React embed from exported document state.
- Use [`mdsite.yaml`](mdsite.yaml) and [`scripts/publish.mjs`](scripts/publish.mjs) to build the docs and copy the self-contained embed into mdsite output.
- Add [`.github/workflows/docs.yml`](.github/workflows/docs.yml) to test, export publication artifacts, build mdsite, and publish the static directory.

## Scope controls

- No YAML source-document adapter in the MVP.
- No dynamic creation of source or scratch fields by agents.
- No workflow/rules DSL, semantic role system, scheduler, authentication, real-time collaboration, or automatic three-way merge.
- No semantic extraction from arbitrary prose.
- No direct dependency on mndflow internals until it publishes stable package boundaries.
- A single local mndmap service owns the SQLite file; do not place it on a shared network filesystem.

## Implementation sequence

1. Bootstrap TypeScript, SQLite, tests, and configuration loading.
2. Implement Markdown/MDX structural parsing, source maps, identity, repeated-record mapping, and conservative diagnostics.
3. Implement SQLite collections, records, predefined scratch fields, staged changes, and deterministic queries.
4. Implement lease claims with expiration and fencing tokens.
5. Implement atomic generic mutations, history, reversal, and claim enforcement.
6. Implement revision-checked format-preserving export and recovery.
7. Expose the shared core through CLI, REST, and MCP.
8. Validate the mndflow documents as an import, claim, scratch, edit, repeated-record, and export fixture.
9. Add the React Flow dashboard and mndflow envelope adapter.
10. Add SVG/interactive publication, mdsite integration, and CI.

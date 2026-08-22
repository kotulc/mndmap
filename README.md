# mndmap
A markdown powered project management dashboard and visualization engine.

mndmap turns the tables and structured lists in `.md` and `.mdx` files into a local, queryable document ledger. Humans and agents can inspect records, temporarily claim them, stage safe edits, and explicitly export those edits back to the original Markdown.

Markdown remains the durable source of truth. Claims, scratch notes, and pending edits live in `.mndmap/state.sqlite`; mndmap never commits to Git or silently overwrites source changes.

## What you should know

- Markdown tables are inferred as collections automatically.
- GFM task lists and lists with repeated labeled children may also become collections. Plain prose lists remain prose.
- Inference is structural, not semantic: mndmap does not decide what `Status`, `Waits`, or `Owns` mean.
- Agents claim records through expiring leases. Claims coordinate writes; they are not authentication.
- Every collection has a SQLite-only `open_field` scratch field. Scratch content is never exported to Markdown.
- Source-backed edits are staged until an explicit export.
- Export previews the exact affected documents and rejects files changed since import.
- Agents cannot create new source fields or Markdown table columns.
- YAML is used only for optional `mndmap.yaml` configuration and Markdown frontmatter.
- Run one mndmap service per workspace. Do not share the SQLite file over a network filesystem.

## Requirements

- Node.js 22.5 or newer
- npm
- Git for reviewing and committing exported document changes
- Docker only when building the optional mdsite publication locally

Node may print an experimental SQLite warning. mndmap currently uses the SQLite API included with Node 22.

## Setup

```sh
git clone https://github.com/kotulc/mndmap.git
cd mndmap
npm install
npm test
npm run build
```

For development, invoke the CLI with:

```sh
npm run cli -- <command>
```

After installing or linking the package, use `mndmap <command>` directly. The examples below use the shorter installed command; replace `mndmap` with `npm run cli --` when running from this checkout.

## Quick start

Import a workspace containing Markdown:

```sh
mndmap import --root /path/to/project
```

This scans `**/*.md` and `**/*.mdx` by default, creates `.mndmap/state.sqlite`, and reports imported collection and record counts plus any inference diagnostics.

Inspect the result:

```sh
mndmap list collections --root /path/to/project
mndmap list records COLLECTION_ID --root /path/to/project
mndmap list records COLLECTION_ID --sort Status --filter Status=queued --root /path/to/project
mndmap list record COLLECTION_ID RECORD_ID --root /path/to/project
```

Collection and record IDs are returned by the preceding list commands. Records with a configured or explicit key retain that key; otherwise mndmap derives an identity and reports when it depends on source position.

## Claim and update a record

Claims use an opaque owner ID chosen by the caller. A batch claim grants every available record and reports the denied subset:

```sh
mndmap claim --owner agent-1 --lease 900 COLLECTION/RECORD COLLECTION/ANOTHER_RECORD
```

Each granted claim includes a fencing `token`. Include the current token when renewing, releasing, or updating that record:

```sh
mndmap renew --owner agent-1 COLLECTION/RECORD/TOKEN
mndmap release --owner agent-1 COLLECTION/RECORD/TOKEN
```

Claims expire automatically. A stale token cannot update a record after its lease expires or another caller reclaims it.

### Use the private scratch field

Write an implementation plan or working notes without changing the source document:

```json
[
  {
    "type": "scratch",
    "collectionId": "work",
    "recordId": "B.6a",
    "token": 184,
    "field": "open_field",
    "value": "Plan:\n- Update the parser\n- Add export coverage"
  }
]
```

Save this as `operations.json`, then apply it:

```sh
mndmap apply --actor agent-1 --file operations.json --root /path/to/project
```

Scratch fields persist across service restarts but remain local to `.mndmap/state.sqlite`. They are not included in exported documents or Git history.

### Stage a source-backed edit

Use field IDs returned by `list collections`:

```json
[
  {
    "type": "update",
    "collectionId": "work",
    "recordId": "B.6a",
    "token": 184,
    "values": {
      "status": "landed"
    }
  }
]
```

Apply the operation in the same way:

```sh
mndmap apply --actor agent-1 --file operations.json --root /path/to/project
mndmap changes --root /path/to/project
```

An operation list is atomic: every operation is applied to SQLite or none are. Updates and deletes require current claim tokens. Creating a record requires a unique caller-supplied ID and a collection adapter that supports creation.

## Export staged changes

Release active claims, preview the complete document patches, then export:

```sh
mndmap release --owner agent-1 COLLECTION/RECORD/TOKEN --root /path/to/project
mndmap export --preview --root /path/to/project
mndmap export --root /path/to/project
git diff
```

Export checks every affected source revision before writing. If a document changed after import, mndmap refuses the export rather than overwriting it. Export also refuses while claims remain active; `--force` is available for administrative recovery and invalidates stale claims.

Successful export writes the smallest supported source regions, re-imports the documents as the new baseline, and marks the staged changes complete. Git remains responsible for review, history, merging, and commits.

## Dashboard

During development, start the local API and Vite UI in separate terminals:

```sh
npm run serve -- --root /path/to/project
npm run ui
```

The REST service listens on `http://127.0.0.1:7341`; Vite proxies dashboard `/api` requests to it.

For a production build:

```sh
npm run build
npm run serve -- --root /path/to/project --static dist/ui
```

The dashboard provides collection navigation, ordered table and graph views, record details, claims, scratch editing, pending changes, and export previews. The REST server binds to loopback by default and has no authentication; do not expose it publicly.

## Agent and MCP usage

The stdio MCP server exposes the same service operations as the CLI and REST API:

- `list_collections`
- `list_records`
- `get_record`
- `claim_records`
- `renew_claims`
- `release_claims`
- `apply_changes`
- `list_changes`
- `preview_export`
- `apply_export`

Start it from this checkout:

```sh
npm run mcp -- --root /path/to/project
```

Or configure an MCP client to launch the built entry point:

```json
{
  "mcpServers": {
    "mndmap": {
      "command": "node",
      "args": [
        "/path/to/mndmap/dist/src/mcp.js",
        "--root",
        "/path/to/project"
      ]
    }
  }
}
```

Run `mndmap import` before connecting MCP for the first time. Owner IDs are caller-provided coordination labels, not security identities.

## REST API

Start the service:

```sh
mndmap serve --root /path/to/project
```

The minimal JSON API includes:

```text
GET  /health
POST /import
GET  /collections
GET  /collections/:collection/records
GET  /collections/:collection/records/:record
POST /claims
POST /claims/renew
POST /claims/release
POST /apply
GET  /changes
POST /export/preview
POST /export/apply
```

Dashboard requests may use the same routes under `/api`. Record-list queries support `sort`, `direction`, `search`, `claimed`, and `filter.FIELD=value`.

## Optional configuration

Configuration is unnecessary for ordinary Markdown tables and strongly structured lists. Add `mndmap.yaml` at the workspace root when inference needs help, fields need stable API aliases, repeated source regions represent the same logical records, or scratch fields need different names.

```yaml
version: 1

sources:
  include: docs/**/*.{md,mdx}
  exclude:
    - docs/generated/**

collections:
  work:
    sources:
      - document: docs/plan.md
        select:
          kind: table
          under: [The plan]
          headers: [ID, Status, Does]
        key:
          field: ID
        fields:
          id:
            column: ID
          status:
            column: Status
          description:
            column: Does
    order: [id]
    writable_fields: [status, description]

claims:
  default_lease_seconds: 900

scratch_fields:
  default:
    alias: implementation_plan
  additional:
    - id: review_notes
      alias: review_notes
```

Supported configured selectors are `table`, `list`, `section`, and `frontmatter`. Selectors use document paths, heading paths, headers, and optional occurrence numbers rather than unstable line numbers. A selector that unexpectedly matches zero or multiple regions reports an error instead of guessing.

Configuration may also provide list `create_template` values and generated document projections. It maps existing source structures; it does not permit agents to create source fields dynamically.

## Inference and write boundaries

- Every Markdown table is inferred as a separate collection unless configuration maps source regions together.
- Task lists expose `$checked` and `$text`.
- Lists with repeated labeled child values expose those existing labels as fields.
- Plain lists and repeated sections require configuration before they become collections.
- Tables support cell updates and normally support record creation/deletion.
- Task and labeled lists support only edits the adapter can preserve safely. Complex creation requires a configured template.
- Unsupported MDX expressions are retained as opaque content.
- If the same configured logical record appears in several locations, export updates its mapped occurrences and reports conflicting imported values.

## Publishing

Generate deterministic graph JSON, SVG snapshots, a read-only React embed, and mdsite content:

```sh
npm run publish -- --root /path/to/project --out-dir .publication
npm run publish:verify -- --input .publication/mndmap
```

Build the configured mdsite output with Docker:

```sh
docker run --rm \
  -e BASE_PATH=/mndmap \
  -v "$PWD:/workspace" \
  ghcr.io/kotulc/mdsite:latest \
  build --config /workspace/mdsite.yaml
```

Copy the interactive artifacts into the generated site:

```sh
npm run publish:copy -- --input .publication/mndmap --site-output dist/site
npm run publish:verify -- --input dist/site/mndmap
```

The included `.github/workflows/docs.yml` tests and builds the project, runs mdsite, and deploys `dist/site` to GitHub Pages on pushes to `main`. Enable Pages with GitHub Actions as its source. Set the optional `BASE_PATH` repository Actions variable when the site is not hosted at `/mndmap`.

## Development

```sh
npm test
npm run typecheck
npm run build:core
npm run build:ui
npm run build
```

Generated and local state directories are ignored:

```text
.mndmap/
.publication/
dist/
```

## Dependencies
This project is building off two existing projects:
System modeling visualization tool - https://github.com/kotulc/mndflow
Markdown website publication engine - https://github.com/kotulc/mdsite

The idea is to leverage the reactflow diagram "views" of mndflow for visualization (as well as its overall look and feel) and extend that to this tool. Both tools should "speak" the same language (though mndflow is still actively moving) and leverage this project as one of many extensions that the final mndflow tool can leverage.

mdsite can be used for publishing the documentation and can be leveraged as a github workflow ci/cd step. Ideally the published documentation from this tool will contain diagram SVG exports that reflect the current state of the working project.

## Problem Statement
Managing multi-agent workflows or teams working collaboratively on a living project is tedious and fragile. Project documents used for planning and tracking implementation become bloated and unmaintainable. Documents acting as "truth" often get overwritten or missed entirely. 

## Proposed Solution
This tool does not define agentic workflows or re-invent git, instead it leverages existing tools and project documents and translates these documents into managable parallel write-safe queriable data objects presented in a simple general and unified dashboard, whose interface surface is defined by API, whose content is maintained in a standard database format and then whose state is presented in published documentation as living embedded dynamic diagram artifacts.

## Goals
- Generalize to requirement/specification/project tasking tracking and management cases
- Automate document to query-able data source and interface surface translation
- Visualize the data and interface surfaces via a simple and elegent modern dashboard (use the mndflow themes)
- Provide/embed dynamic react components in published docs that reflect the structure and state of those docs 
- Published static docs use the mdsite theme, present doc/project state in a flow diagram svg
- Translation process is generic and repeatable for any collection of source .md or .mdx documents
- Translator works in both directions: parses source documents, writes document revisions in a safe manner
- Agent-first interface surface for agent tool to query/update owned project items in a parellel work environment
- Stretch goal: Translator may be leveraged by mndflow to generate block structure projects directly from docs

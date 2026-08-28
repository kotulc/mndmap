---
title: Diagrams
categories:
  - workflow
tags:
  - mndflow
  - svg
  - navigation
related:
  - title: Organization and structure
    url: /workflow/organization-and-structure
  - title: Workflow overview
    url: /workflow/overview
---

# Diagrams

mndmap draws your documentation structure as **mndflow block diagrams** — live in the dashboard, embedded as inline SVG in the published site.

## How it works

1. The graph builder reads an immutable working-store snapshot
2. Organization nodes become blocks with deterministic IDs and ordering
3. `@mnd/kit` **0.2.0** validates the graph, projects a layer (with depth `n`), and renders SVG
4. Every navigable block carries a `link` field: emitted page URL + heading anchor
5. mdsite preserves inline SVG through ingest (with MDX-safe escaping)

The graph is **derived and ephemeral**. Nothing about layout is stored. Reorganizing the tree changes the diagram; dragging boxes in a preview is not supported.

## Depth

Default depth is **3** — `#`, `##`, and `###` become blocks. Deeper headings fold into the third level as fields so a layer stays readable and a drawing stays page-sized.

```yaml
diagrams:
  enabled: true
  depth: 3
```

Per-node depth overrides are available in the interactive workspace.

## Where diagrams appear

| Page type | Diagram |
|-----------|---------|
| Generated folder/group landing pages | yes, by default |
| Ordinary pages | only when marked as a diagram root |
| `diagrams.enabled: false` | none globally |

Placement on landing pages: after title and introductory prose, before generated child links or remaining sections.

## Navigation in the published site

Every box links to the page and heading it came from. Clicking a box in a published page lands on that section — diagrams are navigation, not decoration.

mndmap uses mdsite-compatible URL and anchor rules (Nextra/GitHub style slugification).

## Diagnostics

The complete graph must pass `validate` and `review` before export. Graph JSON is available for debugging:

```bash
mndmap graph --out plan.mndflow.json
```

Full graph JSON is **not** included in the mdsite handoff — only inline SVG in markdown.

## mndflow relationship

mndmap is a translator, not a mndflow client:

- Uses `@mnd/kit` for `Explorer`, `Viewer`, and `draw_svg`
- Ships a documentation vocabulary (`mndmap vocab --check`)
- Never opens a mndflow workspace or writes a log file

The matching mndflow commit is recorded in `mndflow-pin.json` for fixtures and debugging.

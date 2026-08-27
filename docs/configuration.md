---
title: Configuration
categories:
  - reference
tags:
  - yaml
  - mndmap.yaml
  - mdsite
related:
  - title: Getting Started
    url: /getting-started
  - title: mdsite handoff
    url: /publishing/mdsite-handoff
  - title: Emit contract
    url: /specifications/emit-contract
---

# Configuration

mndmap reads `mndmap.yaml` from the project root (or a path passed to `--config`). All paths are workspace-relative unless noted.

## mndmap.yaml

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
  depth: 3          # '#', '##', '###' — deeper headings fold in as fields

mdsite:
  config: mdsite.yaml   # optional template; workspace-root mdsite.yaml also works

selectors: []
```

### Source and destination

| Field | Default | Description |
|-------|---------|-------------|
| `source.root` | `docs` | Directory to parse; never written to |
| `source.include` | `**/*.{md,mdx}` | Globs relative to `source.root` |
| `source.exclude` | `[]` | Globs to skip |
| `destination` | `site` | Output directory; replaced atomically on build/emit |

Rules:

- `source.root` and `destination` must not contain each other.
- The destination and `.mndmap/` are always excluded from discovery.
- Missing source roots, empty matches, unknown keys, and invalid globs are configuration errors.
- Ledger-era keys (`claims`, `leases`, `scratch`, etc.) are rejected with a pointer to `archive.md`.

### Diagrams

| Field | Default | Description |
|-------|---------|-------------|
| `diagrams.enabled` | `true` | Emit inline SVG on landing pages |
| `diagrams.depth` | `3` | Heading levels that become blocks; deeper headings fold into the third level as fields |

Per-node depth overrides are available in the interactive workspace. Ordinary pages include a diagram only when marked as a diagram root.

### Selectors

Selectors resolve ambiguous structure — which tables and lists are records, and what identifies a row. They use document paths, heading paths, and column headers rather than line numbers.

A selector matching zero or several regions reports an error instead of guessing.

```yaml
selectors:
  - document: docs/plan.md
    heading: Plan
    kind: table
    identity: ID
    fields:
      Status: { column: Status }
      Owns: { column: Owns }
```

### mdsite template

```yaml
mdsite:
  config: mdsite.yaml
```

Precedence when emitting `site/mdsite.yaml`:

1. Explicit `mdsite.config` path in `mndmap.yaml`
2. Workspace-root `mdsite.yaml`
3. Built-in defaults

mndmap **preserves** your identity, theme, output, and deployment fields. It **owns** `content` (always `.` in the emitted copy) and `nav_order` (derived from organization sibling order).

## mdsite.yaml (workspace template)

Author site identity at the project root. mndmap copies this into the destination and fills navigation.

```yaml
title: My Documentation
description: What this site is about
repo_url: https://github.com/username/my-project
content: ./docs        # overridden to '.' in the emitted copy
output: ./dist
toc: true
theme_toggle: navbar
reading_time: true
theme:
  color: blue
  typeset: sans
```

Fields mndmap does not generate — you own these:

- `title`, `description`, `repo_url`, `feed_url`, `footer`
- `theme`, `theme_toggle`, `toc`, `reading_time`
- `output`, `components`, `assets`

Fields mndmap replaces in the emitted copy:

- `content` → `.` (the destination root)
- `nav_order` → maps from physical organization

### Removed mdsite keys

If your template still contains `meta` or `flatten`, mdsite rejects it at load time. Move tagging and directory organization to mndmap (or frontmatter). See [mdsite handoff](publishing/mdsite-handoff.md).

### BASE_PATH

Subpath deployment (`username.github.io/repo-name`) uses the `BASE_PATH` environment variable at **mdsite** build time — not a field in either YAML file:

```bash
BASE_PATH=/repo-name node scripts/cli.js build --config site/mdsite.yaml
```

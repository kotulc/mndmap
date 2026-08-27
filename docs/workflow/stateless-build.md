---
title: Stateless build
categories:
  - workflow
tags:
  - build
  - ci
  - reproducible
related:
  - title: Interactive workspace
    url: /workflow/interactive-workspace
  - title: Emit contract
    url: /specifications/emit-contract
---

# Stateless build

`mndmap build` is the reproducible pipeline for CI and automation. It does not read `.mndmap/state.sqlite` and leaves no persistent working state behind.

## Command

```bash
mndmap build --root /path/to/project
mndmap build --config /path/to/mndmap.yaml
```

## Steps

1. Load and validate `mndmap.yaml` (or defaults)
2. Create an ephemeral SQLite working store
3. Parse every matching source document
4. Seed organization that mirrors source folders and pages
5. Keep each source section in its source page
6. Preserve manual frontmatter; fill `description` and `reading_time` when absent
7. Derive and validate the complete mndflow graph
8. Plan links, assets, output paths, anchors, landing pages, and diagrams
9. Copy or default mdsite configuration; write generated `nav_order`
10. Report all blocking diagnostics together
11. Stage the complete destination under `.mndmap/emit-<uuid>/` (or temp dir)
12. Atomically replace the previous destination

## Determinism

The same source, configuration, and `@mnd/kit` version must produce byte-identical output. This is enforced in tests and is a core contract for CI.

Pin the kit version via `mndflow-pin.json` in this repository; consumer projects inherit the kit version bundled with their mndmap install.

## Default organization

On a fresh build with no dashboard history:

- Each source folder becomes a folder node
- Each source page becomes a page node at its source path
- Sections stay within their source page
- Sibling order follows source filesystem order

To customize structure without the dashboard, use selectors for record extraction. Full reorganization requires the interactive workspace and `emit`.

## Failure behavior

Planning and validation finish **before** destination mutation. If anything fails:

- The previous `site/` (or configured destination) is untouched
- Diagnostics list every blocking issue
- No partial writes land in the destination

## Typical CI job

```yaml
- name: Install mndmap
  run: npm ci && npm run build
  working-directory: mndmap

- name: Emit publication destination
  run: node dist/src/cli.js build --root .

- name: Build static site
  run: |
    docker run --rm \
      -v ${{ github.workspace }}:/workspace \
      ghcr.io/kotulc/mndsite:main \
      build --config /workspace/site/mdsite.yaml
```

See [Deployment](../publishing/deployment.md) for GitHub Pages and `BASE_PATH` setup.

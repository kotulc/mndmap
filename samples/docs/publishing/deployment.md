---
title: Deployment
categories:
  - publishing
tags:
  - ci
  - docker
  - github-pages
related:
  - title: mdsite handoff
    url: /publishing/mdsite-handoff
  - title: Stateless build
    url: /workflow/stateless-build
---

# Deployment

The full documentation pipeline chains two build steps: mndmap emits a destination, mdsite renders static HTML.

```text
git push
  → CI: mndmap build
  → CI: mdsite build (site/mdsite.yaml)
  → deploy dist/
```

## GitHub Actions example

```yaml
name: Docs

on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Build mndmap
        run: npm ci && npm run build

      - name: Emit destination
        run: node dist/src/cli.js build --root .

      - uses: actions/checkout@v4
        with:
          repository: kotulc/mndsite
          ref: main
          path: mndsite

      - name: Build static site
        run: |
          npm ci
          node scripts/cli.js build --config ../site/mdsite.yaml
        working-directory: mndsite
        env:
          BASE_PATH: /${{ github.event.repository.name }}

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

This repository's `.github/workflows/docs.yml` builds docs on every run and deploys to GitHub Pages on pushes to `main`.

## BASE_PATH

Project pages (`username.github.io/repo-name/`) require a subpath prefix at **mdsite** build time:

```bash
BASE_PATH=/mndmap node scripts/cli.js build --config site/mdsite.yaml
```

Do not put `BASE_PATH` in `mndmap.yaml` or `mdsite.yaml`. The workflow sets it from the repository name.

In **Settings → Pages**, set the source to **GitHub Actions** so `deploy-pages` can publish the artifact.

Local previews of `dist/` need no base path.

## Docker

Build without a local mdsite checkout:

```bash
# after mndmap build
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/kotulc/mndsite:main \
  build --config /workspace/site/mdsite.yaml
```

The image contains no embedding model — it expects publication-ready content from mndmap (or equivalent upstream preparation).

## What to commit

| Strategy | Pros |
|----------|------|
| Commit `docs/` only; build in CI | Single source of truth; smallest repo |
| Commit `docs/` + `site/` | Review emitted structure in PRs |
| Commit `docs/` + custom `.mndmap/` | **Not supported** — dashboard state is local |

Recommended: commit source and config; regenerate `site/` and `dist/` in CI.

## Pinned versions

`mndflow-pin.json` records the supported mndsite branch and Docker image tag. Keep CI aligned with these pins when upgrading mndmap.

## Publishing targets

mdsite outputs a static `dist/` directory deployable anywhere:

- GitHub Pages (`actions/deploy-pages`)
- Vercel, Netlify, Cloudflare Pages
- S3 + CloudFront
- Any static file host

mndmap and mdsite stop at the artifact. You own the publish step.

---
title: About
description: What mndsite is, as a system of parts
categories:
  - reference
tags:
  - overview
  - pipeline
status: stable
---

# mndsite

Markdown in, static site out: mndsite publishes a folder of Markdown and one YAML file as a website any static host can serve.

```cards
```

It runs once, at build time. [Configuration](#configuration) says what to make, [Ingest](#ingest) prepares the content, [Build](#build) renders it, and the [Site](#site) is what readers get. [Publishing](#publish) runs it all wherever you like.

## Configuration

One file, `mndsite.yaml`, decides the site: its title, theme, facets and what each page shows.

Only `title` is required; everything else has a default. [Ingest](#ingest) reads where the content lives and how to order it, and [Build](#build) reads how pages look. The full list of keys is in [Configuration](configuration.md).

## Ingest

Ingest mirrors the content folder into the site's page tree exactly as written: nothing regrouped, nothing renamed.

It hands [MDX pages and metadata](#build) to Build. It changes no meaning: organisation and enrichment belong upstream. The details are in [Content Pipeline](features/content-pipeline.md).

### Mirror the tree

Every `.md` becomes an `.mdx` page at the same path, and `index.md` becomes its folder's landing page.

Routes match the source tree, so a link written in the content still works on the site.

### Copy assets

`_assets/` and `images/` are copied beside the pages, and references to them rewritten to resolve under any base path.

Inline SVG is kept as written, made safe for MDX.

### Derive metadata

Frontmatter becomes `site-meta.json`: titles, facets, sections, links and word counts.

[Navigation](#navigation) and [browsing](#browse-and-facets) read it; nothing is generated or guessed.

### Order navigation

`nav_order` pins pages first; the rest sort by name, and the result becomes each folder's `_meta.json`.

The [sidebar](#navigation) follows it.

## Build

Next.js and Nextra render every page to static HTML; nothing runs on a server afterwards.

Build exports the [Site](#site) to `dist/`. The [Deployment](features/deployment.md) guide covers where it can go.

### MDX pages

Each page renders through the docs theme: headings, tables, code and inline SVG as written.

### Theme and chrome

The navbar, sidebar, footer and theme toggle come from `display` and `theme` in [Configuration](#configuration).

### Static export

`next build` writes plain HTML, CSS and JavaScript to `dist/`, ready for any static host.

## Site

What readers get: pages, navigation and a feed, all working without a server.

### Navigation

A sidebar from the folder tree, breadcrumbs above each page, and a contents column beside it.

### Browse and facets

Every page can be filtered by its facets (topic, tags, status), and each page's chips link back to the filter.

### Feed and RSS

The updates folder becomes an expandable feed of cards, with an RSS feed that [Trendly](#publish-with-trendly) can follow.

## Publish

Build anywhere: the Docker image runs the same command in any CI, and the included workflow deploys to GitHub Pages.

[Build](#build) runs inside it either way. See [Deployment](features/deployment.md).

### Publish with Trendly

Trendly opens the same content repository to preview posts and choose which drafts go out; the next build publishes them.

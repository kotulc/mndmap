---
title: Configuration
description: The keys of mndmap.yaml
---

# Configuration

`mndmap.yaml` in the working folder, or the file `--config` names. Paths in it are read from where the file is. Every key is optional but `content`, and a [flag](cli.md#flags) overrides its key.

```yaml
content: docs
out: build
mode: static
exclude:
  - updates/drafts
map:
  width: 800
  height: 520
```

| Key | Default | Means |
|---|---|---|
| `content` | (required) | the markdown folder read |
| `out` | `build` | where the copy, diagrams drawn, is written |
| `mode` | `static` | `static`: inline SVG; `interactive`: a frame on the diagram's own page. Decks are framed unless their fence says `static` |
| `urls` | `directory` | how the site publishes pages: `directory` (`/a/b/`) or `html` (`/a/b.html`) |
| `base` | none | an absolute base for links; none keeps them relative, which suits any base path |
| `assets` | `_assets/mndmap` | where diagram pages and the gallery are written, under `out` |
| `title` | the home page's | the site's name at the top of the map |
| `dark` | `retro` | mndflow's dark theme: `retro` (green) or `modern` (cyanotype) |
| `exclude` | none | pages or folders, under `content`, left off the map and out of lookup |
| `strict` | `false` | fail the build on a link that names no page |
| `map.width`, `map.height` | 800, 520 | the size a site map is laid out at |
| `cards` | `false` | also write the whole site as one deck, `<assets>/site.html`: folders, pages and their sections, zoomed through as cards; a card's address is its page's url and anchor |

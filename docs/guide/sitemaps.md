---
title: Site maps
description: The site drawn as a treemap, every page and section a link
---

# Site maps

A ```` ```sitemap ```` fence draws the site as a treemap, worked out from the content folder itself: nothing is listed by hand, so it is current on every build.

````markdown
```sitemap
root: /guide
height: 420
```
````

## Options

| Option | Default | Means |
|---|---|---|
| `root` | `/` | the folder drawn |
| `width`, `height` | `map` in [configuration](../reference/config.md) | the size it is laid out at |
| `mode` | `mode` in configuration | `static` or `interactive` |

## Reading it

| Mark | Means |
|---|---|
| a box, titled top-left | a folder; the number is how many pages it holds |
| a chip | a page, as large as what it says; its left edge is its top-level folder's colour |
| counts under a name | words and sections |
| rows under the counts | the page's sections, each a link to its heading |
| a chip titled `folder` | a folder too small to give each page room, listing its pages instead |
| the accent outline | the page the map is drawn on |

A chip shows its name, then its counts, then its rows, each only where it fits whole: nothing is squashed.

## Interactive

On a map's own page, or framed with `mode: interactive`:

- a folder's title zooms into it; the trail above leads back out
- typing in **Find a page** quiets every page that does not match its title, description or sections; Enter opens the first that does
- hovering a page shows its description and size

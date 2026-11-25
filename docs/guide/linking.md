---
title: Linking
description: How a diagram names a page, and how its links stay right as the site changes
---

# Linking

Diagrams link by naming pages, never by writing their addresses. mndmap finds each page in the content folder at build time and writes the href itself, so links follow pages that move and fail loudly when a page goes.

## Naming a page

`click Node "reference"` in a flow. The reference is matched, in order, against:

| Match | Example | Finds |
|---|---|---|
| the page's url | `guide/linking` | `guide/linking.md` |
| its source path | `guide/linking.md` | the same page |
| the end of its url, when only one page ends so | `linking` | the same page |
| its title | `Linking` | the same page |

- `#section` names a heading by its anchor: `guide/linking#checking-links`
- an address with a scheme (`https://…`) is linked as it is
- the site map needs nothing: it links every page and section it draws

## Checking links

```
mndmap check docs
```

Reads every page and diagram, writes nothing, lists each link that names no page or section, and exits non-zero if there are any: a step for CI. `mndmap build --strict` does the same and refuses to finish.

| Reported | Fix |
|---|---|
| `no page "x"` | the page moved or was renamed: name it again, or by its title |
| `no section "#x" in page.md` | the heading changed: use its new anchor |

## Hrefs

Hrefs are written relative to where each diagram lands (`../guide/linking/`), so a site works under any base path (`/mndsite/`) with nothing set. Set `base` only for a host that needs absolute links, and `urls: html` for a site that publishes `page.html` rather than `page/`.

## Leaving pages out

`exclude` in [configuration](../reference/config.md) keeps drafts and private pages off the map and out of lookup; they are still copied for the site, which decides what to publish.

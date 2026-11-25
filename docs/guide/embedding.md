---
title: Embedding
description: Static SVG or an interactive frame, each deck's and diagram's own page, and mndsite
---

# Embedding

`mndmap build` copies the content folder to `out`, swapping each diagram fence for its drawing. The site is then built from `out` like any markdown.

## Modes

| | `static` (default) | `interactive` |
|---|---|---|
| in the page | the SVG inline, its styles with it | an `<iframe>` on the diagram's own page |
| needs | nothing: no script, no assets | the diagram pages under `_assets/mndmap/` |
| links | yes | yes, opening in the host page |
| theme | follows the host's light / dark | follows the host when on the same site |
| deck | a poster: its blocks, each opening the deck at that card | the deck: cards open, the camera flies, lines draw in |
| site map | drawn at its laid size | zooms, finds, shows hover cards |
| flow | drawn at its laid size | lights a node's neighbours on hover |

Set the mode for every diagram in [configuration](../reference/config.md), or for one fence: ```` ```mermaid interactive ````, or `mode: interactive` in a sitemap fence. Decks are framed unless their fence says `static`, since a deck is read by moving through it.

## Diagram pages

Every diagram also gets a page of its own, `_assets/mndmap/<page>-<n>.html`, and `_assets/mndmap/index.html` is a gallery of them all. Each is one self-contained file: open it, link to it, or frame it.

A deck's page is the deck itself: the stage the cards are drawn on and the panel that tells them, filling the window. Framed, it offers **Open ⤢** to read it whole.

| A diagram page shows | |
|---|---|
| the drawing | full size; "Actual size" scrolls a flow wider than the window |
| its links | each node's reference and where it goes, broken ones marked |
| its source | the fence as written |

Pages are dark unless the reader chose otherwise. The toggle is mndsite's (system → light → dark) and shares its stored choice, so a reader's theme carries between the site and its diagrams.

## With mndsite

mndmap runs before mndsite and changes nothing in it: mndsite publishes `out` as it would any content folder, keeps inline SVG, and copies `_assets/` as it is.

```
mndmap build docs --out build
mndsite build --config mndsite.yaml --content build
```

In mndsite's deploy workflow, the first line goes before its build step and `content:` points at `build`.

## The look

Diagrams are set in mndflow's type and colour ramp: monospace text, neutral grounds, colour only as a thin mark. The dark theme is mndflow's `retro` (or `modern`, by `dark` in configuration); the light one its whiteprint.

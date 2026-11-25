---
title: Cards
description: A page read as a deck of cards, one per heading, that open to show their parts
---

# Cards

A ```` ```cards ```` fence turns its page into a deck: one card per heading, read one at a time. Each card says one thing, opens to show its parts, and draws lines to what it connects to. The page itself stays as written below the deck, for reading straight through.

````markdown
# mndsite

Markdown in, static site out.

```cards
```

## Ingest

Ingest mirrors the content folder into the site's page tree.

It hands [MDX pages](#build) to Build.
````

## From markdown to cards

| Markdown | Card |
|---|---|
| `#`, or the page title | the root: what the whole thing is |
| `##`, `###`, `####` | parts, and parts of parts, in reading order |
| a section's first paragraph | the card's one-line meaning, shown on its block |
| the rest of the section | its detail, told in the panel when it is in focus |
| a link to a heading in the page: `[MDX pages](#build)` | a relationship, labelled by the link's text |
| a link to another page | a link in the panel, checked like any other |

Write each section's first paragraph as the one sentence a reader needs, and link a section to the sections it hands things to.

## Reading a deck

| Move | Does |
|---|---|
| → ↓ Space, swipe left, the panel's → | the next card in reading order |
| ← ↑, swipe right, the panel's ← | the one before |
| Esc, Backspace, a click on the ground | out to the card that holds this one |
| a click on a block, a card named in the panel | that card |

The card in focus and the cards holding it are open, boxes round their parts; every other card is closed. Moving the focus animates between the two: parts grow out of a card that opens and fold into one that closes, the camera flies there (rising through the card that holds both when it crosses branches), the focus's lines draw in, and the panel turns. Each card has its own address (`#ingest`), the same anchor as its heading on the page.

## Options

```` ```cards ```` takes `height` (the frame's, default 640) and `mode`. Decks are framed (`interactive`) by default; `static` draws a still poster whose blocks open the deck at that card.

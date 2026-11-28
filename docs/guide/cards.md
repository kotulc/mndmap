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
| a list whose every item leads with a term: `**Term** — …` | a part per item |
| a numbered list | a part per step, each leading to the next |
| a bold label over a list: `**Phase 1**` then items | a part holding the list |
| the first sentence, when a section opens with a paragraph | the card's one-line meaning |
| the rest of the section | its detail, told in the panel when it is in focus |
| a link to a heading in the page: `[MDX pages](#build)` | a relationship, labelled by the link's text |
| a section naming another section's heading | a relationship, unlabelled |
| a link to another page | a link in the panel, checked like any other |

Pages are read as they are written: nothing needs reshaping. Only unambiguous structure becomes parts or lines; the rest stays as detail. Closed, a card says the page's `description` (at the root), else its meaning, else what it holds ("14 parts: …", "a table of 7 (Concern, Owner)").

With `cards` set in [configuration](../reference/config.md), the whole site is also one deck: folders hold pages, pages hold their cards, and Esc zooms out from a section to its page, folder and the site. A card's address is its page's url and anchor (`/about#ingest`), so a host can switch between a page and its cards in place.

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

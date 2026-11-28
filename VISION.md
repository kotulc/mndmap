# Vision

**Working vision, 2026-11-27.** mndmap is the test bed for the visual information cards that Trendly and mndsite are moving towards, and the way to make them portable and configurable. Next steps are in [PLAN.md](PLAN.md).

| | |
|---|---|
| **form** | micro documentation: content broken into bite-sized cards, read one at a time, like a feed |
| **a card** | a system block with one discrete, simple meaning, that expands to show its parts and its relationships |
| **source** | plain markdown, as written: cards, parts and relationships are inferred from its structure; no rewrites, no special formatting |
| **two views** | every page reads as text (the default) or as cards, by a toggle; a heading and its card share an address, so the reader keeps their place |
| **one zoom** | site → folder → page → section → part, all one deck: zoom out from any card to the page, the folder and the site |
| **motion** | mndflow's presentations and animations (camera moves, blocks opening, lines drawing in, stepped narration) catch the eye and guide attention |
| **mndmap's role** | build, try and refine these cards and components; make them portable (any static site) and configurable |
| **mndsite's role** | a shell that publishes and views them, used as it is: mndmap's output and components go in through what it already offers; mndmap never edits it |
| **mndflow's role** | the design language; mndmap iterates on its motion, and what works goes back to it |
| **goal** | one idea that works across many kinds of documentation, not only system overviews |


## Where it stands

| Proven | How |
|---|---|
| a page's structure makes a deck | headings are cards; term lists, numbered lists and labelled lists are parts; a section naming another is a relationship |
| the site is one deck | folders, pages and sections in one zoom (`--cards`); a card's address is its page and anchor |
| two views keep the reader's place | tried in mndsite (since removed): the toggle opened at the heading being read and closed at the card in focus |
| one card at a time, opening in place | only the focus and what holds it are open; layouts animate into each other while the camera flies |
| it travels | each deck is one self-contained page, framed into mndsite, themed with the host |
| it still reads without the motion | the page's text is the default view; a still poster stands in without script |

| Learned | |
|---|---|
| infer, don't reshape | the mndsite About page made a flat deck as written; reading its lists and mentions, not rewriting it, gave it structure |
| conservative inference | only structure that is unambiguous (term lists, numbered lists, exact heading names) becomes parts or lines; the rest stays as detail |
| the host stays a shell | editing mndsite to host the cards tangled two lines of work; the toggle is to come in as a component mndmap supplies |
| attention needs restraint | lines are quiet until they touch the focus, labels only on lit lines, unrelated cards fade back |

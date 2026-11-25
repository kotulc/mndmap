# Vision

**Working vision, 2026-11-24.** mndmap is the test bed for the visual information cards that Trendly and mndsite are moving towards, and the way to make them portable and configurable. Next steps are in [PLAN.md](PLAN.md).

| | |
|---|---|
| **form** | micro documentation: content broken into bite-sized cards, read one at a time, like a feed |
| **a card** | a system block with one discrete, simple meaning, that expands to show its parts and its relationships |
| **motion** | mndflow's presentations and animations (camera moves, blocks opening, lines drawing in, stepped narration) catch the eye and guide attention |
| **mndmap's role** | build, try and refine these cards and components; make them portable (any static site) and configurable |
| **mndsite's role** | a static shell that hosts and views them; it gains no mndmap features |
| **mndflow's role** | the design language; mndmap iterates on its motion, and what works goes back to it |
| **goal** | one idea that works across many kinds of documentation, not only system overviews |


## Where it stands

| Proven | How |
|---|---|
| a page's headings make a deck | `#` the root, `##` / `###` its parts, a section's first paragraph its meaning, in-page links its relationships |
| one card at a time, opening in place | only the focus and what holds it are open; layouts animate into each other while the camera flies |
| it travels | each deck is one self-contained page, framed into mndsite with no change to mndsite, themed with the host |
| it still reads without the motion | the page's text stays below the deck; a still poster stands in without script |

| Learned | |
|---|---|
| content shape matters | the mndsite About page needed rewriting into system blocks before it made a good deck; why, and what to do about it, is the first question in the plan |
| attention needs restraint | lines are quiet until they touch the focus, labels only on lit lines, unrelated cards fade back |

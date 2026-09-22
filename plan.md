---
name: Document grid layout
overview: Place each document as a lattice of blocks on free layers, tables as grid holders, and show every one of those blocks in the explorer. Free and grid stay the only mndflow arrangements.
---

# Document grid layout

Free and grid stay the only arrangements. A row or a column is `x`/`y` on a free layer. A markdown table stays a grid holder, seated by cell. Every block on the diagram is also a row in the explorer.

## Current state

`organizationGraph` in [src/ui/project.ts](src/ui/project.ts) keeps sets and pages only. [src/ui/App.tsx](src/ui/App.tsx) gives that graph to `Explorer`. `viewingGraph` is what `Viewer` draws: the same sets and pages, plus each page's content.

`contentGraph` already hoists a lone H1, deletes free list-groups (the kit draws them empty), names body-only cards from their first line, and calls `stack_layers`, which writes `x: 0` and a stepping `y` for every loose content block. Sets and pages are skipped, so the landing layer stays the horizontal row free uses when nothing has coordinates. The card stride is 144 by 72 (`CARD` 120×48, `GAP` 24).

`viewingGraph` drops every edge. Requirement links are in the held graph and are not on the canvas.

The explorer walks `parent` and skips references (`of` is set), notes, and holders. Grouped cells are still blocks, so they appear if their parent is in the graph. `open` highlights the row whose id is the open layer. Reveal in `act` looks up the parent in the organization graph, so a content id never resolves.

Tests in [test/project.test.ts](test/project.test.ts) assert that sections and items are absent from `organizationGraph`. The driver skill requires explorer rows to be sets and pages only.

Edits apply to the held graph. `create` already refuses a parent that is not in that graph. A projection-only id therefore cannot become a folder.

## Goal shape

One projection, `viewingGraph`, feeds both the canvas and the explorer. Parents in that projection are the tree.

```
docs                          workspace row
  guide                       folder, no coordinates
    Detail                    page, no coordinates
      …                       its sections and bodies
  Map fixture                 page, no coordinates
    Lists                     section, column 0
    Lists                     body, column 1, the row that expands
      first member            child of the body
      second member
      third member
    Tables
    Tables                    body
      Construct               cell blocks, children of the body
      Target
      …
```

On the page layer the two Lists blocks share a `y`, the body is 144px to the right, and a line joins them. Opening the body shows its children on the next lattice. The held graph, read, and emit do not gain body blocks.

A link target that lives on another page is an ordinary block in this projection (no `of`), so the explorer does not drop it. The edge is drawn to that stand-in.

## 1. Lattice placer

In [src/ui/project.ts](src/ui/project.ts), replace `stack_layers` with `placeLattice`.

Stride stays `CARD.w + GAP` and `CARD.h + GAP`. Every loose content block gets both coordinates. A loose block is what `stack_layers` already selects: not the page or a set, not seated in a holder (`group` set), parent is the layer being placed.

Runs stack downward. Inside a run, slots are row-major. The next run starts below the run's real height, so a grid holder's `rows * CELL.h` is used instead of one card stride.

Rules, in source order:

- Page prose, when the page block has a body, becomes one card on row 0, column 0. Id `prose:${pageId}`. It is a projection block.
- Each section is column 0 of the next row.
- A section whose kept children are non-empty also gets a body block on column 1 of that same row. Id `body:${sectionId}`. The body exists only in the projection. Its type is `doc.item` and its name is the heading. Children move from the section to the body inside the projection only.
- Nested sections inside a body use the same two-column rule.
- A grid holder is one slot. Its cells keep `{r, c}` and receive no `x`/`y`.
- Peer leaves (items, tasks, fences) under a body: one column when there are three or fewer; otherwise `min(4, ceil(sqrt(n)))` columns, left to right, then down.
- Requirement records under a body: one row per record. Column 0 is the record. Each off-layer link target is the next column.

Sets and pages are still not given coordinates.

## 2. Edges

`viewingGraph` copies an edge when both ends are blocks in the projection.

For each section that received a body, add `contains:${sectionId}` from the section to the body, `dir: "forward"`, type `doc.link`.

For a requirement edge whose target is not a block on that body layer, add `stand:${edgeId}`: an ordinary block, no `of`, name taken from the target, parent the body, placed in the requirement's row. Retarget the copied edge's far end to the stand-in. A target that is already on the layer keeps the real end.

`doc.link` is already in the vocabulary. No new definition.

## 3. Explorer

In [src/ui/App.tsx](src/ui/App.tsx):

- `Explorer` `graph={view}`.
- `open={layer}` so the highlighted row is the layer on the canvas.
- `picked` filters with `view.blocks`, not `org.blocks`.
- Reveal looks up `view.blocks[id].parent`, sets `layer` to that parent, and sets `picked` to the row. That shows the card on its layer.
- Drop every ancestor of `layer` from `folded`, so the path to the open layer is expanded.
- `organizationGraph` stays for the workspace root check (`atRoot`, `WorkspacePanel`). It is no longer the tree.

Rename, move, and delete already no-op or fault when the id is missing from the held graph. In `act`, if the id is a `body:` or `stand:` or `prose:` id, do not call `edit`. Rename and delete of a real section, item, or page still apply to the held graph. Create already fails for a missing parent; leave that.

Double-click on the canvas already calls `enter_card` and opens a block that has children. The body is that block. The section card has no children in the projection, so double-click does not open it.

## 4. Free fill in mndflow

In `packages/views/src/arrange.ts` in the mndflow repo, `free()`:

- No coordinates on the layer: keep today's horizontal row.
- Some coordinates present: each block without coordinates takes the next open slot. A shared `x` means the next slot is below the column. A shared `y` means the next slot is to the right of the row. A rectangle fills row-major. Snap to the lattice. Do not move a block that already has coordinates.
- `grid` packing is unchanged.

mndmap's projection writes every content coordinate, so this path is for a block added afterward on a layer that is already a lattice.

## 5. Tests and the driver

[test/project.test.ts](test/project.test.ts):

- `organizationGraph` stays sets and pages only. Those tests stay.
- `viewingGraph` on the tiny fixture: after hoist, the page's direct children are the section and `body:sec:1` at the same `y`, body `x` is one stride to the right, the item and the code are children of the body, and `contains:sec:1` joins them.
- A three-item list is one column under its body. A grid holder still has `rows`, `cols`, and cells, and those cells have no `x`/`y`.
- A requirement edge whose target is another page produces a stand-in on the body layer and an edge to it.
- Sets and pages in `viewingGraph` still have no `x`/`y`.

[.claude/skills/run-mndmap/SKILL.md](.claude/skills/run-mndmap/SKILL.md): the `rows` check lists sets, pages, and the content blocks under the open page. A row for a section or an item is expected.

## 6. Browser, on the samples

Dev server, `?file=/samples/map.json` and `?file=/samples/req.json`.

- Explorer lists `guide`, `Detail`, `Map fixture`, and under `Map fixture` a row for each section and a row for each body. Expanding a body lists its members.
- Canvas root is still one horizontal row.
- Opening `Map fixture` shows two columns: section, line, body. The next section is the next row.
- Opening a body from the tree (click the body row) shows the same layer as opening it from the canvas.
- Lists members are a column, in order, with names. Tables is a grid holder whose cells are rows under that body. Fences is the snippet card.
- Requirements shows `R-1` and `R-2` each on a row, with a stand-in and a line in the columns beside them. Those stand-ins are rows in the tree.
- Rename of a section from the tree still renames the held section and survives undo. Rename of a body row does nothing.

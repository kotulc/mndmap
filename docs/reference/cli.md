---
title: CLI
description: mndmap build and mndmap check
---

# CLI

## build

```
mndmap build <content> [--out build] [--mode static|interactive] [--strict]
```

Copies `content` to `out` with every diagram drawn, and writes the diagram pages and gallery under `out/_assets/mndmap/`. `out` is replaced on each build; mndmap refuses a folder it did not write, or one inside `content`.

Prints one line per diagram, then each fence left as written and each broken link:

```
  deck interactive about.md:16       about-1  17 cards
  flow static      guide.md:22        guide-1  4 links
  map  static      index.md:14        index-1
  skip index.md:40: sequence is drawn by the site
  ! about.md:22 node c: no page "guide/missing"
22 pages, 3 diagrams, 1 broken link → build
```

## check

```
mndmap check <content>
```

Reads and reports as `build` does, writes nothing, and exits 1 on any broken link.

## Flags

| Flag | Setting |
|---|---|
| `--out <dir>` | `out` |
| `--mode static\|interactive` | `mode` |
| `--urls directory\|html` | `urls` |
| `--base <path>` | `base` |
| `--assets <dir>` | `assets` |
| `--title <name>` | `title` |
| `--dark retro\|modern` | `dark` |
| `--exclude <path>` | `exclude`, once per path |
| `--strict` | `strict` |
| `--cards` | `cards` |
| `--config <file>` | the settings file; `mndmap.yaml` in the working folder when there is one |

Each flag overrides the same key in the settings file: see [configuration](config.md).

---
title: Payload handling
---

# Payload handling

The first traceability corpus: one table of requirements, and the links out of it.

## Requirements

| id | shall | method | satisfies | verifies |
| --- | --- | --- | --- | --- |
| R-1 | The reader shall accept MDX. | test | [Parser](design.md) | [Suite](tests.md) |
| R-2 | The emitter shall not write to the source. | inspection | [Emitter](design.md) | [Suite](tests.md) |

## Notes

This table stays a table.

| Left | Right |
| --- | --- |
| a | b |

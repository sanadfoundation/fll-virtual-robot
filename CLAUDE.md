# CLAUDE.md

PyScript requires serving over HTTP — no build step, deps load from CDN.
See [docs/development.md](docs/development.md) for server startup and test commands.

## Architecture

Dual execution paths: Python via PyScript worker → postMessage bridge; Blockly generators call `window.sim` directly.
See [docs/architecture.md](docs/architecture.md) for key files and path details.

## Constraints

Critical gotchas that silently break things — read before touching the simulator or Blockly.
See [docs/constraints.md](docs/constraints.md).

## Field

2362 × 1143 mm, math y-up coordinates, robot spawns at `(350, 163)` heading north.
See [docs/field.md](docs/field.md).

## Extending

- [Adding a Spike API method or Blockly block](docs/extending.md)
- [My Blocks (Scratch procedures)](docs/myblocks.md)

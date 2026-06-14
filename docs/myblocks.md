# My Blocks (Scratch procedures)

## Files

| File | Purpose |
|------|---------|
| `js/myblocks_proccode.js` | proccode↔argspec parser/emitter (pure, Node-testable) |
| `js/myblocks_blocks.js` | Block defs, UI builders (`applyArgspecToDefinition/Call`), `syncCallsToDefinition` |
| `js/myblocks_modal.js` | `createModalState()` (pure controller) + `openMyBlocksModal(Blockly)` (DOM shell) |
| `css/myblocks.css` | Modal styling |
| `js/llsp3_blocks.js` | LLSP3 round-trip: `buildMyBlocks*`, `emitMyBlocks*`, `findProtoFor`, `argspecFromProto`, `buildProccodeIndex` |

The `_registerSpikeMyBlocksFlyout` callback (in `blockly_config.js`) wires the `MY_BLOCKS` toolbox category and the `CREATE_SPIKE_MYBLOCK` button → opens modal → instantiates definition on workspace.

## Tests

- `tests/js/myblocks/` — pure helpers, generators, modal state, flyout callback
- `tests/js/llsp3/myblocks.test.js` — round-trip against `tests/fixtures/llsp3/myblocks-project.llsp3`

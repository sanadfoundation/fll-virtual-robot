# Extending the simulator

## Adding a Spike API method

1. Add the method to the appropriate class in `py/spike_bridge.py`, returning `_bridge_call({'type': 'your_type', ...})`.
2. Add a `case` in `_execCmd()` in `js/simulator.js`.
3. Add an entry to `SPIKE_API` in `js/monaco_config.js` with `sig`, `doc`, and `params`.

## Adding a Blockly block

1. Add a JSON definition to `SPIKE_BLOCKS` in `js/blockly_config.js`.
2. Add a generator in `registerGenerators()`. Use the appropriate entry points:
   - Pair-based motion: `await window.sim._runPairMotion(_movePairL, _movePairR, leftV, rightV, distMM)`
   - Single motor: `await window.sim._animateSingleMotor(port, velocity, distMM)`
   - Stop: `await window.sim._motorStopAndAwait(port)` or `_pairStopAndAwait()`
3. Place the block in the appropriate `TOOLBOX_XML` category.

# Physics and motion model

## Linear speed

`MM_PER_MS_100` in `js/simulator.js` (and `_MM_PER_MS_AT_100` in `js/blockly_config.js`) is derived as:

```
MM_PER_MS_100 = π × WHEEL_DIA_MM / 360
```

This ensures a velocity command of 1000 deg/sec yields physically honest linear motion. Don't replace the derivation with a hardcoded number — it must track wheel diameter.

## Wheel diameter

Default `WHEEL_DIA_MM = 56` (Spike "small" / Technic 56×28 mm, LEGO part 32019).

The kit also ships an 88×26 mm balloon wheel (LEGO part 49295). To switch:

1. Set `WHEEL_DIA_MM = 88, WHEEL_WIDTH_MM = 26` in `js/simulator.js`
2. Set `_WHEEL_DIA_MM = 88` in `js/blockly_config.js`

Everything downstream (linear speed, deg↔mm conversions, wheel visual in `_drawRobot`, Blockly `_moveRotMM` preamble) derives from those constants. With 88 mm wheels, full-speed linear motion is ~768 mm/s instead of ~488 mm/s.

## Steering

`> 0` = right turn = left wheel faster:

```
lv = spd × (1 + steer)
rv = spd × (1 - steer)
```

Same convention in `_execCmd('move')`, Blockly generators, and the `motor_pair.move` docstring.

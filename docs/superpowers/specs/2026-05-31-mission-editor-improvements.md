# Mission Editor Improvements — Design Spec

Date: 2026-05-31

## Overview

Five targeted improvements to the mission editor and condition system:

1. Zone labels (text identifier separate from color)
2. Resize handle moved to bottom-right corner
3. Shift-constrained line drawing (horizontal/vertical snap)
4. More space for the condition editor
5. Unified adaptive sensor condition block

---

## 1. Zone Labels

### What

Zones gain an optional `label` field (string). The mission also gains an optional top-level `show_zone_labels: boolean` (default `false`) that controls whether labels are rendered during play.

### Schema changes

```
zone object: { id, shape, x, y, w, h, color, label? }
mission JSON: { ..., show_zone_labels?: boolean }
```

### Editor (inspector)

The zone inspector panel gets a "Label" text input field, identical in structure to the existing obstacle label input. Wired to a new `setZoneLabel(state, id, label)` state function.

### SVG render (editor overlay)

When `z.label` is set, render a `<text>` element at the zone center — flipped upright using `translate(0, 2*cy) scale(1,-1)` (same technique as obstacle labels). Class: `editor-zone-label`. Always visible in the editor regardless of `show_zone_labels`.

### Runtime (play mode)

Zones are rendered via `mission_field_swap.js → zoneToFieldObject`, which produces field objects consumed by the simulator's canvas drawing code (`_drawField` in `simulator.js`).

1. `zoneToFieldObject(zone)` gains a `label` property (passed through from `zone.label` if set).
2. `applyMissionField` receives a new boolean parameter `showLabels` (from `mission.show_zone_labels`), which it stores on each zone field object: `label: showLabels ? (zone.label || '') : ''`.
3. The simulator's `_drawField` section that renders `type: 'rect'` objects: if `obj.label` is non-empty, draw centered text over the zone rectangle.

### Condition dropdown

`zoneOptions(state)` returns `"<label> (<color>)"` when `z.label` is set and non-empty, else falls back to `"<color>"` as today.

### State function

```js
function setZoneLabel(state, id, label) {
  const next = dirty(state);
  const z = next.field.zones.find(z => z.id === id);
  if (z) z.label = label;
  return next;
}
```

Exposed on `editor.state`.

---

## 2. Resize Handle → Bottom-Right

### Current behavior

The resize handle circle sits at the math top-right corner of the selected object, which renders as the visual **top-right** on screen (math y-up: high y = top of screen).

### Target behavior

Move the handle to the visual **bottom-right** on screen = math bottom-right = `(x_max, y_min)`.

### Coordinate changes (render)

| Object type | Handle position (math coords) |
|---|---|
| Zone / Wall | `(z.x + z.w, z.y)` |
| Obstacle | `(o.x + o.w/2, o.y - o.h/2)` |

### Resize logic changes (`resizeToPoint`)

The fixed anchor flips from bottom-left to **top-left**:

**Zones / Walls** (TL-anchored, stored as bottom-left corner):

```js
const topY = z.y + z.h;          // fixed top edge
const newW = Math.max(20, point.x - z.x);
const newH = Math.max(20, topY - point.y);
const newY = topY - newH;         // new bottom edge
// moveZone(id, { x: z.x, y: newY })
// resizeZone(id, { w: newW, h: newH })
```

**Obstacles** (center-anchored):

```js
const leftX = o.x - o.w / 2;     // fixed left edge
const topY  = o.y + o.h / 2;     // fixed top edge
const newW  = Math.max(20, point.x - leftX);
const newH  = Math.max(20, topY - point.y);
// moveObstacle(id, { x: leftX + newW/2, y: topY - newH/2 })
// resizeObstacle(id, { w: newW, h: newH })
```

### Cursor

Update `.editor-resize-handle` CSS cursor from `nwse-resize` to `nesw-resize` (bottom-right handle convention).

---

## 3. Shift-Constrained Line Drawing

### Behavior

When the user holds Shift while drawing a line, the endpoint snaps to the nearest axis:
- If `|dx| >= |dy|`: constrain to horizontal (`y2 = y1`)
- If `|dy| > |dx|`: constrain to vertical (`x2 = x1`)

where `dx = x2 - x1`, `dy = y2 - y1`.

### Implementation

In `mission_editor_field.js`:

**`pointermove` handler** (inside `if (drawingLine)` branch): after computing `px` and `y2`, apply:

```js
if (ev.shiftKey) {
  const dx = Math.abs(px - drawingLine.x1);
  const dy = Math.abs(y2 - drawingLine.y1);
  if (dx >= dy) y2 = drawingLine.y1;
  else          px = drawingLine.x1;
}
```

**`pointerup` handler** (inside `if (drawingLine)` branch): apply same constraint before committing.

No state changes needed. The preview line's SVG attributes reflect the snap in real time.

---

## 4. Condition Editor Space

### Chosen approach: Full panel takeover (Option B)

When a step is selected for condition editing, the right panel enters **condition mode**: meta and steps sections are `hidden` (not just collapsed), the condition section expands to fill all available panel space, and a "← Back" button appears in the condition section header.

### CSS

```css
.editor-right-panel.condition-mode .editor-meta-section,
.editor-right-panel.condition-mode .editor-steps-section,
.editor-right-panel.condition-mode .editor-inspector-section {
  display: none;
}

.editor-right-panel.condition-mode .editor-cond-workspace {
  height: calc(100vh - 120px);
  min-height: 500px;
  margin: 0 8px;
}

.editor-right-panel.condition-mode {
  flex: 0 0 620px;
  max-width: 620px;
  min-width: 580px;
}
```

(The `has-condition-open` class and its rules are kept for now but superseded by `condition-mode`; remove `has-condition-open` once `condition-mode` is verified.)

### Back button

Added to the `#editor-cond-section` `<h4>` in `index.html`:

```html
<div class="editor-cond-header">
  <button class="btn btn-mini" id="btn-cond-back" type="button">← Back</button>
  <span>Condition</span>
</div>
```

Clicking it deselects the current step: `app.setEditorState(MISSIONS.editor.state.setSelection(app.editorState, null))`.

### JS

In `showForStep`: add `panel.classList.add('condition-mode')`.
In `hide`: remove `condition-mode`, restore meta and steps sections to visible.

---

## 5. Unified Adaptive Sensor Block

### Goal

Replace the two separate blocks (`cond_sensor` for D/E numeric and `cond_sensor_color` for C) with one `cond_sensor` block that adapts its fields based on the selected port.

### Block definition

`cond_sensor` is **not** defined via `defineBlocksWithJsonArray` (the JSON API gives no way to name dummy inputs, which are needed for `getInput('VAL_NUM')` and `getInput('VAL_COLOR')` to work). Instead it is registered via the JavaScript API inside `ensureBlockDefs`:

```js
if (Blockly && Blockly.Blocks && !Blockly.Blocks['cond_sensor']) {
  const COLOR_OPTIONS = [
    ['red','red'],['green','green'],['blue','blue'],['yellow','yellow'],
    ['orange','orange'],['purple','purple'],['black','black'],['white','white'],['none','none'],
  ];
  const ALL_OPS = [['==','=='],['!=','!='],['<','<'],['<=','<='],['>','>'],['>=','>=']];
  Blockly.Blocks['cond_sensor'] = {
    init() {
      this.appendDummyInput()
          .appendField('sensor')
          .appendField(new Blockly.FieldDropdown([
            ['Color (C)','C'], ['Distance (D)','D'], ['Force (E)','E'],
          ]), 'PORT')
          .appendField(new Blockly.FieldDropdown(ALL_OPS), 'OP');
      this.appendDummyInput('VAL_NUM')
          .appendField(new Blockly.FieldTextInput('0'), 'VALUE_NUM');
      this.appendDummyInput('VAL_COLOR')
          .appendField(new Blockly.FieldDropdown(COLOR_OPTIONS), 'VALUE_COLOR');
      this.setInputsInline(true);
      this.setOutput(true, 'Boolean');
      this.setColour(210);
      _adaptSensorBlock.call(this);
    },
  };
}
```

`cond_sensor_color` block definition is removed from `BLOCK_DEFS` and from the toolbox.

### Extension / onChange handler

`_adaptSensorBlock` is a plain function (not a registered extension since we're using the `init()` pattern):

```js
function _adaptSensorBlock() {
  const port = this.getFieldValue('PORT');
  const isColor = port === 'C';
  const EQ_OPS  = [['==','=='],['!=','!=']];
  const ALL_OPS = [['==','=='],['!=','!='],['<','<'],['<=','<='],['>','>'],['>=','>=']];
  const opField = this.getField('OP');
  if (opField) {
    opField.menuGenerator_ = isColor ? EQ_OPS : ALL_OPS;
    const cur = opField.getValue();
    if (!(isColor ? EQ_OPS : ALL_OPS).some(o => o[1] === cur)) {
      opField.setValue(isColor ? '==' : '==');
    }
  }
  const numInput   = this.getInput('VAL_NUM');
  const colorInput = this.getInput('VAL_COLOR');
  if (numInput)   numInput.setVisible(!isColor);
  if (colorInput) colorInput.setVisible(isColor);
}
```

Called from `init()` and from a `setOnChange` listener watching `BLOCK_CHANGE` events where `event.name === 'PORT'`.

### `blockToCondition` update

```js
case 'cond_sensor': {
  const port = fieldOf(b, 'PORT');
  const op   = fieldOf(b, 'OP');
  if (port === 'C') {
    return { kind: 'sensor', port: 'C', op, value: fieldOf(b, 'VALUE_COLOR') };
  }
  const raw   = fieldOf(b, 'VALUE_NUM');
  const asNum = Number(raw);
  return { kind: 'sensor', port, op,
    value: Number.isNaN(asNum) || raw === '' ? raw : asNum };
}
case 'cond_sensor_color':  // backward compat guard, can be removed later
  return { kind: 'sensor', port: 'C', op: fieldOf(b, 'OP'), value: fieldOf(b, 'VALUE') };
```

### `conditionToBlockState` update

```js
case 'sensor': {
  const isColor = c.port === 'C' && typeof c.value === 'string';
  return {
    type: 'cond_sensor',
    fields: {
      PORT:        c.port,
      OP:          c.op,
      VALUE_NUM:   isColor ? '0' : String(c.value),
      VALUE_COLOR: isColor ? c.value : 'red',
    },
  };
}
```

### Toolbox

Remove `cond_sensor_color` entry. Keep one `{ kind: 'block', type: 'cond_sensor' }` under the Sensor label.

### Backward compatibility

- Saved mission JSON uses `{ kind: 'sensor', port, op, value }` — unchanged, no migration.
- Old Blockly workspace state referencing `cond_sensor_color` is never persisted (workspace is rebuilt from condition JSON on every load), so no stale workspace state exists.

---

## Files affected

| File | Changes |
|---|---|
| `js/mission_editor_state.js` | Add `setZoneLabel`; export on `editor.state` |
| `js/mission_editor_inspector.js` | Add label field to `renderZoneInspector` |
| `js/mission_editor_meta.js` | Add `show_zone_labels` toggle (mission-level setting) |
| `js/mission_editor_field.js` | Zone SVG label render; resize handle position + logic; shift-constrain lines |
| `js/mission_editor_conditions.js` | Unify sensor block (JS init pattern); update `blockToCondition` + `conditionToBlockState`; update toolbox |
| `js/mission_field_swap.js` | Pass `label` through `zoneToFieldObject`; propagate `showLabels` flag |
| `js/simulator.js` | Render zone label text when field object has a non-empty `label` |
| `css/mission_editor.css` | `condition-mode` rules; `.editor-zone-label` style; resize handle cursor update |
| `index.html` | Back button in condition section header; `show_zone_labels` toggle in meta section |

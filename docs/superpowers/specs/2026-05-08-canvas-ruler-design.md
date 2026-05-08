# Canvas Ruler & Hover Position Readout — Design

**Date:** 2026-05-08
**Backlog item:** `BACKLOG.md` → Debugging & Observation → "Field rulers"

## Problem

The simulator canvas already draws a faint 100 mm grid, but no numeric labels. Students writing programs that translate motor commands into mat distance — e.g. checking that "1 rotation ≈ 176 mm" actually carries the robot the expected amount — currently have to alt-tab to the Hub panel for X / Y readouts, or count gridlines and multiply by 100 in their head. A visible ruler closes the gap between the canvas (where the robot is) and the numbers (which live in the side panel), which is the right place for a calibration / verification aid.

## Goals

- Render mm tick marks and labels along the X and Y axes of the canvas so users can read robot position visually without checking the Hub panel.
- Let users read off the coordinates of any point on the mat (e.g. a mission target) by hovering the cursor.
- Stay inside the existing render path: no new dependencies, no build step, no canvas-rendering refactor.
- Survive every layout change the canvas already handles (window resize, hub-panel collapse, light/dark theme).

## Non-goals

- Click-drag distance measure tool (Δx / Δy / hypotenuse). Useful but separate; tracked as a follow-up backlog item.
- Per-axis unit toggle (cm / inches). The Hub panel is the place to change unit display; the ruler is a fixed mm reference because mm is the simulator's internal unit and the unit the wheel-circumference math falls out in.
- Restyling or darkening the existing 100 mm grid. The ruler adds information at the edges; the grid stays as-is.
- A scale indicator (e.g. "100 mm" segment legend) — redundant once labels exist.

## Background: how distance maps to motor commands

For context (and to anchor the calibration intent of this feature), the simulator's distance model lives in `js/simulator.js:22–31`:

- `WHEEL_DIA_MM = 56` (Spike Prime stock medium wheels), so `WHEEL_CIRC_MM = π × 56 ≈ 175.93 mm`.
- Finite moves (`motor_pair.move(...)`, `motor.run_for_degrees(...)`, etc.) translate the user's `degrees` / `rotations` / `cm` / `inches` argument to mm via `_amountToMM` and drive *exactly* that mm distance. Speed only changes duration, not distance.
- Time-based / continuous moves (`run_for_time`, `start`, `start_tank`) compute distance as `velocity × MM_PER_MS_100 × time_ms`, where `MM_PER_MS_100 = 0.9` (i.e. 900 mm/s at 100% velocity) is a tuning constant, not derived from a motor RPM spec.

A mm ruler on the canvas lets students verify both paths against the published numbers (and against each other).

## Architecture

Two pieces, both small.

### 1. Canvas-rendered ruler (`js/simulator.js`)

A new method `_drawRuler(ctx, s)` invoked from `_draw()`:

```
_draw():
  clearRect → _drawField → _drawRuler → _drawTrail → _drawRobot → _updateSensorPanel
```

Order matters: the ruler sits **over** field objects (so labels stay legible across the HOME zone and mission rects) but **under** trail and robot (so neither gets occluded by tick marks or label pills).

Tick spec:

| Class | Spacing | Length | Stroke |
|---|---|---|---|
| Major | 200 mm | 9 px | `#333` |
| Minor | 100 mm | 5 px | `#555` |

Top edge: ticks descend from `y = 0` into the field. Left edge: ticks extend right from `x = 0`. Tick coordinates use the existing `this._scale` (mm → px) so the ruler tracks every resize automatically.

Label spec:

- `9px ui-monospace, monospace`, dark gray text.
- Background: a translucent cream pill (`rgba(240, 232, 208, 0.85)` — same family as the field, so it disappears into the bare mat and just provides contrast over field objects).
- Top labels: ~11 px below the top edge, horizontally centered on the major tick.
- Left labels: ~11 px right of the left edge, vertically centered on the major tick.
- Numeric only (no `mm` suffix per tick — too noisy at this density).

Origin marker:

- A single `0,0 mm` in the top-left corner of the field, ~6 px in from each edge, in the same pill style. This anchors the unit once so per-tick labels can stay numeric.

### 2. Hover position readout (`#canvas-hover` overlay)

A small absolute-positioned `<div>` placed inside `.canvas-wrap`:

```html
<div id="canvas-hover" hidden></div>
```

Behavior:

- Hidden by default (`hidden` attribute).
- Two listeners attached in `RobotSimulator`'s constructor (next to the existing `resize` listener), targeting the canvas:
  - `mousemove`: convert `event.clientX/Y` minus the canvas bounding rect to mm via `/ this._scale`, round to integer mm, write into the overlay as `x=<n> mm  y=<n> mm`, position it near the cursor with an offset, unhide.
  - `mouseleave`: re-hide.
- Edge handling: if the cursor is within ~120 px of the canvas's right or bottom edge, the overlay flips to the opposite side of the cursor so it never clips out of view.

Styling lives in `css/style.css` as `#canvas-hover { ... }`. Uses the existing theme custom properties — `--surface2` (background), `--text` (foreground), `--border2` (1 px outline), `--font-code` (matches the rest of the canvas-side numerics) — so light and dark themes both look right without theme-specific code in the listeners.

## Data flow

There isn't really any. The ruler is stateless — it reads `this._scale`, `FIELD_W_MM`, and `FIELD_H_MM` and emits ticks. The hover overlay reads cursor position and `this._scale`. No persistence, no message passing, no interaction with the Python worker.

The ruler does *not* respect the `_dirty` flag any differently than other field elements — it's part of `_draw`, and `_draw` already only runs when `_dirty` is set. (Hovering does not mark the canvas dirty; the overlay is a DOM node that updates independently.)

## Edge cases

| Case | Behavior |
|---|---|
| Window resize | `_resize()` recomputes `_scale`, next `_draw` redraws ruler at new pitch. Already covered. |
| Hub-panel collapse / expand | Triggers a layout change → `_resize` fires via the existing `resize` listener flow. Same path. |
| Theme toggle (light ↔ dark) | Field stays cream in both themes; ruler ticks and labels are fixed-tone and remain legible. Hover overlay restyles via CSS variables. |
| Very small canvas (sub-300 px wide) | Minor ticks at 100 mm × scale start to crowd. Acceptable for v1 — the simulator is already cramped at that size, and labels at 200 mm pitch still read. No threshold logic. |
| Cursor at exact canvas edge | `mouseleave` fires, overlay hides. |
| Cursor leaves window with mouse button held | Same — `mouseleave` covers it. |
| Touch devices | Hover does nothing on pure-touch devices (no `mousemove` events), but the static ruler still renders. Acceptable; the simulator is keyboard-and-mouse-first. |

## Testing

### Unit (existing `node:test` harness in `tests/js/`)

The renderer is canvas-API-heavy and not productively unit-tested as a whole, but two pure helpers can and should be extracted and tested:

- `rulerTickPositions(fieldMM, majorPitch, minorPitch) → { major: number[], minor: number[] }` — returns the mm offsets for ticks along one axis. Tests cover:
  - 2362 mm × 200/100 mm pitch → expected major and minor arrays, no duplicates at 200 mm boundaries (a position that's both major and minor counts only as major).
  - 1143 mm × 200/100 mm pitch → same shape, ends within bounds.
  - Pitch larger than field → only `0` returned for major; minors empty.
- `clientToMM(clientX, clientY, rect, scale) → { x, y }` — pure conversion used by the hover overlay. Tests cover origin (top-left), bottom-right, midpoint, and a sanity check that scale = 0.5 halves the result.

### Manual smoke

1. Run `python3 -m http.server 8787` and open the page. Confirm:
   - Ticks visible along top and left edges, majors longer than minors.
   - Labels: `200, 400, 600, … 2200` across the top, `200, 400, 600, 800, 1000` down the left.
   - `0,0 mm` marker in the top-left corner.
2. Hover the canvas. Overlay appears near the cursor with `x=<n> mm  y=<n> mm`. Move toward the right edge — overlay flips to the left of the cursor before clipping. Move off the canvas — overlay hides.
3. Resize the window. Tick pitch and label positions track the new scale. Hover values still match the visible position.
4. Collapse the Hub panel. Canvas widens, ruler re-pitches, hover values still correct.
5. Toggle light / dark theme. Ticks and labels remain legible. Hover overlay restyles.
6. Drive the robot one rotation along +X (`motor_pair.move(1, 'rotations')` from spawn at x = 350): pose ends near x = 526 (350 + 175.93). Eyeball against the ruler to confirm.

## Open questions resolved during brainstorming

- **Placement** — three options considered: outside the canvas in the margin (Photoshop-style), ticks-and-labels just inside the field border, label-only on the existing grid. Chose **inside the field border**: most ruler-like, no layout changes, works at any canvas size.
- **Density / units** — three options considered: every 100 mm labeled, every 200 mm with 100 mm minors, every 500 mm with 100 mm minors. Chose **200 mm major / 100 mm minor**, mm only. 100 mm-everywhere is wallpaper; 500 mm forces too much eyeballing for the calibration use case.
- **Interactivity** — three options considered: static only, static + hover readout, static + hover + click-drag distance tool. Chose **static + hover**. The whole point of the ruler is direct coordinate reading; hover is the natural extension. The distance tool is a separate feature.
- **Unit display** — mm-only. Hub panel already shows cm; the ruler complements rather than mirrors it.
- **Render order** — ruler over field objects, under trail and robot, so labels stay legible over HOME / mission rects but the robot and its path are never blocked.

## File touch list

- **Modified:** `js/simulator.js` — new `_drawRuler(ctx, s)`, `mousemove` / `mouseleave` listeners in the constructor, helpers `rulerTickPositions` and `clientToMM` exported on the class (or module-scope) for tests.
- **Modified:** `index.html` — one `<div id="canvas-hover" hidden></div>` inside `.canvas-wrap`.
- **Modified:** `css/style.css` — `#canvas-hover` styles using existing theme tokens.
- **New:** `tests/js/ruler/ruler.test.js` — unit tests for `rulerTickPositions` and `clientToMM`.
- **Modified:** `BACKLOG.md` — strike the "Field rulers" line under Debugging & Observation.

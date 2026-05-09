# Units Selector — Design

**Date:** 2026-05-08
**Backlog item:** Direct user request after the canvas-ruler review pass; not previously listed.
**Builds on:** `docs/superpowers/specs/2026-05-08-canvas-ruler-design.md`

## Problem

The canvas ruler ships in mm only — that decision was deliberate at design time, but in practice the Hub panel already shows position in cm, the simulator API speaks `cm` / `inches` / `rotations`, and the audience is mixed-region. Forcing the ruler to mm makes the two readouts (Hub panel cm, ruler mm) inconsistent and makes inches-trained users do mental conversion. A single unit selector that drives every position readout (Hub panel, ruler labels, ruler origin marker, hover overlay) gets the simulator's UX coherent and matches the API surface.

This spec reverses one of the canvas-ruler spec's non-goals ("Per-axis unit toggle (cm / inches). The Hub panel is the place to switch unit display"). The Hub panel *is* still the place to switch — it's just that the switch now also drives the ruler.

## Goals

- A single Hub-panel control that selects the unit used for all position readouts on screen.
- Default to **cm** (matches the Hub panel's existing display).
- Selection persists across reloads (localStorage).
- All four readouts — Hub panel X / Y, ruler tick labels, ruler origin marker, hover overlay — re-derive from one source of truth and update together.
- Tick pitch chooses unit-friendly numbers per unit (no `7.87 in` labels).

## Non-goals

- Unit toggle for the speed control (`Speed 1x`).
- Unit toggle for `Heading` — degrees only.
- Unit toggle for distance sensor (`12.3 cm` natural unit) or motor angle (`360°`).
- Adding new unit options beyond cm / mm / inches. The simulator API already speaks these three; nothing else is on the table.
- A "scale legend" (dashed bar marked "10 cm"). The major-tick labels do that job.

## Available units

Three:

| Unit | Symbol | Source-of-truth conversion |
|---|---|---|
| Centimeters | `cm` | `mm / 10` |
| Millimeters | `mm` | `mm` |
| Inches | `in` | `mm / 25.4` |

The simulator's internal unit is and stays mm. All conversions happen at the readout boundary.

## Architecture

Two pieces.

### 1. Pure unit helpers (`js/ruler.js`)

Two new functions added to the existing UMD module, plus a fix to the existing `tickPositions`.

- `tickPitchFor(unit) → { major: number, minor: number }` — returns the mm pitches for the selected unit. Lookup table:

  | Unit | Major (mm) | Minor (mm) | Reads as |
  |---|---|---|---|
  | `cm` | 200 | 100 | `20 cm` major, `10 cm` minor |
  | `mm` | 200 | 100 | `200 mm` major, `100 mm` minor |
  | `in` | 254 | 25.4 | `10 in` major, `1 in` minor |

  cm and mm share physical pitches (200 mm / 100 mm) — switching between them is a label swap with no tick-position change. Inches gets its own pitch (10″ = 254 mm major, 1″ = 25.4 mm minor); switching to or from inches reflows the ticks.

- `formatPosition(mm, unit) → string` — formats a mm value for display. One source of truth used by every readout.

  | Unit | Decimals | Output for `mm = 980` | Output for `mm = 0` |
  |---|---|---|---|
  | `cm` | 1 | `98.0 cm` | `0.0 cm` |
  | `mm` | 0 | `980 mm` | `0 mm` |
  | `in` | 1 | `38.6 in` | `0.0 in` |

  For tick labels, callers pass the mm tick position; for hover, the cursor mm; for Hub panel, the robot's `r.x` / `r.y`. Same function, same output format.

- **`tickPositions` fix.** The existing implementation walks ticks with accumulation (`for (let p = 0; p <= fieldMM; p += pitch)`). That works for integer pitches (the original 200 / 100 case), but `minorPitch = 25.4` accumulates floating-point drift — by the 10th step `p ≈ 253.999…` instead of `254`, so the dedupe check `p % majorPitch === 0` fails to skip the overlap with the inches-major tick at 254 mm. The fix is index-based iteration plus a rounded-key Set for the dedupe:

  ```javascript
  function tickPositions(fieldMM, majorPitch, minorPitch) {
    const major = [];
    for (let i = 0; i * majorPitch <= fieldMM + 1e-9; i++) {
      major.push(i * majorPitch);
    }
    const minor = [];
    if (minorPitch > 0 && minorPitch < majorPitch) {
      const majorKeys = new Set(major.map(p => Math.round(p * 1000)));
      for (let i = 1; i * minorPitch <= fieldMM + 1e-9; i++) {
        const p = i * minorPitch;
        if (majorKeys.has(Math.round(p * 1000))) continue;
        minor.push(p);
      }
    }
    return { major, minor };
  }
  ```

  - Index-based loop (`i * pitch`, not `p += pitch`) avoids drift accumulation across iterations.
  - The `+ 1e-9` tolerance covers a rounding case where `i * pitch` is fractionally above `fieldMM` due to representation error.
  - The dedupe Set uses `Math.round(p * 1000)` (1 µm precision) so two values that should be equal but differ by a few ULPs collapse to the same key. Rounding to 1 µm is far below any physically meaningful tick precision and well above the FP noise floor for these magnitudes.
  - Existing tests (integer pitches) pass unchanged. New inches-pitch tests cover the float case.

### 2. Selector control

A native `<select>` in the Hub panel's Position section header. Markup:

```html
<div class="hub-section position-section">
  <div class="position-header">
    <h3>Position</h3>
    <select id="units-select" class="units-select">
      <option value="cm">cm</option>
      <option value="mm">mm</option>
      <option value="in">in</option>
    </select>
  </div>
  ...
</div>
```

The `position-header` is a flex row: title on the left, dropdown on the right. The `<h3>` keeps its existing styling — only the row wrapper is new.

CSS for `.units-select`:

```css
.position-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.units-select {
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border2);
  font: 11px var(--font-code);
  padding: 2px 4px;
  border-radius: 3px;
}
```

Native browser chrome handles the open list. The closed state matches the rest of the Hub panel's chrome.

### 3. State location

- `RobotSimulator.units` — the current unit (`'cm' | 'mm' | 'in'`). Initialized in the constructor to `'cm'`. The localStorage read happens in `js/main.js` (the boundary where unvalidated user data enters), which validates and then calls `setUnits`.
- `RobotSimulator.setUnits(unit)` — single setter. Writes `this.units`, marks `_dirty = true`, returns nothing. Trusts its caller (only called from `js/main.js`, which has already validated).
- `localStorage['fll-vr-units']` — persisted value. Read on load, written on every `setUnits` call.

### 4. Wiring (`js/main.js`)

On page load:

1. Read `localStorage['fll-vr-units']`. If valid (`'cm' | 'mm' | 'in'`), use it; otherwise default to `'cm'`.
2. Set `<select>.value` to that.
3. Call `sim.setUnits(value)`.

`change` listener on the `<select>`:

1. Read `event.target.value`.
2. Call `sim.setUnits(value)`.
3. Write to `localStorage['fll-vr-units']`.

The `setUnits` call covers both the canvas redraw (via `_dirty`) and the Hub panel (which re-renders every frame from `this.robot` and reads `this.units` on each render).

### 5. Render-side changes

- `_drawRuler(ctx, s)` — replace hardcoded `200, 100` with `window.ruler.tickPitchFor(this.units)`. Replace `String(mm)` label with `window.ruler.formatPosition(mm, this.units)`. Replace `'0,0 mm'` literal with a constructed origin string `\`0,0 ${this.units}\``.
- `_handleHover(event)` — replace `\`x=${Math.round(x)} mm  y=${Math.round(y)} mm\`` with `\`x=${formatPosition(x, this.units)}  y=${formatPosition(y, this.units)}\``.
- `_updateSensorPanel()` — replace existing `(r.x / 10).toFixed(1) + ' cm'` (and the same for y) with `window.ruler.formatPosition(r.x, this.units)`.

## Data flow

```
User selects unit
  └─ <select> change → sim.setUnits('mm') → localStorage write
                                 │
                                 ├─ this.units = 'mm'
                                 └─ this._dirty = true

Next frame:
  ├─ _draw → _drawRuler reads this.units → tickPitchFor + formatPosition
  └─ _updateSensorPanel reads this.units → formatPosition for X / Y

Hover:
  └─ mousemove → _handleHover reads this.units → formatPosition
```

One source of truth (`this.units`), four consumers, all read it each render. No per-readout caching.

## Edge cases

| Case | Behavior |
|---|---|
| Invalid `localStorage['fll-vr-units']` (manually edited, or future unit removed) | Validated in `js/main.js` against the allowed set; if it doesn't match, treat as missing → default to `cm`. |
| Tick pitch reflow when switching to/from inches | The next `_draw` (driven by `_dirty`) paints the new ticks. Trail / robot positions don't move; the underlying mm coordinates are unchanged. |
| Light/dark theme toggle | The `<select>` uses theme custom properties; updates automatically. |
| Decimal precision and `0` | `formatPosition(0, 'cm')` → `'0.0 cm'`. Slightly verbose at the origin marker but consistent with the rest of the readouts and matches what students see in calculator output. The origin marker text is `\`0,0 ${unit}\`` (just the unit symbol, no `0.0`) — that branch sidesteps the formatting question for the corner. |

## Testing

### Unit (existing `node:test` harness)

Two new helpers in `js/ruler.js` get unit tests appended to `tests/js/ruler/ruler.test.js`:

- `tickPitchFor`:
  - `cm` → `{ major: 200, minor: 100 }`
  - `mm` → `{ major: 200, minor: 100 }`
  - `in` → `{ major: 254, minor: 25.4 }`
- `formatPosition`:
  - `(980, 'cm')` → `'98.0 cm'`
  - `(980, 'mm')` → `'980 mm'`
  - `(980, 'in')` → `'38.6 in'`
  - `(0, 'cm')` → `'0.0 cm'`
  - `(0, 'mm')` → `'0 mm'`
  - `(25.4, 'in')` → `'1.0 in'`
- `tickPositions` (regression coverage for the float-pitch fix):
  - `(2362, 254, 25.4)` (inches case) → 10 majors `[0, 254, 508, …, 2286]` and 83 minors. Verify no minor coincides with any major (the 254 / 25.4 / 50.8 / … case is exactly the one that broke under the old accumulation-based implementation).
  - Existing four `tickPositions` tests continue to pass with the new implementation.

### Manual smoke

1. Reload page. Default unit: cm. Hub panel shows `35.0 cm` / `98.0 cm`. Ruler shows `20, 40, 60…` major labels. Origin marker reads `0,0 cm`. Hover reads `x=… cm  y=… cm`.
2. Switch to `mm`. Hub panel and hover both switch. Ruler tick positions stay the same (200 mm pitch == 20 cm pitch); labels swap to `200, 400, 600…`. Origin marker reads `0,0 mm`.
3. Switch to `in`. Tick positions reflow to 10″ major / 1″ minor. Labels read `10, 20, 30…`. Hub panel reads `13.8 in`. Origin marker reads `0,0 in`. Hover reads `… in`.
4. Reload. Last selection persists.
5. Open in two browser tabs. They run independent unit selections (no broadcast — localStorage is read on load, but cross-tab change-events are out of scope; if this matters, the user can refresh the other tab).
6. Light/dark theme toggle. Dropdown restyles.

## Open questions resolved during brainstorming

- **Unit set** — three options considered: cm + mm + inches, or cm + mm only, or cm + mm + inches + others. Chose **cm + mm + inches** to match the simulator API and the mixed-region audience.
- **Tick pitch behavior** — three options: per-unit pitch with friendly numbers, mm-pitch always with translated labels, or hide ticks in inches. Chose **per-unit pitch**. Inches-translated mm-pitch labels are decimal-ugly (`7.87, 15.75…`); hiding ticks is a cop-out.
- **Selector style** — segmented buttons vs dropdown. Chose **dropdown** for compactness in the Position section header.
- **Default unit** — cm (matches existing Hub panel display, and is the audience's primary unit).
- **State location** — `RobotSimulator.units` instead of a separate `js/units.js` module. Reason: unit is rendering state, not pure math; it lives where it's read. Pure conversions (`tickPitchFor`, `formatPosition`) stay in the ruler module where they belong.
- **Cross-tab sync** — out of scope (single-tab assumption).

## File touch list

- **Modified:** `js/ruler.js` — append `tickPitchFor`, `formatPosition`. No DOM, no canvas — pure functions only.
- **Modified:** `tests/js/ruler/ruler.test.js` — append 11 unit tests for the two new helpers.
- **Modified:** `js/simulator.js` — initialize `this.units` in the constructor (read `localStorage` once); `setUnits(unit)` method; `_drawRuler` reads `this.units` for pitch + label format + origin text; `_handleHover` reads `this.units` for hover-text format; `_updateSensorPanel` reads `this.units` for X / Y format.
- **Modified:** `index.html` — restructure the Position section to a `position-header` flex row with the `<select id="units-select">`.
- **Modified:** `css/style.css` — `.position-header` flex row; `.units-select` dropdown styling.
- **Modified:** `js/main.js` — read `localStorage['fll-vr-units']` on load, set `<select>.value`, call `sim.setUnits`. `change` listener writes back. Add `UNITS_KEY` constant alongside `THEME_KEY` etc.

# `.llsp3` Load & Save

**Date:** 2026-05-07
**Status:** Draft

## Problem

Code written in the simulator stays in the browser. Code written in the official LEGO Spike Prime app stays on the user's disk as `.llsp3` files. There is no path between them — a student who builds a working program in the simulator cannot push it to a real hub, and a student who has a working program on a real hub cannot bring it into the simulator to iterate or debug.

Goal: full bidirectional `.llsp3` round-trip for both editor modes, so files saved from the simulator open directly in the Spike app and vice versa.

## Scope

Option **A** (full bidirectional, both editor modes) was chosen after weighing four alternatives. The deciding factor: this simulator's Blockly toolbox already names every block with the Spike Scratch opcode (`flippermotor_*`, `flippermove_*`, etc.). The expensive per-block translation table that would otherwise be required has already been paid for upstream in `js/blockly_config.js`. The remaining work is structural conversion plus a small per-input shadow-block contract table.

In scope:
- Save the active editor's content as a Spike-app-compatible `.llsp3`.
- Load any `.llsp3` saved by the Spike app or by this simulator and restore it to the matching editor.
- Discriminate Python vs Word-Blocks by `manifest.type`.
- Emit a manifest the Spike app accepts on import.
- Survive round-trip through the real Spike app (verified manually).

Out of scope (v1):
- File System Access API "Save / Save As" with a stable file handle. Every Save is a download to `~/Downloads`.
- Cross-mode conversion ("save my Blocks workspace as a Python file"). User can copy the generated Python from the existing run pipeline if they want this; not promoted to a UI affordance.
- Auto-save to disk. The existing localStorage auto-save is unchanged.
- Spike Word-Blocks features the simulator does not have (variables with non-numeric initial values, custom procedures with `%b` boolean inputs, sound assets the user added). These load as best-effort with a console warning; they do not block the load.

---

## File format reference

`.llsp3` is a plain ZIP containing three root entries:

| Entry              | Python type          | Word-Blocks type     |
|--------------------|----------------------|----------------------|
| `manifest.json`    | required             | required             |
| `icon.svg`         | required             | required             |
| `projectbody.json` | required (`{"main": "<source>"}`) | absent  |
| `scratch.sb3`      | absent               | required (nested ZIP) |

### `manifest.json`

Discriminator field: `type`. Values: `"python"` or `"word-blocks"`.

Captured fields, with how we'll handle each on save:

| Field                  | Python | Word-Blocks | On simulator save                                    |
|------------------------|--------|-------------|------------------------------------------------------|
| `type`                 | yes    | yes         | derived from active editor                           |
| `appType`              | `"llsp3"` | absent   | always `"llsp3"` on Python; absent on Word-Blocks    |
| `name`                 | yes    | yes         | from header name input                               |
| `id`                   | yes    | yes         | new 12-char nanoid on first save; preserved on re-save |
| `created`              | yes    | yes         | first-save timestamp; preserved on re-save           |
| `lastsaved`            | yes    | yes         | each save                                            |
| `size`                 | yes    | yes         | always `0` (matches Spike-app sample)                |
| `slotIndex`            | yes    | yes         | preserve; default `0`                                |
| `workspaceX/Y`         | yes    | yes         | live workspace pan; Python uses fixed defaults       |
| `zoomLevel`            | yes    | yes         | live workspace zoom; Python uses `0.5`               |
| `autoDelete`           | yes    | yes         | always `false`                                       |
| `extraFiles`           | yes    | yes         | always `[]`                                          |
| `state`                | yes    | yes         | minimal stub on first save; preserve loaded value on re-save |
| `hardware`             | yes    | yes         | stub `{"flipper": {"type": "flipper"}}` on first save; preserve loaded value on re-save |
| `lastConnectedHubType` | yes    | (absent)    | always `"flipper"` on Python                         |
| `version`              | (absent) | yes (`38`) | always `38` on Word-Blocks                          |
| `showAllBlocks`        | (absent) | yes       | always `false`                                       |
| `extensions`           | (absent) | yes       | derived from sb3 opcodes used                       |

Manifest write rule: if a manifest was loaded earlier in this session, start from it; overlay the fields we own (`name`, `lastsaved`, derived `extensions`, etc.); preserve everything else verbatim. On a fresh project, start from a minimal default. This makes re-save of a Spike-app file lossless on fields we don't understand, and defensive against future Spike-app additions.

### Python `projectbody.json`

```json
{ "main": "<entire source as one UTF-8 string>" }
```

Newlines and indentation are preserved verbatim. No additional keys observed; if any are present on load, preserve them.

### Word-Blocks `scratch.sb3`

A nested ZIP containing:

| Entry                              | Purpose                                            |
|------------------------------------|----------------------------------------------------|
| `project.json`                     | Scratch 3 wire format with Spike opcodes           |
| `d41d8cd98f00b204e9800998ecf8427e.svg` | Empty-string-md5 SVG; the Scratch placeholder costume |
| `1b8b032b06360a6cf7c31d86bddd144b.wav` | "Cat Meow 1" — Scratch's default sound asset       |

Both asset files are byte-for-byte the standard Scratch defaults. We ship them as Base64 constants in a new file `js/llsp3_assets.js` so the simulator stays browser-only with no fetches at save time.

`project.json` shape:
- `targets`: `[Stage, Sprite]`. The Stage is fixed boilerplate. The Sprite (random 20-char name) carries all user blocks.
- `meta`: `{ semver: "3.0.0", vm: "0.2.0-prerelease.20200512204241", agent: "<spoofed Chrome UA>" }`. The `agent` value matters — the Spike app appears to sniff for it. We use a verbatim Chrome UA string captured from a real export.
- `extensions`: list of `flipper*` opcode prefixes used in the sb3, derived from the blocks present.
- `monitors`: always `[]`.

---

## Architecture

Six new modules, all browser-side, no build step.

```
js/
├── llsp3_io.js            # outer .llsp3 read/write; dispatches on manifest.type
├── llsp3_manifest.js      # manifest schema + sane defaults
├── llsp3_python.js        # Python project body read/write (trivial)
├── llsp3_blocks.js        # Word-Blocks: sb3 envelope + Blockly-state ⇄ sb3 converter
├── llsp3_assets.js        # base64 of Cat Meow 1 wav + empty-md5 SVG
└── llsp3_ui.js            # Open/Save buttons, name input, dirty-flag tracking, errors
```

External dependency: **JSZip 3.x** loaded from CDN in `index.html`, alongside the existing PyScript / Blockly / Monaco CDN imports.

### Data flow on Save

```
[active editor]
   │
   ├── Python tab ──► editor.getValue() ──► llsp3_python.write(code)
   │                                          │
   │                                          ├── manifest{type:"python", ...}
   │                                          └── projectbody.json
   │
   └── Blocks tab ──► Blockly.serialization.workspaces.save(ws) ──► llsp3_blocks.write(state)
                                                                     │
                                                                     ├── manifest{type:"word-blocks", ...}
                                                                     ├── sb3.project.json (structural translation)
                                                                     ├── sb3 default costume + sound assets
                                                                     └── inner ZIP, then outer ZIP

──► Blob URL ──► <a download="<name>.llsp3"> click ──► browser download
```

### Data flow on Load

```
file picker ──► JSZip ──► manifest.json
                              │
                              ├── type:"python"      ──► projectbody.json.main ──► Monaco.setValue ──► switch to Python tab
                              │
                              └── type:"word-blocks" ──► scratch.sb3 inner ZIP ──► project.json
                                                                                     │
                                                                                     └── llsp3_blocks.read(sb3) ──► Blockly serialization JSON
                                                                                                                     │
                                                                                                                     └── workspace.load() ──► switch to Blocks tab
```

After either path: update localStorage so a refresh keeps the loaded content; set the dirty flag to `false`; set the header name input from `manifest.name`.

---

## Blockly ⇄ sb3 translation

The block names already match Spike opcodes (verified in `js/blockly_config.js`: every block `type` is either `flipper*_*` or a stock Scratch opcode like `control_if`, `operator_add`). The translation is therefore **structural**, not **semantic**.

### Save direction (Blockly serialization → sb3)

For each block in the workspace's serialization JSON:
1. Create a sb3 entry keyed by a fresh 20-char id.
2. Copy `type` to `opcode`.
3. Convert each input from Blockly's `{block: {...}, shadow: {...}}` shape to Scratch's `[N, blockId, shadowId]` triple. The integer `N` follows the Scratch contract: `1` = shadow only, `2` = block only, `3` = block-with-shadow.
4. Convert each field from Blockly's `{<name>: <value>}` to Scratch's `{<name>: [<value>, null]}`.
5. Wire `next` and `parent` from Blockly's `next.block.id` linkage.
6. For numeric value-inputs that have no inner block (just a typed-in number), emit a `[1, [4, "<value>"]]` literal — the Scratch math-number primitive.
7. For inputs whose default selector is opcode-shaped (e.g. `flippermove_move`'s `DIRECTION` input expects a `flippermove_custom-icon-direction` shadow with field `forward`), look up the shadow opcode from a **shadow contract table** (Section: Shadow contract table below). If the workspace has a real selector block in that input, use it; else synthesize the default shadow.

### Load direction (sb3 → Blockly serialization)

Inverse of the above:
1. For each `target` where `isStage === false`, walk `blocks`.
2. For each block: emit a Blockly serialization entry with `type: opcode`, `id`, `x/y` for top-level blocks.
3. Convert inputs back: a `[N, blockId, shadowId]` triple becomes `{block: {...}, shadow: {...}}`. Numeric literals `[1, [4, "10"]]` become an inline `math_number` shadow with a `NUM` field.
4. Convert fields back: `{<name>: [<value>, null]}` → `{<name>: <value>}`.
5. If an opcode appears in the sb3 that the simulator's toolbox does not define, log a warning to the console panel and emit a Blockly `unknown` block (or skip it — see Error handling). The remaining blocks still load.

### Shadow contract table

A new constant in `js/llsp3_blocks.js`. Schema: keyed by `(blockOpcode, inputName)` → `{shadowOpcode, defaultField, fieldName}`. Derived by inspecting:
1. The captured sample `~/Downloads/Block Project.llsp3 → scratch.sb3 → project.json` (provides ground-truth contracts for the blocks it uses).
2. Each block definition in `js/blockly_config.js` (provides the input names and value-types).
3. Spot-checks against the alexandrehardy reference (license-clean: we read for shape, write our own).

Estimated size: 8–15 entries — most blocks share the same selector-shadow pattern (port, direction, color, sound, etc.).

Where the table has no entry for a `(blockOpcode, inputName)` pair, fall back to a `math_number` shadow with default `"10"`. This is the safe v1 default; the worst-case outcome is a Spike-app user seeing a `10` placeholder where they'd otherwise see a styled icon-selector. We catalogue exceptions as we discover them.

---

## UX

### Header layout (additions only)

```
[🤖 logo]  📝[ project name ___________ ]  [🐍 Python] [🧱 Blocks]   ...   [📂 Open] [💾 Save] [⟲ Defaults] [↺ Reset] [■ Stop] [▶ Run]
```

- **Project-name input.** Inline, always visible. Default `"Untitled"`. Used as the download filename. Reflects `manifest.name` after Load. Persisted to localStorage like the editor contents.
- **Open button.** Opens browser-native file picker (`accept=".llsp3"`).
- **Save button.** Downloads the active editor as `.llsp3` with the current name.

### Load behavior

- Auto-switches to the matching tab without asking. (Decided: the file decides the tab.)
- If `dirty === true`, show a `confirm()` dialog: "You have unsaved changes. Discard and load this file?" Cancel aborts.
- Errors render in the existing console-output panel with a distinct prefix (e.g. `[load]`).

### Save behavior

- Triggers a browser download. No File System Access API in v1.
- After the blob URL hands off to the browser, mark `dirty = false`.

### Dirty flag

A simple module-level boolean in `js/main.js`:
- Set to `true` on any Monaco edit (existing change listener at `js/main.js:152` already exists for save-to-localStorage; piggyback).
- Set to `true` on any Blockly change event (existing listener at `js/main.js:176`).
- Reset to `false` on successful Load and Save.
- Cleared on Reset and Defaults.

### Error categories surfaced in console

| Category                        | Message                                                                  |
|---------------------------------|--------------------------------------------------------------------------|
| Bad ZIP / missing manifest      | `[load] Couldn't read this file — it doesn't look like a .llsp3.`        |
| Unknown `manifest.type`         | `[load] This file uses project type "X", which isn't supported.`         |
| Unknown opcode in sb3           | `[load] This file uses blocks the simulator doesn't recognize: X, Y. Loaded what we could.` |
| Save failure (very rare)        | `[save] Couldn't write the file: <reason>.`                              |

---

## Testing

Three test surfaces, all browser-runnable.

### 1. Round-trip self-tests

Drop both real samples (`~/Downloads/Python Project.llsp3`, `~/Downloads/Block Project.llsp3`) into `tests/fixtures/llsp3/` (committed to the repo for stability). For each:

1. Load → re-serialize → diff: the re-serialization should match the original on every field except `lastsaved` (which we always update). Differences in field ordering are tolerated; differences in **values** are not.
2. For Python: `projectbody.main` must be byte-identical after round-trip.
3. For Blocks: every sb3 block must round-trip with identical opcode, fields (modulo key ordering), and tree structure (parent/next links). Block `id`s are allowed to differ since they're random.

### 2. Synthesized round-trip

Generate a Python file with edge-case content (Unicode, long lines, blank file) → save → load → assert equality.

Build a small Blockly workspace in code (Stage + a couple of `flipperevents_whenProgramStarts` chains) → save → load → walk the workspace and assert structure.

### 3. Real Spike-app round-trip (manual, owner = user)

1. Save from simulator → open in Spike Prime app → confirm it loads and runs.
2. Save from Spike Prime app → load in simulator → confirm it appears correctly.

This is the only test we cannot automate. The plan budgets two of the user's sittings for this verification loop, with debugging cycles between.

---

## Risk register

| Risk                                                            | Likelihood | Mitigation                                                                                  |
|-----------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------|
| Spike app sniffs manifest fields we omit and rejects the file   | Medium     | Capture more samples from different project types if the first round-trip fails; copy verbatim |
| Spike app sniffs the `meta.agent` UA string in sb3              | Low (precedent: alexandrehardy spoofs it) | Use the verbatim UA from a real sample              |
| Shadow-block contract table is incomplete                       | Medium     | Default to `math_number` shadow + `"10"`; catalogue exceptions as the user reports them     |
| Future Spike-app version renames opcodes (e.g. `flippermove_movement-port-selector`) | Low | We're matching the in-the-wild format; this is the same risk every consumer of the format faces |
| Browser without File System Access API can't "Save in place"    | Already accepted (v1 scope decision) | Document; add native handles in v2 if asked                                |
| User mid-edit clicks Open and loses work                        | Low        | `dirty` flag + `confirm()` dialog                                                           |

---

## Verification gate

Before declaring v1 done:

1. Both real samples round-trip through the simulator with byte-identical Python `main` and structurally-identical sb3 trees.
2. A simulator-saved Python `.llsp3` opens and runs in the real Spike app.
3. A simulator-saved Word-Blocks `.llsp3` opens in the real Spike app, all blocks render, and the program runs end-to-end on a real hub.
4. A Spike-app-saved file (one of each type) opens in the simulator, all blocks render, and the program runs.
5. Error categories all reachable in the console panel from at least one crafted bad input.

Items 2–4 are the user's manual loop.

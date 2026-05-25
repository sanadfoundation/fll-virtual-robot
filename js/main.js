'use strict';

// ── Polyscript noise suppressor ──────────────────────────────────────────────
// PyScript's worker bridge installs one-shot RPC listeners that throw a
// harmless "Cannot read properties of undefined (reading 'onmessage')" when
// our app-level messages arrive instead of polyscript's expected RPC shape.
// The simulator works fine; the rejection is internal to polyscript. Filter
// it out so the console stays useful for real errors.
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason && e.reason.message;
  if (typeof msg === 'string' && msg.indexOf("reading 'onmessage'") !== -1) {
    e.preventDefault();
  }
});

// ── App state ────────────────────────────────────────────────────────────────

let editor              = null;   // Monaco editor instance
let blocklyWs           = null;   // Blockly workspace
let pendingBlocklyXml   = null;   // Saved XML to restore after a re-inject (theme switch)
let sim                 = null;   // RobotSimulator instance
let currentMode         = 'blocks'; // 'python' | 'blocks'
let pyReady             = false;
let projectName         = 'Untitled-Project';
let dirty               = false;
let loadedManifest      = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function appendOutput(text, cls = '') {
  const out = document.getElementById('console-output');
  if (!out) return;
  // Convert PyScript proxy objects to plain strings
  const str = (text && typeof text.toString === 'function') ? text.toString() : String(text);
  const line = document.createElement('span');
  line.className = 'line' + (cls ? ' ' + cls : '');
  line.textContent = str;
  out.appendChild(line);
  out.appendChild(document.createElement('br'));
  out.scrollTop = out.scrollHeight;
}

function clearOutput() {
  const out = document.getElementById('console-output');
  if (out) out.innerHTML = '';
}

window.appendOutput = appendOutput;

// ── Persistence ──────────────────────────────────────────────────────────────

const THEME_KEY          = 'fll-vr-theme';
const SPEED_KEY          = 'fll-vr-speed';
const UNITS_KEY          = 'fll-vr-units';
const PYCODE_KEY         = 'fll-vr-python-code';
const BLOCKLY_KEY        = 'fll-vr-blockly-xml';
const TAB_KEY            = 'fll-vr-tab';
const NAME_KEY           = 'fll-vr-project-name';
const DIRTY_KEY          = 'fll-vr-dirty';
const PROJECT_TYPE_KEY   = 'fll-vr-project-type';

const DEFAULT_THEME        = 'light';
const DEFAULT_SPEED        = 1;
const DEFAULT_UNITS        = 'cm';
const VALID_UNITS          = ['cm', 'mm', 'in'];
const DEFAULT_TAB          = 'blocks';
const DEFAULT_NAME         = 'Untitled-Project';
const DEFAULT_PROJECT_TYPE = 'blocks';
const VALID_PROJECT_TYPES  = ['python', 'blocks'];

function lsGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
}

// ── Project state helpers (used by llsp3_ui hooks) ───────────────────────────

function setDirty(v) {
  dirty = !!v;
  if (dirty) lsSet(DIRTY_KEY, '1'); else lsRemove(DIRTY_KEY);
}
function isDirty() { return dirty; }
function getProjectName() { return projectName; }
function setProjectName(name) {
  projectName = name || DEFAULT_NAME;
  lsSet(NAME_KEY, projectName);
}
function setLoadedManifest(m) { loadedManifest = m; }

function getProjectType() {
  const stored = lsGet(PROJECT_TYPE_KEY);
  return VALID_PROJECT_TYPES.includes(stored) ? stored : DEFAULT_PROJECT_TYPE;
}

function setProjectType(type) {
  if (!VALID_PROJECT_TYPES.includes(type)) {
    throw new Error('unknown project type: ' + type);
  }
  lsSet(PROJECT_TYPE_KEY, type);
}

function migrateLegacyTabKey() {
  if (lsGet(PROJECT_TYPE_KEY)) return;          // already migrated
  const legacy = lsGet(TAB_KEY);
  const type = VALID_PROJECT_TYPES.includes(legacy) ? legacy : DEFAULT_PROJECT_TYPE;
  lsSet(PROJECT_TYPE_KEY, type);
  if (legacy !== null) lsRemove(TAB_KEY);
}

// ── Theme ────────────────────────────────────────────────────────────────────

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function monacoThemeFor(theme) {
  return theme === 'light' ? 'vs' : 'vs-dark';
}

function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  if (window.monaco && monaco.editor) {
    monaco.editor.setTheme(monacoThemeFor(t));
  }
  retintBlockly(t);
  lsSet(THEME_KEY, t);
}

// Blockly options like grid colour and workspace background are baked in at
// inject time, so a runtime setTheme() leaves them stale. To get a clean
// re-skin we save the workspace XML, dispose, and re-inject with the new
// theme. If the user is on the Python tab, we defer re-init until they switch
// back to Blocks (the saved XML is held in pendingBlocklyXml).
function retintBlockly(theme) {
  if (!blocklyWs || typeof Blockly === 'undefined') return;
  let xml = '';
  try {
    xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(blocklyWs));
  } catch (e) { /* ignore — fall through with empty xml */ }
  blocklyWs.dispose();
  blocklyWs = null;
  pendingBlocklyXml = xml || null;
  if (currentMode === 'blocks') initBlocklyWorkspace();
}

function initTheme() {
  const stored = lsGet(THEME_KEY);
  const theme = (stored === 'light' || stored === 'dark') ? stored : DEFAULT_THEME;
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
  applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

// Apply theme as early as possible to avoid a flash of dark UI in light mode.
initTheme();

// ── Initialization ────────────────────────────────────────────────────────────

function initEditor() {
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs' } });
  require(['vs/editor/editor.main'], () => {
    window.registerSpikeCompletions(monaco);
    // Storage holds the user's edits, not the default — absence means
    // "show the current DEFAULT_PYTHON_CODE." The save handler below keeps it
    // that way: it deletes the key when the editor matches the default.
    const stored = lsGet(PYCODE_KEY);
    const initialCode = (stored !== null) ? stored : DEFAULT_PYTHON_CODE;
    editor = monaco.editor.create(document.getElementById('py-editor'), {
      value: initialCode,
      language: 'python',
      theme: monacoThemeFor(currentTheme()),
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      wordBasedSuggestions: 'off',
    });
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      handleRun
    );

    let pySaveTimer = null;
    editor.onDidChangeModelContent(() => {
      setDirty(true);
      clearTimeout(pySaveTimer);
      pySaveTimer = setTimeout(() => {
        const value = editor.getValue();
        if (value === DEFAULT_PYTHON_CODE) lsRemove(PYCODE_KEY);
        else lsSet(PYCODE_KEY, value);
      }, 250);
    });
  });
}

function initSim() {
  sim = new RobotSimulator('robot-canvas');
  window.sim = sim;

  // Wire the force-sensor press button to the simulator's manual-press API.
  // pointerdown captures the pointer so a drag off the button still fires
  // pointerup; pointerleave / pointercancel are belt-and-suspenders for cases
  // where capture wasn't established (touch swipe, browser bug).
  const forceBtn = document.getElementById('port-force-E');
  if (forceBtn && sim) {
    forceBtn.addEventListener('pointerdown', (e) => {
      forceBtn.setPointerCapture && forceBtn.setPointerCapture(e.pointerId);
      sim.manualPress();
    });
    forceBtn.addEventListener('pointerup',     () => sim.manualRelease());
    forceBtn.addEventListener('pointerleave',  () => sim.manualRelease());
    forceBtn.addEventListener('pointercancel', () => sim.manualRelease());
  }
}

// Blockly caches its parent div's dimensions in workspace metrics — positioning
// of the trashcan and zoom controls reads from that cache, not the live DOM.
// Without this call after any geometry change, the trashcan (anchored flush to
// the bottom-right corner) drifts outside the visible workspace and stops
// receiving clicks. Skip while hidden: svgResize on a display:none parent
// caches 0×0, which leaves the icons pinned to the origin once shown.
function resizeBlocklyWorkspace() {
  if (!blocklyWs || typeof Blockly === 'undefined') return;
  if (currentMode !== 'blocks') return;
  Blockly.svgResize(blocklyWs);
}

function initBlocklyWorkspace() {
  if (blocklyWs) return;
  try {
    // Priority: pending XML from a theme re-inject > saved XML in localStorage > default starter.
    const stored = lsGet(BLOCKLY_KEY);
    const initialXml = pendingBlocklyXml || stored || undefined;
    pendingBlocklyXml = null;

    blocklyWs = window.initBlockly('blockly-div', currentTheme(), initialXml);

    if (blocklyWs) {
      blocklyWs.addChangeListener((e) => {
        // Skip UI-only events (clicks, scrolls) — they don't change the program.
        if (e && e.isUiEvent) return;
        setDirty(true);
        try {
          const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(blocklyWs));
          lsSet(BLOCKLY_KEY, xml);
        } catch (err) { /* workspace may be mid-dispose */ }
      });
    }
  } catch (e) {
    appendOutput('[Error] Blockly init failed: ' + e.message, 'error');
    console.error('Blockly init error:', e);
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchMode(mode, options) {
  const m = mode === 'blocks' ? 'blocks' : 'python';
  currentMode = m;
  const pyTab  = document.getElementById('tab-python');
  const blkTab = document.getElementById('tab-blocks');
  const pyWrap = document.getElementById('py-editor-wrap');
  const blkDiv = document.getElementById('blockly-div');

  if (m === 'python') {
    pyTab.classList.add('active');
    blkTab.classList.remove('active');
    pyWrap.style.display = 'block';
    blkDiv.style.display = 'none';
    if (editor) editor.layout();
  } else {
    blkTab.classList.add('active');
    pyTab.classList.remove('active');
    pyWrap.style.display = 'none';
    blkDiv.style.display = 'block';
    initBlocklyWorkspace();
    resizeBlocklyWorkspace();
  }

  if (!options || options.persist !== false) setProjectType(m);
}

function applyStoredProjectType() {
  switchMode(getProjectType(), { persist: false });
}

// ── Run / Stop ────────────────────────────────────────────────────────────────

async function handleRun() {
  if (!sim) return;
  // Re-entry guard: the Run button is disabled while a run is in flight, but
  // Monaco's Cmd-Enter command fires regardless of button state. Without this
  // check a second press spawns a parallel Python worker invocation or a
  // second Blockly AsyncFunction — both fight over the same sim.
  const runBtn = document.getElementById('btn-run');
  if (runBtn && runBtn.disabled) return;
  clearOutput();

  if (currentMode === 'python') {
    await runPython();
  } else {
    await runBlockly();
  }
}

async function runPython() {
  if (!pyReady) {
    appendOutput('[!] Python runtime not ready yet. Please wait...', 'warn');
    return;
  }
  setButtons(true);
  sim._stopRequested = false;
  sim._setStatus('running');
  appendOutput('[Run] Executing Python code…', 'info');
  window._pyWorker.postMessage({ type: 'run', code: editor.getValue() });
}

async function runBlockly() {
  // blocklyWs may be null if user clicked Run without switching to Blocks tab first;
  // fall back to the global main workspace Blockly already injected.
  const ws = blocklyWs || (typeof Blockly !== 'undefined' && Blockly.getMainWorkspace());
  if (!ws) {
    appendOutput('[!] Blockly not initialized.', 'warn');
    return;
  }

  const topBlocks = (ws.getTopBlocks && ws.getTopBlocks(false)) || [];
  if (topBlocks.length === 0) {
    appendOutput('[!] No blocks to run.', 'warn');
    return;
  }
  const code = window.generateBlocklyJS(ws);

  appendOutput('[Run] Executing blocks...', 'info');
  setButtons(true);
  sim.isRunning = true;
  sim._setStatus('running');
  window._blkVolume = 100;

  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction(code);
    await fn();
    appendOutput('[Done] Simulation complete.', 'info');
  } catch (e) {
    appendOutput('[Error] ' + e.message, 'error');
  } finally {
    sim.isRunning = false;
    sim._setStatus('ready');
    setButtons(false);
  }
}

function handleStop() {
  sim._stopRequested = true;
  sim.isRunning = false;
  setButtons(false);
  sim._setStatus('ready');
  appendOutput('[Stopped]', 'warn');
}

// "New" — wipe the editor and Blockly workspace, reset the project name,
// and clear the dirty flag. Confirms first if there are unsaved changes so
// a stray click in the header can't blow away work. The Open/Save handlers
// are still in llsp3_ui.js; this one lives here because it touches the
// editor + Blockly directly and reuses DEFAULT_PYTHON_CODE.
function handleNewProject() {
  if (isDirty()) {
    const ok = window.confirm('Discard the current project and start a new one?');
    if (!ok) return;
  }
  if (editor) editor.setValue(DEFAULT_PYTHON_CODE);
  lsRemove(PYCODE_KEY);
  if (blocklyWs && typeof Blockly !== 'undefined') {
    blocklyWs.clear();
    lsRemove(BLOCKLY_KEY);
  } else {
    lsRemove(BLOCKLY_KEY);
  }
  setProjectName(DEFAULT_NAME);
  const nameInput = document.getElementById('project-name');
  if (nameInput) nameInput.value = DEFAULT_NAME;
  setLoadedManifest(null);
  setDirty(false);
  appendOutput(`[new] Started a fresh project.`, 'info');
}

function handleReset() {
  if (!sim) return;
  const wasRunning = sim.isRunning;
  if (wasRunning) handleStop();
  sim.reset();
  // reset() clears _stopRequested as part of normalising state; re-assert it
  // so any worker command Python sends before it sees SystemExit still aborts.
  if (wasRunning) sim._stopRequested = true;
  clearOutput();
  appendOutput('[Ready] Simulator reset.', 'info');
}

function setButtons(running) {
  const runBtn  = document.getElementById('btn-run');
  const stopBtn = document.getElementById('btn-stop');
  if (runBtn)  runBtn.disabled  = running;
  if (stopBtn) stopBtn.disabled = !running;
}

// ── Speed control ─────────────────────────────────────────────────────────────

function updateSpeed(val, options) {
  const num = parseFloat(val);
  if (sim) sim.speedMult = num;
  const label = document.getElementById('speed-label');
  if (label) label.textContent = num + 'x';
  if (!options || options.persist !== false) lsSet(SPEED_KEY, String(num));
}

function applyStoredSpeed() {
  const stored = parseFloat(lsGet(SPEED_KEY));
  const speed = isFinite(stored) && stored > 0 ? stored : DEFAULT_SPEED;
  const slider = document.getElementById('speed-slider');
  if (slider) slider.value = String(speed);
  updateSpeed(speed, { persist: false });
}

// ── Units selector ────────────────────────────────────────────────────────────

function updateUnits(unit, options) {
  if (sim) sim.setUnits(unit);
  if (!options || options.persist !== false) lsSet(UNITS_KEY, unit);
}

function applyStoredUnits() {
  const stored = lsGet(UNITS_KEY);
  const unit = VALID_UNITS.includes(stored) ? stored : DEFAULT_UNITS;
  const select = document.getElementById('units-select');
  if (select) select.value = unit;
  updateUnits(unit, { persist: false });
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function handleDefaults() {
  const ok = window.confirm(
    'Reset everything to defaults?\n\n' +
    'This will replace your current theme, speed, Python code, and block program with the defaults. This cannot be undone.'
  );
  if (!ok) return;

  // Theme
  applyTheme(DEFAULT_THEME);

  // Speed
  const slider = document.getElementById('speed-slider');
  if (slider) slider.value = String(DEFAULT_SPEED);
  updateSpeed(DEFAULT_SPEED);

  // Units
  const unitsSelect = document.getElementById('units-select');
  if (unitsSelect) unitsSelect.value = DEFAULT_UNITS;
  updateUnits(DEFAULT_UNITS);

  // Python code — drop any stored override so future default changes flow
  // through automatically. The setValue() also fires the save handler, which
  // re-removes the key (idempotent) since the editor now matches the default.
  lsRemove(PYCODE_KEY);
  if (editor) editor.setValue(DEFAULT_PYTHON_CODE);

  // Blockly XML — replace live workspace if mounted, otherwise stage for next mount.
  const defaultXml = window.DEFAULT_BLOCKLY_XML || '';
  if (blocklyWs && typeof Blockly !== 'undefined') {
    try {
      blocklyWs.clear();
      if (defaultXml) {
        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(defaultXml), blocklyWs);
      }
    } catch (e) {
      console.error('Blockly defaults reset failed:', e);
    }
  } else {
    pendingBlocklyXml = defaultXml || null;
  }
  if (defaultXml) lsSet(BLOCKLY_KEY, defaultXml);

  // Active tab
  switchMode(DEFAULT_TAB);

  setProjectName(DEFAULT_NAME);
  const nameInput = document.getElementById('project-name');
  if (nameInput) nameInput.value = DEFAULT_NAME;
  loadedManifest = null;
  setDirty(false);

  appendOutput('[Defaults] Theme, speed, active tab, project name, and editor contents reset.', 'info');
}

// ── PyScript worker bootstrap ─────────────────────────────────────────────────
// PyScript sets .xworker on the <script type="mpy" worker> element after init.
// Poll once per frame until it appears, then wire up the message bridge.

function _pollForWorker() {
  if (window._pyWorker) return;
  const el = document.querySelector('script[type="mpy"][worker]');
  const worker = el && el.xworker;
  if (!worker) {
    requestAnimationFrame(_pollForWorker);
    return;
  }
  window._pyWorker = worker;

  // xworker.ready resolves when the Python worker script has fully loaded.
  // Use it instead of a 'ready' postMessage from Python — sending one would
  // trigger polyscript's one-shot RPC listener and throw a runEvent error.
  worker.ready.then(() => {
    pyReady = true;
    const overlay = document.getElementById('py-loading');
    if (overlay) overlay.classList.add('hidden');
    appendOutput('[Ready] Python runtime loaded.', 'info');
    document.getElementById('btn-run').disabled = false;
  });

  worker.addEventListener('message', async ({ data }) => {
    if (!data || !data.type) return;

    if (data.type === 'cmd') {
      try {
        const result = await sim.executeCommand(data.cmd);
        worker.postMessage({ type: 'cmd_result', id: data.id, result });
      } catch (e) {
        // Surface JS-side throws (e.g. _assertPortKind from Blockly direct
        // calls) and tell Python to stop, otherwise its awaited Promise hangs.
        appendOutput('[Error] ' + (e && e.message ? e.message : e), 'error');
        setButtons(false);
        sim._setStatus('error');
        worker.postMessage({ type: 'cmd_result', id: data.id, result: { stopped: true } });
      }
    } else if (data.type === 'done') {
      appendOutput('[Done] Simulation complete.', 'info');
      setButtons(false);
      sim._setStatus('ready');
    } else if (data.type === 'error') {
      appendOutput('[Error] ' + data.message, 'error');
      setButtons(false);
      sim._setStatus('error');
    }
  });
}

// ── Resize handle ─────────────────────────────────────────────────────────────

function initResizeHandle() {
  const handle = document.getElementById('resize-handle');
  const left   = document.querySelector('.panel-left');
  if (!handle || !left) return;

  let dragging = false;
  let startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    // Don't start a resize-drag if the user pressed the collapse button —
    // that button sits on top of the handle and has its own click handler.
    if (e.target && e.target.closest('.resize-collapse-btn')) return;
    // Drag is meaningless when the panel is collapsed.
    if (left.classList.contains('collapsed')) return;
    dragging = true;
    startX = e.clientX;
    startW = left.offsetWidth;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const newW  = Math.max(260, Math.min(startW + delta, window.innerWidth - 300));
    left.style.width = newW + 'px';
    if (editor) editor.layout();
    resizeBlocklyWorkspace();
  });

  document.addEventListener('mouseup', () => {
    // Only act on the mouseup that ends a resize-handle drag. Without this
    // guard, every click anywhere in the document fired sim._resize(), which
    // wrote stale marginLeft/marginTop onto the canvas and made it jump.
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    // The canvas wrap has a ResizeObserver (simulator.js) so the canvas
    // auto-fits the new panel-right width; we just need to resync Blockly.
    resizeBlocklyWorkspace();
  });

  initCollapseToggle(left);
}

// ── Editor-panel collapse/expand ─────────────────────────────────────────────
// A button centred on the resize handle folds .panel-left away so the canvas
// can run full-width — useful on small laptops or when watching the field
// while a long program runs. Persisted in localStorage so the preference
// survives reloads. Editor / Blockly layouts re-sync after the transition so
// they don't render at zero width when expanded again.

const COLLAPSE_KEY = 'fll-vr-left-collapsed';

function initCollapseToggle(left) {
  const btn = document.getElementById('resize-collapse-btn');
  if (!btn) return;

  function apply(collapsed) {
    left.classList.toggle('collapsed', collapsed);
    btn.setAttribute('aria-pressed', String(collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Expand editor panel' : 'Collapse editor panel');
    btn.title = collapsed ? 'Expand editor panel' : 'Collapse editor panel';
    // After the width animation completes (.panel-left transitions at 0.22s),
    // re-layout the editor/Blockly so they fill the new column or hide cleanly.
    setTimeout(() => {
      if (editor) editor.layout();
      resizeBlocklyWorkspace();
    }, 240);
  }

  apply(lsGet(COLLAPSE_KEY) === '1');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = !left.classList.contains('collapsed');
    apply(next);
    lsSet(COLLAPSE_KEY, next ? '1' : '0');
  });

  // Block the resize-handle's mousedown drag from triggering when the user
  // presses the button (covered by the closest() check there too, belt and
  // suspenders).
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
}

// ── Default Python code ───────────────────────────────────────────────────────

const DEFAULT_PYTHON_CODE = `# FLL Virtual Robot — Mission: hit obstacle '1' on green, then obstacle '2' on red.
# Port layout: A/B light motors (drive), C color, D distance, E force, F empty.
from hub import port
import motor_pair, color_sensor, distance_sensor, force_sensor, runloop

async def main():
    # Pair the drive motors (left = port.A, right = port.B).
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)

    # From spawn (350, 163), drive 780 mm north to the row of upper boxes (y≈943).
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 1596, 0, velocity=720)
    print('Color under robot:', color_sensor.color(port.C))

    # Turn right 90° (now heading east).
    await motor_pair.move_tank_for_time(motor_pair.PAIR_1, 360, -360, 500)

    # Drive 1350 mm east — through yellow (x≈1000), slams obstacle '1' on green (x≈1700).
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 2762, 0, velocity=720)
    print('Bumper force after hit:', force_sensor.force(port.E), 'N')
    print('Distance ahead:', distance_sensor.distance(port.D), 'mm')

    # Turn right 90° (now heading south).
    await motor_pair.move_tank_for_time(motor_pair.PAIR_1, 360, -360, 500)

    # Drive 600 mm south — line up with the red mission row (y≈343).
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 1228, 0, velocity=720)

    # Turn left 90° (now heading east).
    await motor_pair.move_tank_for_time(motor_pair.PAIR_1, -360, 360, 500)

    # Drive 300 mm east — slams obstacle '2' on red (x≈2000).
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 614, 0, velocity=720)
    print('Bumper force after hit:', force_sensor.force(port.E), 'N')

    print('Mission complete!')

runloop.run(main())
`;

// ── llsp3_ui hooks ────────────────────────────────────────────────────────────

function getActiveMode()    { return currentMode; }
function getPythonSource()  { return editor ? editor.getValue() : ''; }
function setPythonSource(t) { if (editor) editor.setValue(t); else lsSet(PYCODE_KEY, t); }

function getBlocklyState() {
  if (!blocklyWs || typeof Blockly === 'undefined') return { blocks: { languageVersion: 0, blocks: [] } };
  return Blockly.serialization.workspaces.save(blocklyWs);
}
function setBlocklyState(state) {
  if (!blocklyWs) initBlocklyWorkspace();
  if (!blocklyWs || typeof Blockly === 'undefined') return;
  blocklyWs.clear();
  try { Blockly.serialization.workspaces.load(state, blocklyWs); }
  catch (e) { console.error('Blockly load failed:', e); appendOutput('[load] Blockly load failed: ' + e.message, 'error'); }
  try {
    const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(blocklyWs));
    lsSet(BLOCKLY_KEY, xml);
  } catch (e) {}
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  migrateLegacyTabKey();
  projectName = lsGet(NAME_KEY) || DEFAULT_NAME;
  dirty       = lsGet(DIRTY_KEY) === '1';

  initEditor();
  initSim();
  _pollForWorker();
  initResizeHandle();
  window.addEventListener('resize', resizeBlocklyWorkspace);

  document.getElementById('tab-python').addEventListener('click', () => switchMode('python'));
  document.getElementById('tab-blocks').addEventListener('click', () => switchMode('blocks'));
  document.getElementById('btn-run').addEventListener('click', handleRun);
  document.getElementById('btn-stop').addEventListener('click', handleStop);
  document.getElementById('btn-reset').addEventListener('click', handleReset);
  document.getElementById('btn-defaults').addEventListener('click', handleDefaults);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  const newBtn = document.getElementById('btn-new');
  if (newBtn) newBtn.addEventListener('click', handleNewProject);

  const speedSlider = document.getElementById('speed-slider');
  if (speedSlider) speedSlider.addEventListener('input', e => updateSpeed(e.target.value));

  const unitsSelect = document.getElementById('units-select');
  if (unitsSelect) unitsSelect.addEventListener('change', e => updateUnits(e.target.value));

  applyStoredSpeed();
  applyStoredUnits();
  applyStoredProjectType();

  if (window.LLSP3 && window.LLSP3.ui && typeof window.LLSP3.ui.init === 'function') {
    window.LLSP3.ui.init({
      getActiveMode, getPythonSource, setPythonSource,
      getBlocklyState, setBlocklyState,
      switchTab: switchMode,
      isDirty, setDirty,
      getProjectName, setProjectName,
      get loadedManifest() { return loadedManifest; },
      setLoadedManifest,
      appendOutput,
    });
  }

  // Disable run until Python is ready
  document.getElementById('btn-run').disabled = true;

  appendOutput('[Init] Simulator loaded. Waiting for Python runtime...', 'info');

  // If Blockly isn't available, hide the Blocks tab
  if (typeof Blockly === 'undefined') {
    const blkTab = document.getElementById('tab-blocks');
    if (blkTab) { blkTab.style.opacity = '0.4'; blkTab.title = 'Blockly failed to load'; }
  }
});

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

const THEME_KEY   = 'fll-vr-theme';
const SPEED_KEY   = 'fll-vr-speed';
const UNITS_KEY   = 'fll-vr-units';
const PYCODE_KEY  = 'fll-vr-python-code';
const BLOCKLY_KEY = 'fll-vr-blockly-xml';
const TAB_KEY     = 'fll-vr-tab';
const NAME_KEY    = 'fll-vr-project-name';
const DIRTY_KEY   = 'fll-vr-dirty';

const DEFAULT_THEME = 'light';
const DEFAULT_SPEED = 1;
const DEFAULT_UNITS = 'cm';
const VALID_UNITS   = ['cm', 'mm', 'in'];
const DEFAULT_TAB   = 'blocks';
const DEFAULT_NAME  = 'Untitled-Project';

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

// ── Hub sidebar collapse ────────────────────────────────────────────────────

function applyHubCollapsed(collapsed) {
  const panel = document.getElementById('sensor-panel');
  const btn   = document.getElementById('hub-toggle');
  if (!panel || !btn) return;
  panel.classList.toggle('collapsed', collapsed);
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Expand hub panel' : 'Collapse hub panel');
}

function initHubSidebar() {
  const panel = document.getElementById('sensor-panel');
  const btn   = document.getElementById('hub-toggle');
  if (!panel || !btn) return;

  applyHubCollapsed(false);

  btn.addEventListener('click', () => {
    applyHubCollapsed(!panel.classList.contains('collapsed'));
  });

  const railLabel = document.getElementById('hub-rail-label');
  if (railLabel) {
    railLabel.addEventListener('click', () => applyHubCollapsed(false));
  }

  // The canvas auto-fits its parent on window resize. When the sidebar
  // width changes, panel-right reflows but no resize event fires — so
  // re-trigger the sim's fit logic when the transition lands.
  panel.addEventListener('transitionend', e => {
    if (e.propertyName === 'width' && window.sim && typeof window.sim._resize === 'function') {
      window.sim._resize();
    }
  });
}

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
  }

  if (!options || options.persist !== false) lsSet(TAB_KEY, m);
}

function applyStoredTab() {
  const stored = lsGet(TAB_KEY);
  const tab = (stored === 'python' || stored === 'blocks') ? stored : DEFAULT_TAB;
  switchMode(tab, { persist: false });
}

// ── Run / Stop ────────────────────────────────────────────────────────────────

async function handleRun() {
  if (!sim) return;
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

  const code = window.generateBlocklyJS(ws);
  if (!code.trim()) {
    appendOutput('[!] No blocks to run.', 'warn');
    return;
  }

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
  appendOutput('[Stopped]', 'warn');
}

function handleReset() {
  if (sim) sim.reset();
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
        worker.postMessage({ type: 'cmd_result', id: data.id, result: { stopped: true } });
      }
    } else if (data.type === 'done') {
      appendOutput('[Done] Simulation complete.', 'info');
      setButtons(false);
    } else if (data.type === 'error') {
      appendOutput('[Error] ' + data.message, 'error');
      setButtons(false);
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
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
    if (sim) sim._resize();
  });
}

// ── Default Python code ───────────────────────────────────────────────────────

const DEFAULT_PYTHON_CODE = `# FLL Virtual Robot — Mission: hit obstacle '1' on green, then obstacle '2' on red
from hub import port
import motor_pair, runloop

async def main():
    # Pair the drive motors (left = port.A, right = port.B)
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)

    # From spawn (350, 163), drive 780 mm north to the row of upper boxes (y≈943)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 1596, 0, velocity=720)

    # Turn right 90° (now heading east)
    await motor_pair.move_tank_for_time(motor_pair.PAIR_1, 360, -360, 500)

    # Drive 1350 mm east — through yellow (x≈1000), slams obstacle '1' on green (x≈1700)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 2762, 0, velocity=720)

    # Turn right 90° (now heading south)
    await motor_pair.move_tank_for_time(motor_pair.PAIR_1, 360, -360, 500)

    # Drive 600 mm south — line up with the red mission row (y≈343)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 1228, 0, velocity=720)

    # Turn left 90° (now heading east)
    await motor_pair.move_tank_for_time(motor_pair.PAIR_1, -360, 360, 500)

    # Drive 300 mm east — slams obstacle '2' on red (x≈2000)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 614, 0, velocity=720)

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
  projectName = lsGet(NAME_KEY) || DEFAULT_NAME;
  dirty       = lsGet(DIRTY_KEY) === '1';

  initEditor();
  initSim();
  _pollForWorker();
  initResizeHandle();
  initHubSidebar();

  document.getElementById('tab-python').addEventListener('click', () => switchMode('python'));
  document.getElementById('tab-blocks').addEventListener('click', () => switchMode('blocks'));
  document.getElementById('btn-run').addEventListener('click', handleRun);
  document.getElementById('btn-stop').addEventListener('click', handleStop);
  document.getElementById('btn-reset').addEventListener('click', handleReset);
  document.getElementById('btn-defaults').addEventListener('click', handleDefaults);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  const speedSlider = document.getElementById('speed-slider');
  if (speedSlider) speedSlider.addEventListener('input', e => updateSpeed(e.target.value));

  const unitsSelect = document.getElementById('units-select');
  if (unitsSelect) unitsSelect.addEventListener('change', e => updateUnits(e.target.value));

  applyStoredSpeed();
  applyStoredUnits();
  applyStoredTab();

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

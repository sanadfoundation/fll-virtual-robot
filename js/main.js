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
let currentMode         = 'python'; // 'python' | 'blocks'
let pyReady             = false;

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

// ── Theme ────────────────────────────────────────────────────────────────────

const THEME_KEY = 'fll-vr-theme';

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
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* storage may be unavailable */ }
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
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
  let theme = stored;
  if (theme !== 'light' && theme !== 'dark') {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    theme = prefersLight ? 'light' : 'dark';
  }
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
    editor = monaco.editor.create(document.getElementById('py-editor'), {
      value: DEFAULT_PYTHON_CODE,
      language: 'python',
      theme: monacoThemeFor(currentTheme()),
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      scrollBeyondLastLine: false,
      wordWrap: 'off',
    });
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      handleRun
    );
  });
}

function initSim() {
  sim = new RobotSimulator('robot-canvas');
  window.sim = sim;
}

function initBlocklyWorkspace() {
  if (blocklyWs) return;
  try {
    blocklyWs = window.initBlockly('blockly-div', currentTheme());
    if (blocklyWs && pendingBlocklyXml) {
      // Restore workspace state preserved across a theme re-inject.
      try {
        blocklyWs.clear();
        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(pendingBlocklyXml), blocklyWs);
      } catch (e) {
        console.error('Blockly XML restore failed:', e);
      }
      pendingBlocklyXml = null;
    }
  } catch (e) {
    appendOutput('[Error] Blockly init failed: ' + e.message, 'error');
    console.error('Blockly init error:', e);
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchMode(mode) {
  currentMode = mode;
  const pyTab  = document.getElementById('tab-python');
  const blkTab = document.getElementById('tab-blocks');
  const pyWrap = document.getElementById('py-editor-wrap');
  const blkDiv = document.getElementById('blockly-div');

  if (mode === 'python') {
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

function updateSpeed(val) {
  if (sim) sim.speedMult = parseFloat(val);
  const label = document.getElementById('speed-label');
  if (label) label.textContent = val + 'x';
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
      const result = await sim.executeCommand(data.cmd);
      worker.postMessage({ type: 'cmd_result', id: data.id, result });
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

const DEFAULT_PYTHON_CODE = `# FLL Virtual Robot — SPIKE Prime v3 Python API
from hub import port
import motor_pair, runloop

async def main():
    # Pair the drive motors (left = port.A, right = port.B)
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)

    # Move forward for 2 seconds at 360 deg/sec
    await motor_pair.move_for_time(motor_pair.PAIR_1, 2000, 0, velocity=360)

    # Turn right (left wheel forward, right wheel back)
    await motor_pair.move_tank_for_time(motor_pair.PAIR_1, 360, -360, 800)

    # Move forward again
    await motor_pair.move_for_time(motor_pair.PAIR_1, 1000, 0, velocity=360)

    print('Mission complete!')

runloop.run(main())
`;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initEditor();
  initSim();
  _pollForWorker();
  initResizeHandle();

  document.getElementById('tab-python').addEventListener('click', () => switchMode('python'));
  document.getElementById('tab-blocks').addEventListener('click', () => switchMode('blocks'));
  document.getElementById('btn-run').addEventListener('click', handleRun);
  document.getElementById('btn-stop').addEventListener('click', handleStop);
  document.getElementById('btn-reset').addEventListener('click', handleReset);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  const speedSlider = document.getElementById('speed-slider');
  if (speedSlider) speedSlider.addEventListener('input', e => updateSpeed(e.target.value));

  // Disable run until Python is ready
  document.getElementById('btn-run').disabled = true;

  appendOutput('[Init] Simulator loaded. Waiting for Python runtime...', 'info');

  // If Blockly isn't available, hide the Blocks tab
  if (typeof Blockly === 'undefined') {
    const blkTab = document.getElementById('tab-blocks');
    if (blkTab) { blkTab.style.opacity = '0.4'; blkTab.title = 'Blockly failed to load'; }
  }
});

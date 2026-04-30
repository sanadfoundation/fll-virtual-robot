'use strict';

// ── App state ────────────────────────────────────────────────────────────────

let editor        = null;   // CodeMirror instance
let blocklyWs     = null;   // Blockly workspace
let sim           = null;   // RobotSimulator instance
let currentMode   = 'python'; // 'python' | 'blocks'
let pyReady       = false;

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

// ── JS bridge functions called from Python via PyScript ──────────────────────

window.queueSimCommand = function(jsonStr) {
  // Legacy single-command path (unused in new model)
};

window.receiveCommands = function(jsonStr) {
  if (sim) sim.receiveCommands(String(jsonStr));
};

window.getColorSensorColor      = ()     => sim ? sim.getColorSensorColor()       : 'none';
window.getColorSensorReflection = ()     => sim ? sim.getColorSensorReflection()  : 0;
window.getColorSensorAmbient    = ()     => sim ? sim.getColorSensorAmbient()     : 0;
window.getColorSensorRGB        = ()     => sim ? sim.getColorSensorRGB()         : [0,0,0];
window.getDistanceSensorValue   = ()     => sim ? sim.getDistanceSensorValue()    : 999;
window.getDistanceSensorPresence= ()     => sim ? sim.getDistanceSensorPresence() : false;
window.getForceSensorValue      = ()     => sim ? sim.getForceSensorValue()       : 0;
window.getForceSensorPressed    = ()     => sim ? sim.getForceSensorPressed()     : false;
window.getMotorSpeed            = (port) => sim ? sim.getMotorSpeed(port)         : 0;
window.getMotorPosition         = (port) => sim ? sim.getMotorPosition(port)      : 0;

// ── Initialization ────────────────────────────────────────────────────────────

function initEditor() {
  const textarea = document.getElementById('py-editor');
  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'python',
    theme: 'monokai',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: false,
    extraKeys: {
      Tab: cm => cm.execCommand('insertSoftTab'),
      'Ctrl-Enter': () => handleRun(),
      'Cmd-Enter':  () => handleRun(),
      'Ctrl-Space': cm => cm.showHint({ hint: window.spikeHint, completeSingle: false }),
    },
  });

  // Auto-trigger completions after typing '.'
  editor.on('inputRead', (cm, change) => {
    if (change.text[0] === '.') {
      cm.showHint({ hint: window.spikeHint, completeSingle: false });
    }
  });

  editor.setValue(DEFAULT_PYTHON_CODE);
}

function initSim() {
  sim = new RobotSimulator('robot-canvas');
  window.sim = sim;
}

function initBlocklyWorkspace() {
  if (blocklyWs) return;
  try {
    blocklyWs = window.initBlockly('blockly-div');
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
    if (editor) editor.refresh();
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

  const code = editor.getValue();
  appendOutput('[Run] Executing Python code…', 'info');
  setButtons(true);

  try {
    const fn = window.pyRunCode;
    if (!fn) throw new Error('Python bridge not initialized');
    // fn() is synchronous: it execs user code and calls receiveCommands()
    fn(code);
    // Now animate the queued commands
    await sim.playQueue();
    appendOutput('[Done] Simulation complete.', 'info');
  } catch (e) {
    appendOutput('[Error] ' + e.message, 'error');
  } finally {
    setButtons(false);
  }
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
  if (sim) sim.stop();
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

// ── PyScript ready callback ───────────────────────────────────────────────────

window.onPyReady = function() {
  pyReady = true;
  const overlay = document.getElementById('py-loading');
  if (overlay) overlay.classList.add('hidden');
  appendOutput('[Ready] Python runtime loaded.', 'info');
  document.getElementById('btn-run').disabled = false;
};

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
    if (editor) editor.refresh();
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
    if (sim) sim._resize();
  });
}

// ── Default Python code ───────────────────────────────────────────────────────

const DEFAULT_PYTHON_CODE = `# FLL Virtual Robot — accepts real Spike Prime v3 Python code
from hub import port, light_matrix, sound
import motor_pair, motor, runloop

async def main():
    # Pair the drive motors (left = A, right = B)
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)

    # Move forward for 2 seconds
    await motor_pair.move_for_time(motor_pair.PAIR_1, 2000, 0, velocity=500)

    # Turn right 90° (tank turn: 180° wheel rotation = 90° robot turn)
    await motor_pair.move_tank(motor_pair.PAIR_1, 500, -500, 180, 'degrees')

    # Move forward for 1 second
    await motor_pair.move_for_time(motor_pair.PAIR_1, 1000, 0, velocity=500)

    # Celebrate
    light_matrix.write('Done')
    sound.beep(72, 0.4)
    print('Mission complete!')

runloop.run(main())
`;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initEditor();
  initSim();
  initResizeHandle();

  document.getElementById('tab-python').addEventListener('click', () => switchMode('python'));
  document.getElementById('tab-blocks').addEventListener('click', () => switchMode('blocks'));
  document.getElementById('btn-run').addEventListener('click', handleRun);
  document.getElementById('btn-stop').addEventListener('click', handleStop);
  document.getElementById('btn-reset').addEventListener('click', handleReset);

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

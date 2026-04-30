'use strict';

// ── MicroPython built-ins ────────────────────────────────────────────────────

const MICROPYTHON_BUILTINS = [
  'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes', 'callable',
  'chr', 'compile', 'dict', 'dir', 'divmod', 'enumerate', 'eval',
  'filter', 'float', 'format', 'frozenset', 'getattr', 'globals',
  'hasattr', 'hash', 'hex', 'id', 'input', 'int', 'isinstance',
  'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max', 'min',
  'next', 'object', 'oct', 'open', 'ord', 'pow', 'print', 'range',
  'repr', 'reversed', 'round', 'set', 'setattr', 'slice', 'sorted',
  'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip',
  'True', 'False', 'None',
  'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if',
  'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass',
  'raise', 'return', 'try', 'while', 'with', 'yield',
];

// ── Spike Prime v3 top-level names ───────────────────────────────────────────

const SPIKE_GLOBALS = [
  'motor_pair', 'motor', 'color_sensor', 'distance_sensor',
  'force_sensor', 'hub', 'color', 'Port', 'wait',
];

// ── Member completions keyed by object path ──────────────────────────────────

const SPIKE_MEMBERS = {
  'motor_pair': [
    'pair', 'unpair', 'move', 'move_tank', 'start', 'start_tank',
    'start_at_power', 'stop', 'get_default_speed',
    'PAIR_1', 'PAIR_2', 'PAIR_3',
  ],
  'motor': [
    'run_for_degrees', 'run_for_time', 'run', 'stop',
    'get_speed', 'get_position', 'get_degrees_counted',
  ],
  'color_sensor': ['color', 'reflection', 'ambient_light', 'rgb', 'rgbi'],
  'distance_sensor': [
    'distance', 'presence', 'get_distance_cm', 'get_distance_inches',
  ],
  'force_sensor': ['force', 'pressed', 'raw'],
  'hub': ['light_matrix', 'speaker', 'motion', 'button'],
  'hub.light_matrix': ['write', 'show_image', 'set_pixel', 'show', 'off'],
  'hub.speaker': ['beep', 'play_notes', 'stop'],
  'hub.motion': [
    'tilt_angles', 'angular_velocity', 'acceleration',
    'reset_yaw_angle', 'get_yaw_angle',
  ],
  'hub.button': ['pressed', 'was_pressed'],
  'color': [
    'BLACK', 'RED', 'GREEN', 'YELLOW', 'BLUE',
    'WHITE', 'CYAN', 'MAGENTA', 'ORANGE', 'NONE',
  ],
  'Port': ['A', 'B', 'C', 'D', 'E', 'F'],
};

// ── Hint function ────────────────────────────────────────────────────────────

function spikeHint(cm) {
  const cursor = cm.getCursor();
  const line   = cm.getLine(cursor.line);
  const before = line.slice(0, cursor.ch);

  // Skip completions inside comments or strings
  const tokenType = cm.getTokenAt(cursor).type;
  if (tokenType === 'comment' || tokenType === 'string') return;

  // Dot completion — match object path before the dot, partial word after
  const dotMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_.]*)\.([\w]*)$/);
  if (dotMatch) {
    const objPath = dotMatch[1];
    const partial = dotMatch[2];
    const members = SPIKE_MEMBERS[objPath];
    if (!members) return;

    const list = members
      .filter(m => m.startsWith(partial))
      .sort();

    if (!list.length) return;
    return {
      list,
      from: CodeMirror.Pos(cursor.line, cursor.ch - partial.length),
      to:   CodeMirror.Pos(cursor.line, cursor.ch),
    };
  }

  // Global word completion
  const wordMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
  const partial   = wordMatch ? wordMatch[1] : '';
  if (!partial) return;

  const seen = new Set();
  const list = [...SPIKE_GLOBALS, ...MICROPYTHON_BUILTINS]
    .filter(w => {
      if (!w.startsWith(partial) || w === partial || seen.has(w)) return false;
      seen.add(w);
      return true;
    })
    .sort();

  if (!list.length) return;
  return {
    list,
    from: CodeMirror.Pos(cursor.line, cursor.ch - partial.length),
    to:   CodeMirror.Pos(cursor.line, cursor.ch),
  };
}

window.spikeHint = spikeHint;

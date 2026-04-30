'use strict';

// ── Custom Block Definitions ─────────────────────────────────────────────────

const SPIKE_BLOCKS = [

  // Move forward
  {
    type: 'spike_move_forward',
    message0: 'move forward %1 cm at speed %2 %',
    args0: [
      { type: 'field_number', name: 'DIST',  value: 20, min: 0, max: 500 },
      { type: 'field_number', name: 'SPEED', value: 50, min: 1, max: 100 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 230,
    tooltip: 'Move the robot forward',
  },

  // Move backward
  {
    type: 'spike_move_backward',
    message0: 'move backward %1 cm at speed %2 %',
    args0: [
      { type: 'field_number', name: 'DIST',  value: 20, min: 0, max: 500 },
      { type: 'field_number', name: 'SPEED', value: 50, min: 1, max: 100 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 230,
    tooltip: 'Move the robot backward',
  },

  // Turn left
  {
    type: 'spike_turn_left',
    message0: 'turn left %1 °',
    args0: [
      { type: 'field_number', name: 'DEG', value: 90, min: 1, max: 360 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 160,
    tooltip: 'Turn the robot left',
  },

  // Turn right
  {
    type: 'spike_turn_right',
    message0: 'turn right %1 °',
    args0: [
      { type: 'field_number', name: 'DEG', value: 90, min: 1, max: 360 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 160,
    tooltip: 'Turn the robot right',
  },

  // Move with steering
  {
    type: 'spike_move_steering',
    message0: 'move steering %1 distance %2 cm speed %3 %',
    args0: [
      { type: 'field_number', name: 'STEERING', value: 0, min: -100, max: 100 },
      { type: 'field_number', name: 'DIST',     value: 30, min: 0, max: 500 },
      { type: 'field_number', name: 'SPEED',    value: 50, min: 1, max: 100 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 230,
    tooltip: 'Move with steering (-100=full left, 0=straight, 100=full right)',
  },

  // Move tank
  {
    type: 'spike_move_tank',
    message0: 'move tank left %1 % right %2 % distance %3 cm',
    args0: [
      { type: 'field_number', name: 'LEFT',  value: 50, min: -100, max: 100 },
      { type: 'field_number', name: 'RIGHT', value: 50, min: -100, max: 100 },
      { type: 'field_number', name: 'DIST',  value: 20, min: 0, max: 500 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 230,
    tooltip: 'Control left and right motor speeds independently',
  },

  // Wait seconds
  {
    type: 'spike_wait',
    message0: 'wait %1 seconds',
    args0: [
      { type: 'field_number', name: 'SEC', value: 1, min: 0.1, max: 60 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 290,
    tooltip: 'Wait for a number of seconds',
  },

  // Run motor for rotations
  {
    type: 'spike_motor_rotations',
    message0: 'run motor %1 for %2 rotations at speed %3 %',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: [['A','A'],['B','B'],['C','C'],['D','D'],['E','E'],['F','F']] },
      { type: 'field_number', name: 'ROTS',  value: 1, min: 0.1, max: 100 },
      { type: 'field_number', name: 'SPEED', value: 50, min: 1, max: 100 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 120,
    tooltip: 'Run a single motor for N rotations',
  },

  // Run motor for degrees
  {
    type: 'spike_motor_degrees',
    message0: 'run motor %1 for %2 ° at speed %3 %',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: [['A','A'],['B','B'],['C','C'],['D','D'],['E','E'],['F','F']] },
      { type: 'field_number', name: 'DEG',   value: 360, min: 1 },
      { type: 'field_number', name: 'SPEED', value: 50, min: 1, max: 100 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 120,
    tooltip: 'Run a single motor for N degrees',
  },

  // Display text
  {
    type: 'spike_display_text',
    message0: 'display %1',
    args0: [
      { type: 'field_input', name: 'TEXT', text: 'Hello' },
    ],
    previousStatement: null, nextStatement: null,
    colour: 60,
    tooltip: 'Show text on the hub LED matrix',
  },

  // Beep
  {
    type: 'spike_beep',
    message0: 'beep note %1 for %2 seconds',
    args0: [
      { type: 'field_number', name: 'NOTE', value: 60, min: 21, max: 108 },
      { type: 'field_number', name: 'SEC',  value: 0.3, min: 0.05, max: 5 },
    ],
    previousStatement: null, nextStatement: null,
    colour: 60,
    tooltip: 'Play a beep (MIDI note number)',
  },

  // Color sensor condition
  {
    type: 'spike_color_is',
    message0: 'color sensor on %1 sees %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: [['A','A'],['B','B'],['C','C'],['D','D'],['E','E'],['F','F']] },
      { type: 'field_dropdown', name: 'COLOR', options: [
        ['black','black'],['red','red'],['green','green'],['yellow','yellow'],
        ['blue','blue'],['white','white'],['none','none'],
      ]},
    ],
    output: 'Boolean',
    colour: 20,
    tooltip: 'Check if color sensor detects a color',
  },

  // Distance condition
  {
    type: 'spike_distance_less',
    message0: 'distance sensor on %1 < %2 cm',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: [['A','A'],['B','B'],['C','C'],['D','D'],['E','E'],['F','F']] },
      { type: 'field_number', name: 'DIST', value: 20, min: 1, max: 200 },
    ],
    output: 'Boolean',
    colour: 20,
    tooltip: 'Check if distance sensor reads less than threshold',
  },

  // Print / log
  {
    type: 'spike_print',
    message0: 'print %1',
    args0: [{ type: 'input_value', name: 'TEXT', check: 'String' }],
    previousStatement: null, nextStatement: null,
    colour: 290,
    tooltip: 'Print a message to the console',
  },
];

// ── JavaScript Code Generators ───────────────────────────────────────────────

function registerGenerators(Blockly) {
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  if (!js) return;

  js['spike_move_forward'] = (block) => {
    const dist  = block.getFieldValue('DIST');
    const speed = block.getFieldValue('SPEED');
    return `await window.sim._animateTank(${speed/100}, ${speed/100}, ${dist*10});\n`;
  };

  js['spike_move_backward'] = (block) => {
    const dist  = block.getFieldValue('DIST');
    const speed = block.getFieldValue('SPEED');
    return `await window.sim._animateTank(${-speed/100}, ${-speed/100}, ${dist*10});\n`;
  };

  js['spike_turn_left'] = (block) => {
    const deg = block.getFieldValue('DEG');
    const arcMM = (deg / 360) * Math.PI * 112; // TRACK_W_MM
    return `await window.sim._animateTank(-0.5, 0.5, ${arcMM.toFixed(2)});\n`;
  };

  js['spike_turn_right'] = (block) => {
    const deg = block.getFieldValue('DEG');
    const arcMM = (deg / 360) * Math.PI * 112;
    return `await window.sim._animateTank(0.5, -0.5, ${arcMM.toFixed(2)});\n`;
  };

  js['spike_move_steering'] = (block) => {
    const steering = block.getFieldValue('STEERING') / 100;
    const dist     = block.getFieldValue('DIST');
    const speed    = block.getFieldValue('SPEED') / 100;
    const lv = speed * (1 + steering);
    const rv = speed * (1 - steering);
    return `await window.sim._animateTank(${lv.toFixed(3)}, ${rv.toFixed(3)}, ${dist*10});\n`;
  };

  js['spike_move_tank'] = (block) => {
    const left  = block.getFieldValue('LEFT')  / 100;
    const right = block.getFieldValue('RIGHT') / 100;
    const dist  = block.getFieldValue('DIST');
    return `await window.sim._animateTank(${left}, ${right}, ${dist*10});\n`;
  };

  js['spike_wait'] = (block) => {
    const sec = block.getFieldValue('SEC');
    return `await window.sim._sleep(${sec * 1000} / window.sim.speedMult);\n`;
  };

  js['spike_motor_rotations'] = (block) => {
    const port  = block.getFieldValue('PORT');
    const rots  = block.getFieldValue('ROTS');
    const speed = block.getFieldValue('SPEED') / 100;
    const distMM = rots * Math.PI * 56; // WHEEL_CIRC_MM
    return `await window.sim._animateSingleMotor('${port}', ${speed}, ${distMM.toFixed(2)});\n`;
  };

  js['spike_motor_degrees'] = (block) => {
    const port  = block.getFieldValue('PORT');
    const deg   = block.getFieldValue('DEG');
    const speed = block.getFieldValue('SPEED') / 100;
    const distMM = (deg / 360) * Math.PI * 56;
    return `await window.sim._animateSingleMotor('${port}', ${speed}, ${distMM.toFixed(2)});\n`;
  };

  js['spike_display_text'] = (block) => {
    const text = block.getFieldValue('TEXT').replace(/'/g, "\\'");
    return `window.sim._showText('${text}');\n`;
  };

  js['spike_beep'] = (block) => {
    const note = block.getFieldValue('NOTE');
    const sec  = block.getFieldValue('SEC');
    return `window.sim._playBeep(${note}, ${sec * 1000}); await window.sim._sleep(${sec * 1000});\n`;
  };

  js['spike_color_is'] = (block) => {
    const color = block.getFieldValue('COLOR');
    return [`window.sim.getColorSensorColor() === '${color}'`, Blockly.JavaScript.ORDER_EQUALITY];
  };

  js['spike_distance_less'] = (block) => {
    const dist = block.getFieldValue('DIST');
    return [`window.sim.getDistanceSensorValue() < ${dist * 10}`, Blockly.JavaScript.ORDER_RELATIONAL];
  };

  js['spike_print'] = (block) => {
    const text = Blockly.JavaScript.valueToCode(block, 'TEXT', Blockly.JavaScript.ORDER_NONE) || "''";
    return `window.appendOutput(String(${text}));\n`;
  };
}

// ── Toolbox XML ───────────────────────────────────────────────────────────────

const TOOLBOX_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <category name="Movement" colour="230">
    <block type="spike_move_forward">
      <field name="DIST">20</field><field name="SPEED">50</field>
    </block>
    <block type="spike_move_backward">
      <field name="DIST">20</field><field name="SPEED">50</field>
    </block>
    <block type="spike_turn_left">
      <field name="DEG">90</field>
    </block>
    <block type="spike_turn_right">
      <field name="DEG">90</field>
    </block>
    <block type="spike_move_steering"/>
    <block type="spike_move_tank"/>
  </category>

  <category name="Motors" colour="120">
    <block type="spike_motor_rotations"/>
    <block type="spike_motor_degrees"/>
  </category>

  <category name="Sensors" colour="20">
    <block type="spike_color_is"/>
    <block type="spike_distance_less"/>
  </category>

  <category name="Hub" colour="60">
    <block type="spike_display_text">
      <field name="TEXT">Hello!</field>
    </block>
    <block type="spike_beep"/>
    <block type="spike_wait">
      <field name="SEC">1</field>
    </block>
    <block type="spike_print">
      <value name="TEXT">
        <shadow type="text"><field name="TEXT">Hello</field></shadow>
      </value>
    </block>
  </category>

  <sep></sep>

  <category name="Logic" colour="210">
    <block type="controls_if"></block>
    <block type="controls_ifelse"></block>
    <block type="logic_compare"></block>
    <block type="logic_operation"></block>
    <block type="logic_negate"></block>
    <block type="logic_boolean"></block>
  </category>

  <category name="Loops" colour="120">
    <block type="controls_repeat_ext">
      <value name="TIMES">
        <shadow type="math_number"><field name="NUM">10</field></shadow>
      </value>
    </block>
    <block type="controls_whileUntil"></block>
    <block type="controls_for">
      <field name="VAR">i</field>
      <value name="FROM"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
      <value name="TO">  <shadow type="math_number"><field name="NUM">10</field></shadow></value>
      <value name="BY">  <shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
  </category>

  <category name="Math" colour="230">
    <block type="math_number"><field name="NUM">0</field></block>
    <block type="math_arithmetic"></block>
    <block type="math_random_int">
      <value name="FROM"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
      <value name="TO">  <shadow type="math_number"><field name="NUM">100</field></shadow></value>
    </block>
  </category>

  <category name="Text" colour="160">
    <block type="text"><field name="TEXT"></field></block>
    <block type="text_join"></block>
    <block type="text_length"></block>
  </category>

  <category name="Variables" colour="330" custom="VARIABLE"></category>
  <category name="Functions"  colour="290" custom="PROCEDURE"></category>
</xml>`;

// ── Blockly workspace initializer ─────────────────────────────────────────────

function initBlockly(divId) {
  if (typeof Blockly === 'undefined') return null;

  // Register block definitions
  Blockly.defineBlocksWithJsonArray(SPIKE_BLOCKS);
  registerGenerators(Blockly);

  const workspace = Blockly.inject(divId, {
    toolbox: TOOLBOX_XML,
    grid:    { spacing: 20, length: 3, colour: '#2a2a3e', snap: true },
    zoom:    { controls: true, wheel: true, startScale: 0.9 },
    trashcan: true,
    theme: Blockly.Theme.defineTheme('spikeDark', {
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: '#1e1e2e',
        toolboxBackgroundColour:   '#2a2a3e',
        toolboxForegroundColour:   '#cdd6f4',
        flyoutBackgroundColour:    '#313145',
        flyoutForegroundColour:    '#cdd6f4',
        flyoutOpacity:             0.95,
        scrollbarColour:           '#3d3d5c',
        insertionMarkerColour:     '#7c6af7',
        markerColour:              '#7c6af7',
        cursorColour:              '#56d4c0',
      },
    }),
  });

  // Starter blocks
  const starterXml = `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="spike_move_forward" x="30" y="30">
        <field name="DIST">20</field>
        <field name="SPEED">50</field>
        <next><block type="spike_turn_right">
          <field name="DEG">90</field>
          <next><block type="spike_move_forward">
            <field name="DIST">20</field>
            <field name="SPEED">50</field>
          </block></next>
        </block></next>
      </block>
    </xml>`;
  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(starterXml), workspace);

  return workspace;
}

function generateBlocklyJS(workspace) {
  if (!workspace) return '';
  const Blockly = window.Blockly;
  if (!Blockly) return '';
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  if (!js) return '';
  return js.workspaceToCode(workspace);
}

window.initBlockly = initBlockly;
window.generateBlocklyJS = generateBlocklyJS;

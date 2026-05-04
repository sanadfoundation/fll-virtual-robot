'use strict';

window.registerSpikeCompletions = function(monaco) {

  // ── API data ──────────────────────────────────────────────────────────────

  const SPIKE_API = {
    motor: {
      doc: 'Control individual motors on specified ports.',
      members: {
        run_for_degrees: {
          sig: 'motor.run_for_degrees(port, degrees, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Run motor for the given number of degrees.\n\n**port** — `port.A`–`port.F`\n**degrees** — rotation in degrees (negative = reverse)\n**velocity** — speed in deg/sec\n**stop** — `motor.BRAKE`, `motor.COAST`, `motor.HOLD`',
          params: ['port', 'degrees', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        run_for_time: {
          sig: 'motor.run_for_time(port, duration, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Run motor for the given duration.\n\n**port** — `port.A`–`port.F`\n**duration** — time in ms\n**velocity** — speed in deg/sec (negative = reverse)',
          params: ['port', 'duration', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        run_to_absolute_position: {
          sig: 'motor.run_to_absolute_position(port, position, velocity, *, direction=SHORTEST_PATH, stop=BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Run motor to an absolute position (0–359 degrees).\n\n**position** — target angle 0–359\n**direction** — `motor.CLOCKWISE`, `COUNTERCLOCKWISE`, or `SHORTEST_PATH`',
          params: ['port', 'position', 'velocity', 'direction', 'stop', 'acceleration', 'deceleration'],
        },
        run_to_relative_position: {
          sig: 'motor.run_to_relative_position(port, position, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Run motor to a position relative to the current position.\n\n**position** — degrees relative to current\n**velocity** — speed in deg/sec',
          params: ['port', 'position', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        run: {
          sig: 'motor.run(port, velocity, *, acceleration=1000)',
          doc: 'Run motor continuously.\n\n**velocity** — speed in deg/sec (negative = reverse)',
          params: ['port', 'velocity', 'acceleration'],
        },
        stop: {
          sig: 'motor.stop(port, *, stop=BRAKE)',
          doc: 'Stop the motor.\n\n**stop** — `motor.COAST`, `motor.BRAKE`, or `motor.HOLD`',
          params: ['port', 'stop'],
        },
        velocity: {
          sig: 'motor.velocity(port) -> int',
          doc: 'Return the current velocity of the motor in deg/sec.',
          params: ['port'],
        },
        absolute_position: {
          sig: 'motor.absolute_position(port) -> int',
          doc: 'Return the absolute position of the motor (0–359 degrees).',
          params: ['port'],
        },
        relative_position: {
          sig: 'motor.relative_position(port) -> int',
          doc: 'Return the motor position relative to the last reset.',
          params: ['port'],
        },
        reset_relative_position: {
          sig: 'motor.reset_relative_position(port, position) -> None',
          doc: 'Reset the relative position counter.',
          params: ['port', 'position'],
        },
        get_duty_cycle: {
          sig: 'motor.get_duty_cycle(port) -> int',
          doc: 'Return the current PWM duty cycle (–10000 to 10000).',
          params: ['port'],
        },
        set_duty_cycle: {
          sig: 'motor.set_duty_cycle(port, pwm) -> None',
          doc: 'Set the motor PWM duty cycle.\n\n**pwm** — –10000 to 10000',
          params: ['port', 'pwm'],
        },
      },
      constants: {
        COAST: '0', BRAKE: '1', HOLD: '2', CONTINUE: '3',
        SMART_COAST: '4', SMART_BRAKE: '5',
        CLOCKWISE: '0', COUNTERCLOCKWISE: '1',
        SHORTEST_PATH: '2', LONGEST_PATH: '3',
        READY: '0', RUNNING: '1', STALLED: '2',
        CANCELLED: '3', ERROR: '4', DISCONNECTED: '5',
      },
    },

    motor_pair: {
      doc: 'Synchronized control for two motors moving a robot.',
      members: {
        pair: {
          sig: 'motor_pair.pair(pair, left_motor, right_motor) -> None',
          doc: 'Assign two motors to a pair.\n\n**pair** — `PAIR_1`, `PAIR_2`, or `PAIR_3`\n**left_motor** — port constant for the left wheel\n**right_motor** — port constant for the right wheel',
          params: ['pair', 'left_motor', 'right_motor'],
        },
        unpair: {
          sig: 'motor_pair.unpair(pair) -> None',
          doc: 'Remove the motor assignment from a pair.',
          params: ['pair'],
        },
        move: {
          sig: 'motor_pair.move(pair, steering, *, velocity=360, acceleration=1000) -> None',
          doc: 'Move continuously with the given steering.\n\n**steering** — –100 (full left) to 100 (full right), 0 = straight\n**velocity** — speed in deg/sec',
          params: ['pair', 'steering', 'velocity', 'acceleration'],
        },
        move_for_degrees: {
          sig: 'motor_pair.move_for_degrees(pair, degrees, steering, *, velocity=360, stop=motor.BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Move until motors rotate by the given degrees.\n\n**degrees** — wheel rotation\n**steering** — –100 to 100\n**velocity** — deg/sec',
          params: ['pair', 'degrees', 'steering', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        move_for_time: {
          sig: 'motor_pair.move_for_time(pair, duration, steering, *, velocity=360, stop=motor.BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Move for the given duration.\n\n**duration** — time in ms\n**steering** — –100 to 100\n**velocity** — deg/sec',
          params: ['pair', 'duration', 'steering', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        move_tank: {
          sig: 'motor_pair.move_tank(pair, left_velocity, right_velocity, *, acceleration=1000) -> None',
          doc: 'Move continuously with independent wheel speeds.\n\n**left_velocity** — left wheel deg/sec\n**right_velocity** — right wheel deg/sec',
          params: ['pair', 'left_velocity', 'right_velocity', 'acceleration'],
        },
        move_tank_for_degrees: {
          sig: 'motor_pair.move_tank_for_degrees(pair, degrees, left_velocity, right_velocity, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Move until motors rotate by the given degrees, with independent wheel speeds.\n\n**degrees** — wheel rotation\n**left_velocity**, **right_velocity** — deg/sec',
          params: ['pair', 'degrees', 'left_velocity', 'right_velocity', 'stop', 'acceleration', 'deceleration'],
        },
        move_tank_for_time: {
          sig: 'motor_pair.move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Move with independent wheel speeds for a duration.\n\n**left_velocity**, **right_velocity** — deg/sec\n**duration** — ms',
          params: ['pair', 'left_velocity', 'right_velocity', 'duration', 'stop', 'acceleration', 'deceleration'],
        },
        stop: {
          sig: 'motor_pair.stop(pair, *, stop=motor.BRAKE) -> None',
          doc: 'Stop both motors in the pair.\n\n**stop** — `motor.COAST`, `motor.BRAKE`, or `motor.HOLD`',
          params: ['pair', 'stop'],
        },
      },
      constants: { PAIR_1: '0', PAIR_2: '1', PAIR_3: '2' },
    },

    color_sensor: {
      doc: 'Read color, reflection, and RGBI from the Color Sensor.',
      members: {
        color: {
          sig: 'color_sensor.color(port) -> int',
          doc: 'Return the detected color as a `color.*` constant.\n\nReturns `color.UNKNOWN` (-1) if no color is detected.',
          params: ['port'],
        },
        reflection: {
          sig: 'color_sensor.reflection(port) -> int',
          doc: 'Return the reflected light intensity (0–100).',
          params: ['port'],
        },
        rgbi: {
          sig: 'color_sensor.rgbi(port) -> tuple[int, int, int, int]',
          doc: 'Return (red, green, blue, intensity) values (0–1024 each).',
          params: ['port'],
        },
      },
    },

    distance_sensor: {
      doc: 'Measure distance and control the sensor face LEDs.',
      members: {
        distance: {
          sig: 'distance_sensor.distance(port) -> int',
          doc: 'Return distance to nearest object in mm. Returns –1 if no object detected.',
          params: ['port'],
        },
        clear: {
          sig: 'distance_sensor.clear(port) -> None',
          doc: 'Turn off all face LEDs.',
          params: ['port'],
        },
        get_pixel: {
          sig: 'distance_sensor.get_pixel(port, x, y) -> int',
          doc: 'Get brightness of a face LED (x and y: 0–4).',
          params: ['port', 'x', 'y'],
        },
        set_pixel: {
          sig: 'distance_sensor.set_pixel(port, x, y, intensity) -> None',
          doc: 'Set brightness of a face LED.\n\n**x**, **y** — 0–4\n**intensity** — 0–100',
          params: ['port', 'x', 'y', 'intensity'],
        },
        show: {
          sig: 'distance_sensor.show(port, pixels) -> None',
          doc: 'Set all 4 face LEDs at once.\n\n**pixels** — list of 4 intensity values (0–100)',
          params: ['port', 'pixels'],
        },
      },
    },

    force_sensor: {
      doc: 'Detect force and button presses.',
      members: {
        force: {
          sig: 'force_sensor.force(port) -> int',
          doc: 'Return force in decinewtons (0–100).',
          params: ['port'],
        },
        pressed: {
          sig: 'force_sensor.pressed(port) -> bool',
          doc: 'Return True if the button is pressed.',
          params: ['port'],
        },
        raw: {
          sig: 'force_sensor.raw(port) -> int',
          doc: 'Return the raw sensor value.',
          params: ['port'],
        },
      },
    },

    color: {
      doc: 'Color constants (integers) used with color_sensor and comparisons.',
      members: {},
      constants: {
        BLACK: '0', MAGENTA: '1', PURPLE: '2', BLUE: '3', AZURE: '4',
        TURQUOISE: '5', GREEN: '6', YELLOW: '7', ORANGE: '8',
        RED: '9', WHITE: '10', UNKNOWN: '-1',
      },
    },

    hub: {
      doc: 'Access hub hardware: light_matrix, sound, motion_sensor, button, light.',
      members: {
        device_uuid: { sig: 'hub.device_uuid() -> str', doc: 'Return the hub device UUID.', params: [] },
        hardware_id: { sig: 'hub.hardware_id() -> str', doc: 'Return the hardware ID string.', params: [] },
        temperature:  { sig: 'hub.temperature() -> int', doc: 'Return hub temperature in decidegrees Celsius.', params: [] },
        power_off:    { sig: 'hub.power_off() -> int', doc: 'Power off the hub.', params: [] },
      },
      constants: {},
    },

    'hub.light_matrix': {
      doc: '5×5 LED matrix on the hub.',
      constants: {
        IMAGE_HEART: '1', IMAGE_HEART_SMALL: '2', IMAGE_HAPPY: '3', IMAGE_SMILE: '4',
        IMAGE_SAD: '5', IMAGE_CONFUSED: '6', IMAGE_ANGRY: '7', IMAGE_ASLEEP: '8',
        IMAGE_SURPRISED: '9', IMAGE_SILLY: '10', IMAGE_FABULOUS: '11', IMAGE_MEH: '12',
        IMAGE_YES: '13', IMAGE_NO: '14',
        IMAGE_CLOCK12: '15', IMAGE_CLOCK1: '16', IMAGE_CLOCK2: '17', IMAGE_CLOCK3: '18',
        IMAGE_CLOCK4: '19', IMAGE_CLOCK5: '20', IMAGE_CLOCK6: '21', IMAGE_CLOCK7: '22',
        IMAGE_CLOCK8: '23', IMAGE_CLOCK9: '24', IMAGE_CLOCK10: '25', IMAGE_CLOCK11: '26',
        IMAGE_ARROW_N: '27', IMAGE_ARROW_NE: '28', IMAGE_ARROW_E: '29', IMAGE_ARROW_SE: '30',
        IMAGE_ARROW_S: '31', IMAGE_ARROW_SW: '32', IMAGE_ARROW_W: '33', IMAGE_ARROW_NW: '34',
        IMAGE_GO_RIGHT: '35', IMAGE_GO_LEFT: '36', IMAGE_GO_UP: '37', IMAGE_GO_DOWN: '38',
        IMAGE_TRIANGLE: '39', IMAGE_TRIANGLE_LEFT: '40', IMAGE_CHESSBOARD: '41',
        IMAGE_DIAMOND: '42', IMAGE_DIAMOND_SMALL: '43', IMAGE_SQUARE: '44', IMAGE_SQUARE_SMALL: '45',
        IMAGE_RABBIT: '46', IMAGE_COW: '47',
        IMAGE_MUSIC_CROTCHET: '48', IMAGE_MUSIC_QUAVER: '49', IMAGE_MUSIC_QUAVERS: '50',
        IMAGE_PITCHFORK: '51', IMAGE_XMAS: '52', IMAGE_PACMAN: '53', IMAGE_TARGET: '54',
        IMAGE_TSHIRT: '55', IMAGE_ROLLERSKATE: '56', IMAGE_DUCK: '57', IMAGE_HOUSE: '58',
        IMAGE_TORTOISE: '59', IMAGE_BUTTERFLY: '60', IMAGE_STICKFIGURE: '61',
        IMAGE_GHOST: '62', IMAGE_SWORD: '63', IMAGE_GIRAFFE: '64', IMAGE_SKULL: '65',
        IMAGE_UMBRELLA: '66', IMAGE_SNAKE: '67',
      },
      members: {
        write: {
          sig: 'hub.light_matrix.write(text, intensity=100, time_per_character=500) -> Awaitable',
          doc: 'Scroll text across the display.\n\n**text** — string\n**intensity** — brightness 0–100\n**time_per_character** — ms per character',
          params: ['text', 'intensity', 'time_per_character'],
        },
        show: {
          sig: 'hub.light_matrix.show(pixels) -> None',
          doc: 'Set all 25 pixels at once.\n\n**pixels** — list of 25 intensity values (0–100)',
          params: ['pixels'],
        },
        show_image: {
          sig: 'hub.light_matrix.show_image(image) -> None',
          doc: 'Display a built-in image (e.g. `hub.light_matrix.IMAGE_HAPPY`).',
          params: ['image'],
        },
        set_pixel: {
          sig: 'hub.light_matrix.set_pixel(x, y, intensity=100) -> None',
          doc: 'Set a single pixel brightness.\n\n**x**, **y** — 0–4 (x=0 left, y=0 top)',
          params: ['x', 'y', 'intensity'],
        },
        get_pixel: {
          sig: 'hub.light_matrix.get_pixel(x, y) -> int',
          doc: 'Return brightness of a pixel (0–100).',
          params: ['x', 'y'],
        },
        clear: {
          sig: 'hub.light_matrix.clear() -> None',
          doc: 'Turn off all pixels.',
          params: [],
        },
        off: {
          sig: 'hub.light_matrix.off() -> None',
          doc: 'Turn off all pixels (alias for clear).',
          params: [],
        },
        get_orientation: {
          sig: 'hub.light_matrix.get_orientation() -> int',
          doc: 'Return the current display orientation constant.',
          params: [],
        },
        set_orientation: {
          sig: 'hub.light_matrix.set_orientation(top) -> int',
          doc: 'Set the display orientation.\n\n**top** — `orientation.UP`, `DOWN`, `LEFT`, or `RIGHT`',
          params: ['top'],
        },
      },
    },

    'hub.sound': {
      doc: 'Play sounds through the hub speaker.',
      members: {
        beep: {
          sig: 'hub.sound.beep(freq=440, duration=500, volume=100, *, attack=0, decay=0, sustain=100, release=0, transition=10, waveform=WAVEFORM_SINE, channel=DEFAULT)',
          doc: 'Play a beep.\n\n**freq** — frequency in Hz (440 = A4)\n**duration** — ms\n**volume** — 0–100\n**waveform** — `hub.sound.WAVEFORM_*`\n**channel** — `hub.sound.ANY`, `DEFAULT`, or 0–N',
          params: ['freq', 'duration', 'volume', 'attack', 'decay', 'sustain', 'release', 'transition', 'waveform', 'channel'],
        },
        stop: {
          sig: 'hub.sound.stop() -> None',
          doc: 'Stop any currently playing sound.',
          params: [],
        },
        volume: {
          sig: 'hub.sound.volume(volume) -> None',
          doc: 'Set the speaker volume (0–100).',
          params: ['volume'],
        },
      },
      constants: {
        ANY: '-2', DEFAULT: '-1',
        WAVEFORM_SINE: '1', WAVEFORM_SQUARE: '2',
        WAVEFORM_SAWTOOTH: '3', WAVEFORM_TRIANGLE: '1',
      },
    },

    'hub.motion_sensor': {
      doc: 'Inertial measurement unit (IMU) on the hub.',
      members: {
        tilt_angles: {
          sig: 'hub.motion_sensor.tilt_angles() -> tuple[int, int, int]',
          doc: 'Return (yaw, pitch, roll) in decidegrees.',
          params: [],
        },
        angular_velocity: {
          sig: 'hub.motion_sensor.angular_velocity(raw_unfiltered=False) -> tuple[int, int, int]',
          doc: 'Return angular velocity in decideg/sec around (x, y, z).',
          params: ['raw_unfiltered'],
        },
        acceleration: {
          sig: 'hub.motion_sensor.acceleration(raw_unfiltered=False) -> tuple[int, int, int]',
          doc: 'Return acceleration in milli-G on (x, y, z).',
          params: ['raw_unfiltered'],
        },
        reset_yaw: {
          sig: 'hub.motion_sensor.reset_yaw(angle=0) -> None',
          doc: 'Reset the yaw angle to the given value.',
          params: ['angle'],
        },
        gesture: {
          sig: 'hub.motion_sensor.gesture() -> int',
          doc: 'Return the most recent gesture: `TAPPED`, `DOUBLE_TAPPED`, `SHAKEN`, `FALLING`, or `UNKNOWN`.',
          params: [],
        },
        stable: {
          sig: 'hub.motion_sensor.stable() -> bool',
          doc: 'Return True if the hub is stationary.',
          params: [],
        },
        up_face: {
          sig: 'hub.motion_sensor.up_face() -> int',
          doc: 'Return which hub face points up.',
          params: [],
        },
        quaternion: {
          sig: 'hub.motion_sensor.quaternion() -> tuple[float, float, float, float]',
          doc: 'Return the orientation quaternion (w, x, y, z).',
          params: [],
        },
        tap_count: {
          sig: 'hub.motion_sensor.tap_count() -> int',
          doc: 'Return the number of taps detected since the last reset.',
          params: [],
        },
        reset_tap_count: {
          sig: 'hub.motion_sensor.reset_tap_count() -> None',
          doc: 'Reset the tap counter to zero.',
          params: [],
        },
        get_yaw_face: {
          sig: 'hub.motion_sensor.get_yaw_face() -> int',
          doc: 'Return the hub face currently used as the yaw reference.',
          params: [],
        },
        set_yaw_face: {
          sig: 'hub.motion_sensor.set_yaw_face(up) -> bool',
          doc: 'Set the hub face used as the yaw reference.\n\n**up** — `hub.motion_sensor.TOP`, `FRONT`, `RIGHT`, `BOTTOM`, `BACK`, or `LEFT`.',
          params: ['up'],
        },
      },
      constants: {
        TAPPED: '0', DOUBLE_TAPPED: '1', SHAKEN: '2', FALLING: '3', UNKNOWN: '-1',
        TOP: '0', FRONT: '1', RIGHT: '2', BOTTOM: '3', BACK: '4', LEFT: '5',
      },
    },

    'hub.button': {
      doc: 'Read the hub left and right buttons.',
      members: {
        pressed: {
          sig: 'hub.button.pressed(button) -> int',
          doc: 'Return ms the button has been held, or 0 if not pressed.\n\n**button** — `hub.button.LEFT` or `hub.button.RIGHT`',
          params: ['button'],
        },
        was_pressed: {
          sig: 'hub.button.was_pressed(button) -> bool',
          doc: 'Return True if button was pressed since last call.',
          params: ['button'],
        },
      },
      constants: { LEFT: '1', RIGHT: '2' },
    },

    'hub.light': {
      doc: 'Control hub indicator lights.',
      members: {
        color: {
          sig: 'hub.light.color(light, color) -> None',
          doc: 'Set the color of an indicator light.\n\n**light** — `hub.light.POWER` or `hub.light.CONNECT`\n**color** — a `color.*` constant',
          params: ['light', 'color'],
        },
      },
      constants: { POWER: '0', CONNECT: '1' },
    },

    'hub.port': {
      doc: 'Port constants for the hub. Aliases `hub.port.A`–`F` to the same integer values as the top-level `port` module.',
      members: {},
      constants: { A: '0', B: '1', C: '2', D: '3', E: '4', F: '5' },
    },

    runloop: {
      doc: 'Asynchronous event loop for running coroutines.',
      members: {
        run: {
          sig: 'runloop.run(*functions) -> None',
          doc: 'Run one or more async functions to completion.\n\n**Usage:** `runloop.run(main())`',
          params: ['functions'],
        },
        sleep_ms: {
          sig: 'runloop.sleep_ms(duration) -> Awaitable',
          doc: 'Pause for the given duration.\n\n**duration** — ms\n\n**Usage:** `await runloop.sleep_ms(500)`',
          params: ['duration'],
        },
        until: {
          sig: 'runloop.until(function, timeout=0) -> Awaitable',
          doc: 'Pause until `function()` returns True.\n\n**function** — callable returning bool\n**timeout** — ms (0 = no timeout)',
          params: ['function', 'timeout'],
        },
      },
    },

    port: {
      doc: 'Port constants for connecting sensors and motors.',
      members: {},
      constants: { A: '0', B: '1', C: '2', D: '3', E: '4', F: '5' },
    },

    orientation: {
      doc: 'Display orientation constants for hub.light_matrix.set_orientation().',
      members: {},
      constants: { UP: '0', RIGHT: '1', DOWN: '2', LEFT: '3' },
    },

    device: {
      doc: 'Low-level device access for connected sensors and motors.',
      members: {
        id:            { sig: 'device.id(port) -> int',            doc: 'Return the device type ID.', params: ['port'] },
        data:          { sig: 'device.data(port) -> tuple[int]',   doc: 'Return raw sensor data.', params: ['port'] },
        ready:         { sig: 'device.ready(port) -> bool',        doc: 'Return True if device is ready.', params: ['port'] },
        get_duty_cycle:{ sig: 'device.get_duty_cycle(port) -> int',doc: 'Return the PWM duty cycle.', params: ['port'] },
        set_duty_cycle:{ sig: 'device.set_duty_cycle(port, duty_cycle) -> None', doc: 'Set the PWM duty cycle.', params: ['port', 'duty_cycle'] },
      },
    },

    color_matrix: {
      doc: 'Control the 3×3 Color Matrix accessory.',
      members: {
        clear:     { sig: 'color_matrix.clear(port) -> None',                       doc: 'Turn off all pixels.', params: ['port'] },
        get_pixel: { sig: 'color_matrix.get_pixel(port, x, y) -> tuple[int, int]',  doc: 'Return (color, intensity) of a pixel.', params: ['port', 'x', 'y'] },
        set_pixel: { sig: 'color_matrix.set_pixel(port, x, y, pixel) -> None',      doc: 'Set a pixel. **pixel** = (color, intensity).', params: ['port', 'x', 'y', 'pixel'] },
        show:      { sig: 'color_matrix.show(port, pixels) -> None',                doc: 'Set all 9 pixels. **pixels** = list of (color, intensity) tuples.', params: ['port', 'pixels'] },
      },
    },

    app: {
      doc: 'Communicate with the SPIKE App (stubs — no-op in simulator).',
      members: {},
    },

    'app.sound': {
      doc: 'Play sounds through the app (no-op in simulator).',
      members: {
        play:           { sig: 'app.sound.play(sound_name, volume=100, pitch=0, pan=0) -> Awaitable', doc: 'Play a sound by name.', params: ['sound_name', 'volume', 'pitch', 'pan'] },
        stop:           { sig: 'app.sound.stop() -> None',                                            doc: 'Stop app sounds.', params: [] },
        set_attributes: { sig: 'app.sound.set_attributes(volume, pitch, pan) -> None',                doc: 'Set default playback attributes.', params: ['volume', 'pitch', 'pan'] },
      },
    },

    'app.music': {
      doc: 'Play instruments and drums through the app (no-op in simulator).',
      members: {
        play_drum:       { sig: 'app.music.play_drum(drum) -> None',                        doc: 'Play a drum. Use `app.music.DRUM_*` constants.', params: ['drum'] },
        play_instrument: { sig: 'app.music.play_instrument(instrument, note, duration) -> None', doc: 'Play an instrument note.\n\n**instrument** — `app.music.INSTRUMENT_*`\n**note** — MIDI 0–127\n**duration** — ms', params: ['instrument', 'note', 'duration'] },
      },
      constants: {
        DRUM_SNARE: '1', DRUM_BASS: '2', DRUM_SIDE_STICK: '3', DRUM_CRASH_CYMBAL: '4',
        DRUM_OPEN_HI_HAT: '5', DRUM_CLOSED_HI_HAT: '6', DRUM_TAMBOURINE: '7',
        DRUM_HAND_CLAP: '8', DRUM_CLAVES: '9', DRUM_WOOD_BLOCK: '10', DRUM_COWBELL: '11',
        DRUM_TRIANGLE: '12', DRUM_BONGO: '13', DRUM_CONGA: '14', DRUM_CABASA: '15',
        DRUM_GUIRO: '16', DRUM_VIBRASLAP: '17', DRUM_CUICA: '18',
        INSTRUMENT_PIANO: '1', INSTRUMENT_ELECTRIC_PIANO: '2', INSTRUMENT_ORGAN: '3',
        INSTRUMENT_GUITAR: '4', INSTRUMENT_ELECTRIC_GUITAR: '5', INSTRUMENT_BASS: '6',
        INSTRUMENT_PIZZICATO: '7', INSTRUMENT_CELLO: '8', INSTRUMENT_TROMBONE: '9',
        INSTRUMENT_CLARINET: '10', INSTRUMENT_SAXOPHONE: '11', INSTRUMENT_FLUTE: '12',
        INSTRUMENT_WOODEN_FLUTE: '13', INSTRUMENT_BASSOON: '14', INSTRUMENT_CHOIR: '15',
        INSTRUMENT_VIBRAPHONE: '16', INSTRUMENT_MUSIC_BOX: '17', INSTRUMENT_STEEL_DRUM: '18',
        INSTRUMENT_MARIMBA: '19', INSTRUMENT_SYNTH_LEAD: '20', INSTRUMENT_SYNTH_PAD: '21',
      },
    },

    'app.display': {
      doc: 'Show images on the app display (no-op in simulator).',
      members: {
        show:  { sig: 'app.display.show(fullscreen=False) -> None', doc: 'Show the display panel.', params: ['fullscreen'] },
        hide:  { sig: 'app.display.hide() -> None',                 doc: 'Hide the display panel.', params: [] },
        image: { sig: 'app.display.image(image) -> None',           doc: 'Show a built-in image.', params: ['image'] },
        text:  { sig: 'app.display.text(text) -> None',             doc: 'Display a text string.', params: ['text'] },
      },
      constants: {
        IMAGE_ROBOT_1: '1', IMAGE_ROBOT_2: '2', IMAGE_ROBOT_3: '3',
        IMAGE_ROBOT_4: '4', IMAGE_ROBOT_5: '5',
        IMAGE_HUB_1: '6', IMAGE_HUB_2: '7', IMAGE_HUB_3: '8', IMAGE_HUB_4: '9',
        IMAGE_AMUSEMENT_PARK: '10', IMAGE_BEACH: '11',
        IMAGE_HAUNTED_HOUSE: '12', IMAGE_CARNIVAL: '13',
        IMAGE_BOOKSHELF: '14', IMAGE_PLAYGROUND: '15',
        IMAGE_MOON: '16', IMAGE_CAVE: '17',
        IMAGE_OCEAN: '18', IMAGE_POLAR_BEAR: '19',
        IMAGE_PARK: '20', IMAGE_RANDOM: '21',
      },
    },

    'app.bargraph': {
      doc: 'Show bar graph data in the app (no-op in simulator).',
      members: {
        show:      { sig: 'app.bargraph.show(fullscreen=False) -> None',  doc: 'Show the bar graph.',          params: ['fullscreen'] },
        hide:      { sig: 'app.bargraph.hide() -> None',                  doc: 'Hide the bar graph.',          params: [] },
        set_value: { sig: 'app.bargraph.set_value(color, value) -> None', doc: 'Set a bar value.',             params: ['color', 'value'] },
        change:    { sig: 'app.bargraph.change(color, value) -> None',    doc: 'Change a bar value.',          params: ['color', 'value'] },
        get_value: { sig: 'app.bargraph.get_value(color) -> Awaitable',   doc: 'Get the current bar value.',   params: ['color'] },
        clear_all: { sig: 'app.bargraph.clear_all() -> None',             doc: 'Clear all bars.',              params: [] },
      },
    },

    'app.linegraph': {
      doc: 'Show line graph data in the app (no-op in simulator).',
      members: {
        show:        { sig: 'app.linegraph.show(fullscreen=False) -> None',   doc: 'Show the line graph.',          params: ['fullscreen'] },
        hide:        { sig: 'app.linegraph.hide() -> None',                   doc: 'Hide the line graph.',          params: [] },
        plot:        { sig: 'app.linegraph.plot(color, x, y) -> None',        doc: 'Add a data point.',             params: ['color', 'x', 'y'] },
        clear:       { sig: 'app.linegraph.clear(color) -> None',             doc: 'Clear a specific line.',        params: ['color'] },
        clear_all:   { sig: 'app.linegraph.clear_all() -> None',              doc: 'Clear all lines.',              params: [] },
        get_last:    { sig: 'app.linegraph.get_last(color) -> Awaitable',     doc: 'Get the last plotted value.',   params: ['color'] },
        get_average: { sig: 'app.linegraph.get_average(color) -> Awaitable',  doc: 'Get the average value.',        params: ['color'] },
        get_min:     { sig: 'app.linegraph.get_min(color) -> Awaitable',      doc: 'Get the minimum value.',        params: ['color'] },
        get_max:     { sig: 'app.linegraph.get_max(color) -> Awaitable',      doc: 'Get the maximum value.',        params: ['color'] },
      },
    },
  };

  // Top-level global names (shown before a dot)
  const SPIKE_GLOBALS = [
    'motor', 'motor_pair', 'color_sensor', 'distance_sensor', 'force_sensor',
    'hub', 'color', 'port', 'wait', 'runloop', 'orientation',
    'device', 'color_matrix', 'app',
  ];

  const MICROPYTHON_BUILTINS = [
    'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes', 'callable',
    'chr', 'dict', 'dir', 'divmod', 'enumerate', 'filter', 'float',
    'format', 'getattr', 'globals', 'hasattr', 'hex', 'id', 'int',
    'isinstance', 'issubclass', 'iter', 'len', 'list', 'map', 'max',
    'min', 'next', 'object', 'oct', 'ord', 'pow', 'print', 'range',
    'repr', 'reversed', 'round', 'set', 'setattr', 'sorted', 'str',
    'sum', 'super', 'tuple', 'type', 'zip',
    'True', 'False', 'None',
    'async', 'await', 'def', 'class', 'if', 'else', 'elif', 'for',
    'while', 'return', 'import', 'from', 'pass', 'break', 'continue',
    'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield',
    'and', 'or', 'not', 'in', 'is',
  ];

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function resolveApi(path) {
    return SPIKE_API[path] || null;
  }

  function makeRange(model, position, partialLen) {
    return {
      startLineNumber: position.lineNumber,
      endLineNumber:   position.lineNumber,
      startColumn:     position.column - partialLen,
      endColumn:       position.column,
    };
  }

  // ── CompletionItemProvider ───────────────────────────────────────────────────

  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],

    provideCompletionItems(model, position) {
      const line   = model.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1);

      // Dot completion — match the object path before the dot
      const dotMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_.]*)\.([\w]*)$/);
      if (dotMatch) {
        const path    = dotMatch[1];
        const partial = dotMatch[2];
        const node    = resolveApi(path);
        if (!node) return { suggestions: [] };

        const range       = makeRange(model, position, partial.length);
        const suggestions = [];

        for (const [name, info] of Object.entries(node.members || {})) {
          if (!name.startsWith(partial)) continue;
          suggestions.push({
            label:             name,
            kind:              monaco.languages.CompletionItemKind.Method,
            detail:            info.sig,
            documentation:     { value: info.doc, isTrusted: true },
            insertText:        name + '($0)',
            insertTextRules:   monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }

        for (const [name, value] of Object.entries(node.constants || {})) {
          if (!name.startsWith(partial)) continue;
          suggestions.push({
            label:         name,
            kind:          monaco.languages.CompletionItemKind.Constant,
            detail:        `= ${value}`,
            documentation: { value: `**${path}.${name}** = \`${value}\`` },
            insertText:    name,
            range,
          });
        }

        return { suggestions };
      }

      // Global completion
      const wordMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
      const partial2  = wordMatch ? wordMatch[1] : '';
      if (!partial2) return { suggestions: [] };

      const range2      = makeRange(model, position, partial2.length);
      const suggestions = [];

      for (const name of SPIKE_GLOBALS) {
        if (!name.startsWith(partial2)) continue;
        const node = SPIKE_API[name];
        suggestions.push({
          label:         name,
          kind:          monaco.languages.CompletionItemKind.Module,
          detail:        node?.doc || '',
          documentation: { value: node?.doc || '' },
          insertText:    name,
          range:         range2,
        });
      }

      for (const w of MICROPYTHON_BUILTINS) {
        if (!w.startsWith(partial2)) continue;
        suggestions.push({
          label:      w,
          kind:       monaco.languages.CompletionItemKind.Keyword,
          insertText: w,
          range:      range2,
        });
      }

      return { suggestions };
    },
  });

  // ── SignatureHelpProvider ────────────────────────────────────────────────────

  monaco.languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters:    ['(', ','],
    signatureHelpRetriggerCharacters:  [','],

    provideSignatureHelp(model, position) {
      const line   = model.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1);

      // Walk backward to find the innermost unclosed '('
      let depth = 0, callStart = -1;
      for (let i = before.length - 1; i >= 0; i--) {
        if (before[i] === ')') { depth++; }
        else if (before[i] === '(') {
          if (depth === 0) { callStart = i; break; }
          depth--;
        }
      }
      if (callStart === -1) return null;

      // Extract the function/method path before '('
      const funcMatch = before.slice(0, callStart).match(/([a-zA-Z_][a-zA-Z0-9_.]+)$/);
      if (!funcMatch) return null;

      const fullPath   = funcMatch[1];
      const lastDot    = fullPath.lastIndexOf('.');
      if (lastDot === -1) return null;

      const objPath    = fullPath.slice(0, lastDot);
      const methodName = fullPath.slice(lastDot + 1);
      const node       = resolveApi(objPath);
      if (!node?.members?.[methodName]) return null;

      const info         = node.members[methodName];
      const argsText     = before.slice(callStart + 1);
      const activeParam  = (argsText.match(/,/g) || []).length;

      return {
        value: {
          signatures: [{
            label:         info.sig,
            documentation: { value: info.doc },
            parameters:    (info.params || []).map(p => ({ label: p })),
          }],
          activeSignature: 0,
          activeParameter: Math.min(activeParam, (info.params || []).length - 1),
        },
        dispose() {},
      };
    },
  });

  // ── HoverProvider ────────────────────────────────────────────────────────────

  monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const line  = model.getLineContent(position.lineNumber);
      const col   = position.column - 1;

      // Expand selection left and right to capture dotted identifier
      let start = col, end = col;
      while (start > 0 && /[\w.]/.test(line[start - 1])) start--;
      while (end < line.length && /[\w.]/.test(line[end])) end++;
      const fullWord = line.slice(start, end);

      // Try dotted path (e.g. hub.light_matrix.write)
      const lastDot = fullWord.lastIndexOf('.');
      if (lastDot !== -1) {
        const objPath    = fullWord.slice(0, lastDot);
        const memberName = fullWord.slice(lastDot + 1);
        const node       = resolveApi(objPath);
        if (node?.members?.[memberName]) {
          const info = node.members[memberName];
          return {
            contents: [
              { value: '```python\n' + info.sig + '\n```' },
              { value: info.doc },
            ],
          };
        }
        // Hover on the object itself
        const objNode = resolveApi(objPath);
        if (objNode?.doc) {
          return { contents: [{ value: `**${objPath}** — ${objNode.doc}` }] };
        }
      }

      // Top-level module hover
      const node = resolveApi(fullWord);
      if (node?.doc) {
        return { contents: [{ value: `**${fullWord}** — ${node.doc}` }] };
      }

      return null;
    },
  });
};

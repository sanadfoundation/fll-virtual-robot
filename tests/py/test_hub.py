"""Tests for hub, speaker, light_matrix, and color constants (SPIKE3 spec)."""
import unittest
import mock_js
import spike_bridge as sb


class TestLightMatrix(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_write(self):
        sb.hub.light_matrix.write('Hello')
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'hub_display', 'text': 'Hello'}])

    def test_write_converts_to_str(self):
        sb.hub.light_matrix.write(42)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['text'], '42')
        self.assertIsInstance(cmd['text'], str)

    def test_clear(self):
        sb.hub.light_matrix.clear()
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'hub_display_off'}])

    def test_off_alias(self):
        sb.hub.light_matrix.off()
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'hub_display_off'}])

    def test_set_pixel(self):
        sb.hub.light_matrix.set_pixel(2, 3, 80)
        self.assertEqual(mock_js.bridge_mock.all(), [
            {'type': 'hub_pixel', 'x': 2, 'y': 3, 'brightness': 80},
        ])

    def test_set_pixel_default_intensity(self):
        sb.hub.light_matrix.set_pixel(0, 0)
        self.assertEqual(mock_js.bridge_mock.all()[0]['brightness'], 100)

    def test_show_image(self):
        sb.hub.light_matrix.show_image('HAPPY')
        self.assertEqual(mock_js.bridge_mock.all()[0], {'type': 'hub_image', 'image': 'HAPPY'})

    def test_write_then_clear(self):
        sb.hub.light_matrix.write('Hi')
        sb.hub.light_matrix.clear()
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 2)
        self.assertEqual(cmds[0]['type'], 'hub_display')
        self.assertEqual(cmds[1]['type'], 'hub_display_off')


class TestLightMatrixOrientation(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()
        # Reset the orientation slot in _state between tests.
        sb._state['orientation'] = 0

    def test_get_orientation_defaults_to_zero(self):
        self.assertEqual(sb.hub.light_matrix.get_orientation(), 0)

    def test_set_orientation_dispatches_hub_orientation_command(self):
        sb.hub.light_matrix.set_orientation(1)  # RIGHT
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(cmds[0], {'type': 'hub_orientation', 'mode': 'set', 'top': 1})

    def test_set_orientation_returns_previous_value(self):
        # Per LEGO docs: set_orientation returns the orientation that was
        # active before the call. We rely on _state being kept in sync so
        # the call is synchronous (no await needed).
        sb._state['orientation'] = 2
        prev = sb.hub.light_matrix.set_orientation(3)
        self.assertEqual(prev, 2)

    def test_set_orientation_updates_local_state_for_get(self):
        # get_orientation should reflect the new value immediately, without
        # waiting for the bridge round-trip.
        sb.hub.light_matrix.set_orientation(3)
        self.assertEqual(sb.hub.light_matrix.get_orientation(), 3)

    def test_set_orientation_wraps_into_0_3(self):
        sb.hub.light_matrix.set_orientation(5)
        self.assertEqual(sb.hub.light_matrix.get_orientation(), 1)
        sb.hub.light_matrix.set_orientation(-1)
        self.assertEqual(sb.hub.light_matrix.get_orientation(), 3)


class TestSpeaker(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_beep_default_queues_command(self):
        sb.hub.speaker.beep()
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 1)
        cmd = cmds[0]
        self.assertEqual(cmd['type'], 'beep')
        self.assertEqual(cmd['note'], 69)
        self.assertAlmostEqual(cmd['duration'], 0.5)

    def test_beep_custom_freq(self):
        sb.hub.speaker.beep(freq=880, duration=1000)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['note'], 81)
        self.assertAlmostEqual(cmd['duration'], 1.0)

    def test_beep_220hz(self):
        sb.hub.speaker.beep(freq=220)
        self.assertEqual(mock_js.bridge_mock.all()[0]['note'], 57)


class TestHubSound(unittest.TestCase):
    """`hub.sound` is the documented LEGO surface; `hub.speaker` is the legacy
    alias kept for backwards compatibility. They share a single underlying
    instance so any divergence (e.g. patching one but not the other) is
    impossible, and dispatches via either name produce identical bridge
    payloads."""

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_hub_sound_is_the_same_object_as_hub_speaker(self):
        self.assertIs(sb.hub.sound, sb.hub.speaker)

    def test_hub_sound_beep_emits_the_same_command_as_hub_speaker_beep(self):
        sb.hub.sound.beep(freq=440, duration=500)
        from_sound = mock_js.bridge_mock.all()
        mock_js.bridge_mock.install()  # reset
        sb.hub.speaker.beep(freq=440, duration=500)
        from_speaker = mock_js.bridge_mock.all()
        self.assertEqual(from_sound, from_speaker)
        self.assertEqual(from_sound[0]['type'], 'beep')

    def test_hub_sound_default_beep(self):
        sb.hub.sound.beep()
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'], 'beep')
        self.assertEqual(cmd['note'], 69)
        self.assertAlmostEqual(cmd['duration'], 0.5)


class TestMotionSensor(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_motion_sensor_attribute_exists(self):
        self.assertTrue(hasattr(sb.hub, 'motion_sensor'))

    def test_tilt_angles_returns_tuple(self):
        result = sb.hub.motion_sensor.tilt_angles()
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 3)

    def test_reset_yaw_sends_reset_yaw_command(self):
        sb.hub.motion_sensor.reset_yaw()
        self.assertEqual(mock_js.bridge_mock.last(), {'type': 'reset_yaw', 'angle_dDeg': 0})


class TestHubButton(unittest.TestCase):

    def test_pressed_returns_int(self):
        result = sb.hub.button.pressed(sb.hub.button.LEFT)
        self.assertIsInstance(result, int)
        self.assertEqual(result, 0)

    def test_button_constants(self):
        self.assertEqual(sb.hub.button.LEFT,  1)
        self.assertEqual(sb.hub.button.RIGHT, 2)


class TestHubLight(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_light_constants(self):
        self.assertEqual(sb.hub.light.POWER,   0)
        self.assertEqual(sb.hub.light.CONNECT, 1)

    def test_color_dispatches_hub_light_command(self):
        sb.hub.light.color(sb.hub.light.POWER, sb.color.GREEN)
        self.assertEqual(mock_js.bridge_mock.all(), [
            {'type': 'hub_light', 'light': 0, 'color': 6},
        ])

    def test_color_passes_unknown_through(self):
        # The simulator clamps unknown ints to 0 (off); the bridge stays a
        # pass-through so we don't lose information at the boundary.
        sb.hub.light.color(sb.hub.light.POWER, sb.color.UNKNOWN)
        self.assertEqual(mock_js.bridge_mock.all()[0]['color'], -1)

    def test_color_off_is_black(self):
        # color.BLACK = 0 is the documented "off" value for the centre button.
        sb.hub.light.color(sb.hub.light.POWER, sb.color.BLACK)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['light'], 0)
        self.assertEqual(cmd['color'], 0)


class TestColorConstants(unittest.TestCase):

    def test_color_integers(self):
        self.assertEqual(sb.color.BLACK,     0)
        self.assertEqual(sb.color.MAGENTA,   1)
        self.assertEqual(sb.color.PURPLE,    2)
        self.assertEqual(sb.color.BLUE,      3)
        self.assertEqual(sb.color.AZURE,     4)
        self.assertEqual(sb.color.TURQUOISE, 5)
        self.assertEqual(sb.color.GREEN,     6)
        self.assertEqual(sb.color.YELLOW,    7)
        self.assertEqual(sb.color.ORANGE,    8)
        self.assertEqual(sb.color.RED,       9)
        self.assertEqual(sb.color.WHITE,     10)
        self.assertEqual(sb.color.UNKNOWN,   -1)

    def test_color_sensor_returns_int(self):
        mock_js.bridge_mock.install()
        result = sb.color_sensor.color('C')
        self.assertIsInstance(result, int)
        self.assertEqual(result, -1)


class TestPortConstants(unittest.TestCase):

    def test_port_ints(self):
        # Match the official LEGO docs: port.A..F = 0..5.
        for i, p in enumerate('ABCDEF'):
            self.assertEqual(getattr(sb.port, p), i)

    def test_hub_port_namespace(self):
        # Docs publish hub.port as a sub-module; we expose the same constants.
        for i, p in enumerate('ABCDEF'):
            self.assertEqual(getattr(sb.hub.port, p), i)


class TestStubModules(unittest.TestCase):

    def test_import_orientation(self):
        import orientation as o
        self.assertEqual(o.UP, 0)
        self.assertEqual(o.RIGHT, 1)
        self.assertEqual(o.DOWN, 2)
        self.assertEqual(o.LEFT, 3)

    def test_import_app_sound(self):
        import app as a
        a.sound.play('test')

    def test_import_color_matrix(self):
        import color_matrix as cm
        cm.clear('A')

    def test_import_device(self):
        import device as d
        self.assertEqual(d.id('A'), 0)
        self.assertFalse(d.ready('A'))

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


class TestMotionSensor(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_motion_sensor_attribute_exists(self):
        self.assertTrue(hasattr(sb.hub, 'motion_sensor'))

    def test_tilt_angles_returns_tuple(self):
        result = sb.hub.motion_sensor.tilt_angles()
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 3)

    def test_reset_yaw_no_command(self):
        sb.hub.motion_sensor.reset_yaw()
        self.assertEqual(mock_js.bridge_mock.all(), [])


class TestHubButton(unittest.TestCase):

    def test_pressed_returns_int(self):
        result = sb.hub.button.pressed(sb.hub.button.LEFT)
        self.assertIsInstance(result, int)
        self.assertEqual(result, 0)

    def test_button_constants(self):
        self.assertEqual(sb.hub.button.LEFT,  1)
        self.assertEqual(sb.hub.button.RIGHT, 2)


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
        result = sb.color_sensor.color('E')
        self.assertIsInstance(result, int)
        self.assertEqual(result, -1)


class TestPortConstants(unittest.TestCase):

    def test_port_strings(self):
        for p in ['A', 'B', 'C', 'D', 'E', 'F']:
            self.assertEqual(getattr(sb.port, p), p)


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

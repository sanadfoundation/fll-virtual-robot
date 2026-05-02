"""Characterize hub display, pixel, and speaker command schemas."""
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

    def test_off(self):
        sb.hub.light_matrix.off()
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'hub_display_off'}])

    def test_set_pixel(self):
        sb.hub.light_matrix.set_pixel(2, 3, 80)
        self.assertEqual(mock_js.bridge_mock.all(), [
            {'type': 'hub_pixel', 'x': 2, 'y': 3, 'brightness': 80},
        ])

    def test_set_pixel_default_brightness(self):
        sb.hub.light_matrix.set_pixel(0, 0)
        self.assertEqual(mock_js.bridge_mock.all()[0]['brightness'], 100)

    def test_show_image(self):
        sb.hub.light_matrix.show_image('HAPPY')
        self.assertEqual(mock_js.bridge_mock.all()[0], {'type': 'hub_image', 'image': 'HAPPY'})

    def test_sequence_write_then_off(self):
        sb.hub.light_matrix.write('Hi')
        sb.hub.light_matrix.off()
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 2)
        self.assertEqual(cmds[0]['type'], 'hub_display')
        self.assertEqual(cmds[1]['type'], 'hub_display_off')


class TestSpeaker(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_beep_default(self):
        sb.hub.speaker.beep()
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'beep', 'note': 60, 'duration': 0.2}])

    def test_beep_custom(self):
        sb.hub.speaker.beep(note=72, seconds=0.5)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['note'],     72)
        self.assertEqual(cmd['duration'], 0.5)

    def test_play_notes(self):
        sb.hub.speaker.play_notes(['C4:1', 'D4:1'], tempo=120)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],  'play_notes')
        self.assertEqual(cmd['notes'], ['C4:1', 'D4:1'])
        self.assertEqual(cmd['tempo'], 120)


class TestColorConstants(unittest.TestCase):

    def test_color_strings(self):
        self.assertEqual(sb.color.BLACK,   'black')
        self.assertEqual(sb.color.RED,     'red')
        self.assertEqual(sb.color.GREEN,   'green')
        self.assertEqual(sb.color.YELLOW,  'yellow')
        self.assertEqual(sb.color.BLUE,    'blue')
        self.assertEqual(sb.color.WHITE,   'white')
        self.assertEqual(sb.color.CYAN,    'cyan')
        self.assertEqual(sb.color.MAGENTA, 'magenta')
        self.assertEqual(sb.color.ORANGE,  'orange')
        self.assertEqual(sb.color.NONE,    'none')


class TestPortConstants(unittest.TestCase):

    def test_port_strings(self):
        for p in ['A', 'B', 'C', 'D', 'E', 'F']:
            self.assertEqual(getattr(sb.port, p), p)

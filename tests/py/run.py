"""
Entry point: python3 tests/py/run.py
"""
import sys
import os
import unittest

_here = os.path.dirname(os.path.abspath(__file__))
_repo_py = os.path.normpath(os.path.join(_here, '..', '..', 'py'))

sys.path.insert(0, _here)
sys.path.insert(0, _repo_py)

import mock_js
sys.modules['js'] = mock_js

import test_motor_pair
import test_motor
import test_hub
import test_wait
import test_print

loader = unittest.TestLoader()
suite  = unittest.TestSuite()
for mod in [test_motor_pair, test_motor, test_hub, test_wait, test_print]:
    suite.addTests(loader.loadTestsFromModule(mod))

runner = unittest.TextTestRunner(verbosity=2)
result = runner.run(suite)
sys.exit(0 if result.wasSuccessful() else 1)

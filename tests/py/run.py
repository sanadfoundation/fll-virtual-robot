"""
Entry point: python3 tests/py/run.py

Injects mock_js into sys.modules['js'] before importing spike_bridge,
then discovers and runs all test_*.py modules in this directory.
"""
import sys
import os
import unittest

_here = os.path.dirname(os.path.abspath(__file__))
_repo_py = os.path.normpath(os.path.join(_here, '..', '..', 'py'))

# 1. Make this directory importable (for mock_js and test_* modules).
sys.path.insert(0, _here)

# 2. Make spike_bridge importable.
sys.path.insert(0, _repo_py)

# 3. Inject the fake `js` module BEFORE spike_bridge is imported.
import mock_js
sys.modules['js'] = mock_js

# 4. Import test modules (they will `import spike_bridge` which is now safe).
import test_motor_pair
import test_motor
import test_hub
import test_wait

# 5. Discover and run.
loader = unittest.TestLoader()
suite  = unittest.TestSuite()
for mod in [test_motor_pair, test_motor, test_hub, test_wait]:
    suite.addTests(loader.loadTestsFromModule(mod))

runner = unittest.TextTestRunner(verbosity=2)
result = runner.run(suite)
sys.exit(0 if result.wasSuccessful() else 1)

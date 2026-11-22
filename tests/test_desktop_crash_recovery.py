"""A-1 · Kill the real desktop service, restart it, and open the project at once.

Runs desktop/service.py as a child process with the same stdin handshake the
Windows host uses, speaking to it with the desktop's private Host/Origin and
secret headers. A killed instance cannot release its renderer lease; the
restarted instance must release it from SessionJournal, so a second renderer
session can open the project without waiting for the 60 s lease expiry.
Requires the upstream checkout on PYTHONPATH (CI runs it after package.py).
"""
import http.client
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from desktop.service import HOST  # noqa: E402

TOKEN = 'a' * 44
try:  # The offline lane has no upstream checkout; the real service needs it.
    import opendirector_api  # noqa: F401
    UPSTREAM = True
except ImportError:
    UPSTREAM = False


class Service:
    def __init__(self, data: Path, state: Path):
        env = dict(os.environ, OPENDIRECTOR_ROOT=str(data), OD_DESKTOP_STATE=str(state))
        self.process = subprocess.Popen([sys.executable, str(ROOT / 'desktop' / 'service.py')],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env, text=True)
        self.process.stdin.write(TOKEN + '\n')
        self.process.stdin.flush()
        self.port = None
        deadline = time.time() + 60
        while time.time() < deadline:
            line = self.process.stdout.readline()
            if line.startswith('OD-DESKTOP-READY'):
                self.port = int(line.split()[1])
                return
            if not line and self.process.poll() is not None:
                break
        raise RuntimeError('desktop service did not become ready')

    def request(self, method, path, session=None, body=None):
        headers = {'Host': HOST, 'Origin': 'http://' + HOST, 'X-OpenDirector-Desktop': TOKEN,
                   'X-OpenDirector-Request': '1', 'Content-Type': 'application/json'}
        if session:
            headers['X-OpenDirector-Session'] = session
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=30)
        connection.request(method, '/api' + path, body=json.dumps(body) if body is not None else None, headers=headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response.status, data

    def kill(self):
        self.process.send_signal(signal.SIGKILL)
        self.process.wait(timeout=30)

    def stop(self):
        if self.process.poll() is None:
            self.process.stdin.write('\n')
            self.process.stdin.flush()
            try:
                self.process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process.stdout.close()


@unittest.skipUnless(UPSTREAM, 'needs the upstream OpenDirector packages (run after package.py or on PYTHONPATH)')
class DesktopCrashRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = Path(self.tmp.name) / 'data'
        self.state = Path(self.tmp.name) / 'state'
        self.state.mkdir()
        self.service = None

    def tearDown(self):
        if self.service:
            self.service.stop()
        self.tmp.cleanup()

    def test_killed_renderer_lease_is_released_on_restart(self):
        self.service = Service(self.data, self.state)
        project = str(uuid.uuid4())
        status, _ = self.service.request('POST', f'/creation/projects/{project}/commands', body={
            'type': 'project.create', 'projectId': project, 'commandId': str(uuid.uuid4()), 'payload': {'name': '强杀'}})
        self.assertEqual(status, 200)
        first = str(uuid.uuid4())
        status, _ = self.service.request('POST', f'/creation/projects/{project}/open', session=first)
        self.assertEqual(status, 200)
        # A second renderer session is blocked while the first lease is alive.
        status, _ = self.service.request('POST', f'/creation/projects/{project}/open', session=str(uuid.uuid4()))
        self.assertNotEqual(status, 200)

        self.service.kill()
        self.service = Service(self.data, self.state)
        status, body = self.service.request('POST', f'/creation/projects/{project}/open', session=str(uuid.uuid4()))
        self.assertEqual(status, 200, body[:300])
        # The restarted instance consumed the old journal; only its own session is recorded now.
        recorded = (self.state / 'sessions.txt').read_text().split() if (self.state / 'sessions.txt').exists() else []
        self.assertNotIn(first, recorded)


if __name__ == '__main__':
    unittest.main()

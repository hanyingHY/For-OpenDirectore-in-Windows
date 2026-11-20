"""Private desktop transport around the OpenDirector ASGI app."""
import asyncio
import hashlib
import hmac
import os
import re
import socket
import sys
import threading
from pathlib import Path

# Browser storage namespace only. No process needs to listen on this port.
HOST = '127.0.0.1:48765'
ORIGIN = 'http://' + HOST


class SessionJournal:
    """Remembers the renderer sessions this desktop instance observed.

    A killed process cannot release its leases; the next launch would find its
    own dead sessions still holding projects "open elsewhere" until they
    expire. The journal survives the kill, so startup can release exactly the
    previous instance's renderer sessions. Only sessions observed on the
    renderer origin (``HOST``) are recorded — independent CLI processes talk to
    the dynamic service port and never appear here, so their leases are never
    taken over."""

    def __init__(self, path):
        self.path = Path(path)
        try:
            self.sessions = {line for line in self.path.read_text(encoding='ascii').split() if line}
        except (OSError, UnicodeDecodeError):
            self.sessions = set()

    def record(self, session):
        if session in self.sessions:
            return
        self.sessions.add(session)
        self._write()

    def _write(self):
        try:
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(''.join(s + '\n' for s in sorted(self.sessions)), encoding='ascii')
            os.replace(temporary, self.path)
        except OSError:
            pass

    def restore(self, store):
        """Release every recorded lease (a previous instance's leftovers)."""
        for session in sorted(self.sessions):
            store.release(session)
        self.clear()

    def clear(self):
        self.sessions = set()
        try:
            self.path.unlink()
        except OSError:
            pass


class DesktopSession:
    def __init__(self, app, token, port=None, journal=None):
        self.app = app
        self.browser_sessions = set()
        self.journal = journal
        self.token = token
        self.hosts = {HOST.encode()}
        if port:
            self.hosts.add(f'127.0.0.1:{port}'.encode())

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http':
            headers = dict(scope['headers'])
            host = headers.get(b'host', b'')
            same_origin = host in self.hosts and headers.get(b'origin', b'http://'+host) == b'http://'+host
            challenge = re.fullmatch(r'/__desktop/probe/([a-f0-9]{32})', scope.get('path', ''))
            if same_origin and challenge:
                proof = hmac.new(self.token, challenge[1].encode(), hashlib.sha256).hexdigest().encode()
                await send({'type': 'http.response.start', 'status': 200, 'headers': [(b'cache-control', b'no-store')]})
                await send({'type': 'http.response.body', 'body': proof})
                return
            if not same_origin or not hmac.compare_digest(headers.get(b'x-opendirector-desktop', b''), self.token):
                await send({'type': 'http.response.start', 'status': 403, 'headers': []})
                await send({'type': 'http.response.body', 'body': b'Private desktop session'})
                return
            # Release only leases observed on this launch's renderer. Never
            # clear all projects or take over leases held by independent CLIs.
            if host == HOST.encode():
                sid = headers.get(b'x-opendirector-session', b'')
                if re.fullmatch(rb'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', sid):
                    self.browser_sessions.add(sid.decode())
                    if self.journal is not None:
                        self.journal.record(sid.decode())
        await self.app(scope, receive, send)


def main():
    token = sys.stdin.buffer.readline().strip()
    if len(token) != 44: raise RuntimeError('Desktop handshake missing')
    import uvicorn
    from opendirector_api.main import create_app
    with socket.socket() as listener:
        if os.name == 'nt': listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
        os.environ['OPENDIRECTOR_API_URL'] = f'http://127.0.0.1:{port}'
        class Service(uvicorn.Server):
            async def startup(self, sockets=None):
                await super().startup(sockets=sockets)
                if self.started:
                    print(f'OD-DESKTOP-READY {port}', flush=True)

        from opendirector.infrastructure.local_projects import LocalProjects
        from opendirector.installation import data_root
        store = LocalProjects(data_root())
        # A crashed previous instance cannot release its renderer leases; the
        # journal remembers them across the kill so the canvas opens at once
        # instead of waiting out every lease. Independent CLI leases are never
        # journalled (see SessionJournal).
        journal = SessionJournal(Path(os.environ.get('OD_DESKTOP_STATE', os.getcwd())) / 'sessions.txt')
        journal.restore(store)
        session = DesktopSession(create_app(store=store), token, port, journal)
        server = Service(uvicorn.Config(session, log_level='warning', access_log=False, proxy_headers=False))
        def stop():
            sys.stdin.buffer.readline()
            server.should_exit = True
        threading.Thread(target=stop, daemon=True).start()
        asyncio.run(server.serve(sockets=[listener]))
        for sid in session.browser_sessions:
            store.release(sid)
        journal.clear()
        print('OD-DESKTOP-STOPPED', flush=True)

if __name__ == '__main__': main()

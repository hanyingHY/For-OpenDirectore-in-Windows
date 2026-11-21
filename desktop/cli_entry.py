"""Use the authenticated desktop service unless the caller selected another URL."""
import hashlib
import hmac
import os
from uuid import uuid4

import httpx
from opendirector import cli

record = os.environ.pop('OD_LOCAL_TICKET', '').split('\n')
port = int(record[0]) if len(record) == 2 and record[0].isdigit() else 0
valid = 0 < port <= 65535 and len(record[1]) == 44
# Port zero is a non-routable sentinel. A stopped desktop must not silently
# send project commands to an unrelated upstream development service on 18000.
origin = httpx.URL(f'http://127.0.0.1:{port if valid else 0}')
os.environ.setdefault('OPENDIRECTOR_API_URL', str(origin))
unavailable = 'Open or restart OpenDirector, then retry. / 请打开或重启 OpenDirector 后重试。'


class DesktopClient(cli.Client):
    def __init__(self, project, url, session, operation_id):
        super().__init__(project, url, session, operation_id)
        if self.http.base_url != origin:
            return
        verified = False

        def authorize(request):
            nonlocal verified
            if (request.url.scheme, request.url.host, request.url.port) != (origin.scheme, origin.host, origin.port):
                return
            if not valid:
                raise ValueError(unavailable)
            if not verified:
                nonce = uuid4().hex
                expected = hmac.new(record[1].encode(), nonce.encode(), hashlib.sha256).hexdigest().encode()
                # Independent client: the proof request never invokes this hook
                # or carries a ticket. Render help without opening any socket.
                try:
                    with httpx.Client(trust_env=False, timeout=3) as probe:
                        with probe.stream('GET', origin.join('/__desktop/probe/'+nonce)) as r:
                            proof = bytearray()
                            for chunk in r.iter_raw(chunk_size=65):
                                proof.extend(chunk)
                                if len(proof) > 64: break
                            verified = r.status_code == 200 and hmac.compare_digest(proof, expected)
                except httpx.HTTPError:
                    raise ValueError(unavailable) from None
                if not verified:
                    raise ValueError(unavailable)
            request.headers['X-OpenDirector-Desktop'] = record[1]

        self.http.event_hooks['request'].append(authorize)


cli.Client = DesktopClient
cli.main()

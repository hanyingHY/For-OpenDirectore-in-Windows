"""Windows CI: verify the real signed release, reject tampering, launch NSIS, observe restart."""
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from desktop import update


def main():
    delivery = ROOT/'delivery'
    version = (ROOT/'desktop/VERSION').read_text().strip()
    # The fixture supplies transport bytes, not the trusted signer, version
    # validator, installer, Windows mutex or restarted process.
    previous = '0.1.4-desktop.2'
    meta = (delivery/update.MANIFEST).read_bytes(); proof = (delivery/update.BUNDLE).read_bytes()
    try: update.authenticate(meta+b' ',proof)
    except Exception: pass
    else: raise AssertionError('Tampered signed descriptor accepted')
    def get(url):
        if url==update.FEED:
            return io.BytesIO(json.dumps([dict(tag_name='windows-x64-'+version,draft=False,prerelease=False)]).encode())
        return (delivery/url.rsplit('/',1)[1]).open('rb')
    app = Path(os.environ['LOCALAPPDATA'])/'Programs/OpenDirector/app'
    with TemporaryDirectory(prefix='OD 更新 ') as tmp:
        cache=Path(tmp)/'cache'
        assert update.stage(previous,cache,get)==version
        # Hold a known parent process open; no application resources may be
        # exchanged until that process has actually exited.
        parent = subprocess.Popen([sys.executable,'-c','import sys; sys.stdin.read()'], stdin=subprocess.PIPE)
        try:
            update.handoff(previous,cache,version,parent.pid)
            time.sleep(2)
            assert not (app/'VERSION').exists()
        finally:
            parent.stdin.close(); parent.wait(timeout=10)
        deadline = time.monotonic()+180
        while time.monotonic()<deadline:
            if (app/'VERSION').exists() and (app/'VERSION').read_text().strip()==version:
                # Host creates a DPAPI ticket only after its backend is ready.
                ticket=Path(os.environ['LOCALAPPDATA'])/'OpenDirector/Desktop/session.bin'
                if ticket.is_file():
                    result=subprocess.run([str(app/'OpenDirector-CLI.exe'),'project','list'],capture_output=True,timeout=20)
                    if result.returncode==0 and 'projects' in json.loads(result.stdout):
                        print('PASS: signed manifest + installer digest + parent wait + native install + automatic backend restart')
                        return
            time.sleep(1)
        raise RuntimeError('Updated application did not restart with a usable local service')


if __name__=='__main__': main()

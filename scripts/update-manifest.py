"""Create the release descriptor to be signed after Windows acceptance passes."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
version = (root/'desktop/VERSION').read_text().strip()
folder = Path(sys.argv[1]); exe = folder/f'OpenDirector-{version}-x64-Setup.exe'
with exe.open('rb') as f: digest = hashlib.file_digest(f, 'sha256').hexdigest()
(folder/'windows-update.json').write_bytes((json.dumps(dict(schema=1, channel='windows-x64-stable',
    version=version, file=exe.name, size=exe.stat().st_size, sha256=digest), sort_keys=True)+'\n').encode())

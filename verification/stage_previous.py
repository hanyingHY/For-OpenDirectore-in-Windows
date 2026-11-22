"""CI transport fixture for a draft. Run with the PREVIOUS installed interpreter.

Only release discovery/download is substituted. Stage with the previous
packaged updater and its trust root into its normal cache; the calling script
then invokes that updater's actual --install entry point.
"""
import importlib.util
import io
import json
import os
from pathlib import Path
import sys


def main():
    app = Path(sys.executable).resolve().parents[1]
    source = importlib.util.spec_from_file_location('installed_update', app / 'update.py')
    update = importlib.util.module_from_spec(source)
    source.loader.exec_module(update)
    delivery = Path(sys.argv[1]).resolve()
    version = sys.argv[2]
    previous = (app / 'VERSION').read_text().strip()
    assert previous == sys.argv[3] and update.number(previous) < update.number(version)
    tag = 'windows-x64-' + version
    base = f'https://github.com/{update.REPO}/releases/download/{tag}/'
    assets = {base+name: delivery/name for name in (update.MANIFEST, update.BUNDLE, update.installer_name(version))}

    def fetch(url):
        if url == update.FEED:
            return io.BytesIO(json.dumps([dict(tag_name=tag, draft=False, prerelease=False)]).encode())
        return assets[url].open('rb')

    cache = Path(os.environ['LOCALAPPDATA']) / 'OpenDirector/Desktop/updates'
    assert update.stage(previous, cache, fetch) == version
    print(f'PASS: installed {previous} authenticated {version} with its bundled verifier')


if __name__ == '__main__': main()

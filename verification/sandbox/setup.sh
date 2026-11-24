#!/bin/bash
# Rebuild the Linux verification sandbox: upstream 0.1.5 + the package.py patch chain,
# npm/pip deps, Chromium 131 (from @sparticuz/chromium, the only browser the sandbox can
# fetch), ffmpeg (PyPI imageio-ffmpeg), ffprobe (npm), CJK font (npm). Idempotent enough to re-run.
set -euo pipefail
REPO="${REPO:-$HOME/For-OpenDirectore-in-Windows}"
SHA=8258d4b016496d81a7c824e4cdfa42f3c840d5eb
SRC=/tmp/src; BROWSER=/tmp/browser; LIBS=/tmp/libs
if [ ! -d "$SRC/packages" ]; then
  rm -rf "$SRC" && mkdir -p "$SRC"
  curl -sL "https://codeload.github.com/ThinkFlowLab/OpenDirector/tar.gz/$SHA" -o /tmp/up.tgz
  tar xzf /tmp/up.tgz -C "$SRC" --strip-components=1
  (cd "$SRC" && git init -q && for p in canvas-placement bundled-agent timeline-output-dismiss agent-gateway-terminal-failure export-signal-contract open-elsewhere-autoretry agent-run-lease work-mode export-fallback-copy agent-plan-mode agent-round-undo; do git apply "$REPO/patches/$p.patch"; done)
fi
mkdir -p "$HOME/bin"
[ -x "$HOME/bin/ffmpeg" ] || { pip install -q --user --break-system-packages imageio-ffmpeg; ln -sf "$(python3 -c 'import imageio_ffmpeg as i;print(i.get_ffmpeg_exe())')" "$HOME/bin/ffmpeg"; }
if [ ! -x "$HOME/bin/ffprobe" ]; then
  mkdir -p /tmp/ffp && (cd /tmp/ffp && npm install --no-save --no-package-lock @ffprobe-installer/ffprobe >/dev/null 2>&1)
  ln -sf "$(node -e "console.log(require('/tmp/ffp/node_modules/@ffprobe-installer/ffprobe').path)")" "$HOME/bin/ffprobe"
fi
mkdir -p "$BROWSER" && (cd "$BROWSER" && npm install --no-save --no-package-lock @sparticuz/chromium@131 playwright-core@1.58.2 >/dev/null 2>&1)
if [ ! -d "$LIBS/lib" ]; then
  mkdir -p "$LIBS" && cd "$LIBS"
  for f in al2023 al2; do node -e "require('fs').writeFileSync('$f.tar',require('zlib').brotliDecompressSync(require('fs').readFileSync('$BROWSER/node_modules/@sparticuz/chromium/bin/$f.tar.br')))"; tar xf $f.tar; done
  node -e "import('$BROWSER/node_modules/@sparticuz/chromium/build/index.js').then(async m=>{await m.default.executablePath()}).catch(()=>{})" >/dev/null 2>&1 || true
  cp "$BROWSER/node_modules/@sparticuz/chromium/bin/chromium.br" /tmp/chromium.br 2>/dev/null || true
fi
if [ ! -x /tmp/chromium ]; then
  node -e "require('fs').writeFileSync('/tmp/chromium',require('zlib').brotliDecompressSync(require('fs').readFileSync('$BROWSER/node_modules/@sparticuz/chromium/bin/chromium.br')));require('fs').chmodSync('/tmp/chromium',0o755)"
fi
mkdir -p "$HOME/.local/share/fonts" && if [ ! -f "$HOME/.local/share/fonts/NotoSansSC_400Regular.ttf" ]; then
  mkdir -p /tmp/cjk && (cd /tmp/cjk && npm install --no-save --no-package-lock @expo-google-fonts/noto-sans-sc >/dev/null 2>&1)
  cp /tmp/cjk/node_modules/@expo-google-fonts/noto-sans-sc/400Regular/*.ttf "$HOME/.local/share/fonts/"
fi
cd "$SRC" && npm ci --no-audit --no-fund >/tmp/npmci.log 2>&1
pip install -q --user --break-system-packages -r requirements.txt >/tmp/pip.log 2>&1
echo SETUP_DONE

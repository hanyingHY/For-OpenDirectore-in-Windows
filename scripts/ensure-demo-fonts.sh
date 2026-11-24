#!/usr/bin/env bash
# Make CJK text render in the headless recording browser.
# Copies the vendored Noto Sans CJK SC (upstream public/fonts) into every
# fontconfig directory the recording Chromium build scans.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONT="$ROOT/build/opendirector/public/fonts/NotoSansCJKsc-Regular.otf"
if [ ! -f "$FONT" ]; then
  echo "ensure-demo-fonts: vendored font missing; run scripts/vendor-upstream.sh first" >&2
  exit 1
fi
mkdir -p "$HOME/.fonts" "$HOME/.local/share/fonts"
cp -f "$FONT" "$HOME/.fonts/"
cp -f "$FONT" "$HOME/.local/share/fonts/"
# @sparticuz/chromium extracts its fontconfig with <dir>/tmp/fonts</dir>.
if [ -d /tmp/fonts ] || mkdir -p /tmp/fonts 2>/dev/null; then
  cp -f "$FONT" /tmp/fonts/ 2>/dev/null || true
fi
echo "ensure-demo-fonts: Noto Sans CJK SC installed for recording"

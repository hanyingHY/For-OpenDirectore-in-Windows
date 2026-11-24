#!/usr/bin/env bash
# Vendor a pinned snapshot of ThinkFlowLab/OpenDirector into build/opendirector/
# and apply this repository's patch series (patches/*.patch).
#
# Usage:
#   OPENDIRECTOR_REF=<tag|commit> scripts/vendor-upstream.sh [--force]
#
# The pinned default below is the upstream main commit this repo was validated
# against; bump it together with a patch-series refresh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="${OPENDIRECTOR_REF:-8258d4b016496d81a7c824e4cdfa42f3c840d5eb}"
DEST="$ROOT/build/opendirector"
FORCE="${1:-}"

mkdir -p "$ROOT/build"

if [ -f "$DEST/.vendor-ref" ] && [ "$(cat "$DEST/.vendor-ref")" = "$REF" ] && [ -z "$FORCE" ]; then
  echo "vendor: build/opendirector already at $REF (use --force to refresh)"
else
  echo "vendor: fetching ThinkFlowLab/OpenDirector@$REF"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  TMP="$(mktemp -d)"
  curl -sSL "https://codeload.github.com/ThinkFlowLab/OpenDirector/tar.gz/$REF" -o "$TMP/src.tgz"
  tar -xzf "$TMP/src.tgz" -C "$TMP"
  SRC="$(echo "$TMP"/OpenDirector-*/)"
  cp -a "$SRC". "$DEST"/
  rm -rf "$TMP"
  echo "$REF" > "$DEST/.vendor-ref"
fi

# Apply the patch series in lexical order. Reset to pristine state first so the
# script is idempotent. Git Bash on Windows does not ship `patch`, so fall back
# to `git apply` (equivalent -p1 semantics, --forward keeps reruns safe).
if [ -d "$DEST/.git" ]; then
  git -C "$DEST" checkout -- . 2>/dev/null || true
fi
shopt -s nullglob
for patch in "$ROOT"/patches/*.patch; do
  echo "vendor: applying $(basename "$patch")"
  if command -v patch >/dev/null 2>&1; then
    patch -d "$DEST" -p1 --forward --batch < "$patch"
  elif git -C "$DEST" apply -p1 --whitespace=nowarn "$patch" 2>/dev/null; then
    :
  elif git -C "$DEST" apply -R -p1 --check "$patch" 2>/dev/null; then
    echo "vendor: $(basename "$patch") already applied"
  else
    echo "vendor: failed to apply $(basename "$patch")" >&2
    exit 1
  fi
done
echo "vendor: ready at $DEST"

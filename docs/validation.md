# Validation — full functional simulation & demo recording

This document describes how the Windows desktop adaptation of OpenDirector is
validated end-to-end and how the simulation demo video is produced. The demo
video is the acceptance artifact: every user-facing capability area is driven
through the real UI against the real API, recorded, and reviewed frame by frame.

## Deliverables

| Artifact | Path | Notes |
| --- | --- | --- |
| Simulation demo (MP4) | `demo/opendirector-windows-full-simulation.mp4` | ~72 s, 1600×1000, captions in EN + 中文 |
| Recording metadata | `demo/latest-demo.json` | frame count, fps, timestamp |
| Desktop shell | `windows/` | Electron + electron-builder (NSIS), 25 unit tests |
| Session takeover patch | `patches/0001-session-takeover.patch` | upstream feature reused by the demo |
| Recording harness | `scripts/recorder/`, `scripts/record-demo.mjs` | playwright-core + ffmpeg |

## What the demo covers

1. **First launch** — welcome screen, onboarding (connect an LLM), model setup
   form, bilingual welcome.
2. **Canvas workspace** — tool rail, project creation, text node + Agent
   composer, autosave indicator.
3. **AI assistant** — chat panel, @-references, streaming reply.
4. **Generation** — image and video generation through the node composer
   (model picker, generation parameters dialog, progress on the node).
5. **Import media** — local file upload bound to nodes (SHA-256 assets).
6. **Media editing** — media toolbar (smart edit / outpaint / panorama) and the
   non-destructive layer editor (crop, color adjustments, layer studio).
7. **Timeline & MP4 export** — timeline editor, clip arrangement, in-client
   MP4 rendering (WebCodecs + software AAC).
8. **Projects** — sidebar, create & switch, per-project autosave.
9. **Settings** — model connections, light/dark theme, language switch with a
   full Chinese UI proof.
10. **Crash recovery** — a second window takes the project lease, closes
    abruptly, and the lock screen's **Take over the project** button (from
    `patches/0001-session-takeover.patch`) restores editing immediately.

## How to record the demo

### Prerequisites

- Node.js ≥ 18, Python ≥ 3.11 with the vendored API importable.
- `ffmpeg` **and `ffprobe`** on `PATH` (the fixture server shells out to both
  when generating sample video/audio; missing `ffprobe` makes result adoption
  fail with “Preparing the local generation failed”).
- A Chromium binary and the `playwright-core` package.
- CJK fonts for the Chinese captions and UI (upstream ships
  `public/fonts/NotoSansCJKsc-Regular.otf`; run `scripts/ensure-demo-fonts.sh`).

### Steps

```bash
# 1. Vendor the upstream snapshot (already applied in build/opendirector)
scripts/vendor-upstream.sh

# 2. Start the isolated fixture API (temp root, fixture model providers,
#    gated assistant; never touches real projects or credentials)
cd build/opendirector
PYTHONPATH=packages/core/src:apps/api/src \
OPENDIRECTOR_ROOT=/tmp/od-fixture \
python tests/browser/creation_server.py --port 8019 --assistant-fixture

# 3. Start the web UI against the fixture
OPENDIRECTOR_API_URL=http://127.0.0.1:8019 npm run dev -- --port 5179

# 4. Install the fonts for headless Chromium
../scripts/ensure-demo-fonts.sh

# 5. Record
CREATION_WEB_URL=http://127.0.0.1:5179 \
CHROMIUM_PATH=/path/to/chromium \
FFMPEG_PATH=/path/to/ffmpeg \
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
node scripts/record-demo.mjs --out demo/opendirector-windows-full-simulation.mp4 --fps 2
```

The journey (`scripts/recorder/journey-full.mjs`) is self-contained: it drives
every section above, captures annotated frames with a synthetic cursor and
bilingual caption bar (CSS top-layer popovers so app modals cannot cover them),
and encodes the frames to H.264 with `ffmpeg`.

### Determinism notes

- The fixture server (`--assistant-fixture`) stubs agent/image/video model
  configs and answers generation calls in-process. Video/audio fixtures call
  `ffmpeg`/`ffprobe` on `PATH`.
- Restart the fixture server before each recording for a clean session/lease
  state. Live leases from previous windows cause the lock screen to appear.
- The crash-recovery section creates a *separate browser context* (its own
  editing session) — pages sharing one context share a session id and never
  contend for the lease.
- Section order matters: settings runs before the takeover demo because a
  reload close to a takeover can briefly show the lock screen again while the
  old lease ages out.

## Desktop unit tests

```bash
cd windows
npm test                          # 25 tests: window-state, updater,
                                  # windows-native, host, locale
```

## Upstream browser regression

The full upstream browser suite (`scripts/run-browser-suite.mjs`, 29 curated
workflows: session lease, MP4 export, timeline workflow with a real service
restart, large video import, locale, provider settings, first-run, structured
editors, …) passes 29/29 against the patched tree. Run it against a **fresh**
fixture — the workflows create projects with fixed names and a reused API
rejects the duplicates with HTTP 409:

```bash
# 1. fixture API (:8019) with a fresh --root and --assistant-fixture
# 2. vite dev server (:5179) from build/opendirector
cd build/opendirector
CHROMIUM_PATH=… BROWSER_PATH=… PLAYWRIGHT_MODULE=… LD_LIBRARY_PATH=… \
CREATION_WEB_URL=http://127.0.0.1:5179 CREATION_API_URL=http://127.0.0.1:8019 \
node scripts/run-browser-suite.mjs
# → 29/29 browser workflows passed in 417.1s
```

Environment notes: several workflows launch Chromium via `CHROMIUM_PATH`
directly (not `engine.mjs`'s `BROWSER_PATH`), so export both. The timeline
workflow spawns its own API through `python` — point `python` at the venv with
`fastapi` via an `exec`-wrapper script (a symlink chain breaks venv detection).

## Windows installer

`windows/package.json` builds an NSIS installer (`oneClick: false`, per-user
install, file association for `.odcanvas`, `opendirector://` protocol) via
`npm run dist`. The GitHub Actions workflow `.github/workflows/windows-build.yml`
builds the installer on `windows-latest` and attaches it to each release; the
runner is the authoritative Windows smoke environment (installer → onboarding →
project → update → uninstall checks from issue #362).

Current CI status (run 45387924507, 2026-11-24): **green** —

- `build` (4m52s): unit tests 25/25 → vendored upstream + patch series →
  standalone Python 3.12 via uv + opendirector wheel (web assets + OpenCode
  runtime) + ffmpeg/ffprobe + CLI launcher (`windows/scripts/prepare-runtime.mjs`)
  → NSIS installer artifact.
- `smoke` (1m37s): silent `/S` install on a real `windows-latest` VM →
  `OpenDirector.exe` present → silent uninstall.

Failure diagnostics: on `prepare-runtime` failures the workflow tees the log to
`_ci.log` (uploaded artifact + `::error::` annotations) and publishes the tail
to a repo issue so remote log truncation can never hide the root cause.

/**
 * Build-host runtime preparation for the Windows package.
 *
 * Layout expected:  <repo>/build/opendirector   vendored upstream (scripts/vendor-upstream.sh)
 *                   <repo>/windows              this shell
 *
 * Produces windows/runtime/{manifest.json, python/, bin/} exactly like the
 * upstream desktop prepare script: standalone Python via uv, the opendirector
 * wheel (Web assets + skills + OpenCode runtime) installed into it, standalone
 * ffmpeg/ffprobe copied in with their licences, and the `opendirector` CLI
 * launcher. Never touches the system Python.
 *
 * Build-host prerequisites: uv, Node/npm, and OPENDIRECTOR_FFMPEG_DIR pointing
 * at standalone ffmpeg.exe + ffprobe.exe for the target.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const windows = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(windows, '..', 'build', 'opendirector');
const runtime = join(windows, 'runtime');
const media = process.env.OPENDIRECTOR_FFMPEG_DIR;

if (!media) throw new Error('Set OPENDIRECTOR_FFMPEG_DIR to standalone ffmpeg and ffprobe binaries for this target.');
try {
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
} catch {
  throw new Error('Vendored upstream missing. Run scripts/vendor-upstream.sh first.');
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

// runtime/ is generated: always start from a clean python distribution.
const pythonDirectory = join(runtime, 'python');
rmSync(pythonDirectory, { recursive: true, force: true });
mkdirSync(join(runtime, 'bin'), { recursive: true });
run('uv', ['python', 'install', '3.12', '--install-dir', pythonDirectory, '--no-bin']);

const architecture = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const installations = readdirSync(pythonDirectory, { withFileTypes: true });
// uv leaves a version-less alias (a junction on Windows) that would otherwise
// be archived twice — remove it before packaging.
for (const entry of installations) if (entry.isSymbolicLink()) rmSync(join(pythonDirectory, entry.name));
const distributions = installations.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() &&
  entry.name.startsWith('cpython-3.12') && entry.name.includes(architecture));
if (distributions.length !== 1) {
  throw new Error(`Expected exactly one standalone Python distribution, found ${distributions.length}`);
}
const distribution = distributions[0].name;
const python = join(pythonDirectory, distribution, process.platform === 'win32' ? 'python.exe' : 'bin/python3');

const wheels = join(windows, 'build', 'desktop-wheel');
mkdirSync(wheels, { recursive: true });
run('uv', ['build', '--wheel', '--out-dir', wheels]);
const wheel = readdirSync(wheels).find(name => name.startsWith('opendirector-') && name.endsWith('.whl'));
if (!wheel) throw new Error('OpenDirector wheel was not produced');
run('uv', ['pip', 'install', '--reinstall-package', 'opendirector', '--python', python, join(wheels, wheel)]);

for (const name of ['ffmpeg', 'ffprobe']) {
  const executable = name + (process.platform === 'win32' ? '.exe' : '');
  copyFileSync(join(media, executable), join(runtime, 'bin', executable));
  chmodSync(join(runtime, 'bin', executable), 0o755);
  const license = spawnSync(join(runtime, 'bin', executable), ['-L'], { encoding: 'utf8' });
  if (license.status !== 0) throw new Error(`${name} license inspection failed`);
  writeFileSync(join(runtime, 'bin', `LICENSE.${name}.txt`), license.stdout + license.stderr);
  run(join(runtime, 'bin', executable), ['-version']);
}

const pythonRelative = relative(runtime, python).split('\\').join('/');
if (process.platform === 'win32') {
  writeFileSync(join(runtime, 'bin/opendirector.cmd'),
    `@echo off\r\nset "PATH=%~dp0;%PATH%"\r\n` +
    `if not defined OPENDIRECTOR_ROOT set "OPENDIRECTOR_ROOT=%APPDATA%\\OpenDirector\\workspace"\r\n` +
    `set "OPENDIRECTOR_DESKTOP_EXECUTABLE=%~dp0..\\..\\OpenDirector.exe"\r\n` +
    `"%~dp0..\\${pythonRelative}" -I -B -X utf8 -m opendirector.cli %*\r\n`);
} else {
  writeFileSync(join(runtime, 'bin/opendirector'),
    `#!/bin/sh\nset -eu\nRUNTIME=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\n` +
    `export PATH="$RUNTIME/bin:$PATH"\nexport OPENDIRECTOR_ROOT="\${OPENDIRECTOR_ROOT:-$HOME/.config/OpenDirector/workspace}"\n` +
    `exec "$RUNTIME/${pythonRelative}" -I -B -m opendirector.cli "$@"\n`);
  chmodSync(join(runtime, 'bin/opendirector'), 0o755);
}
run(python, ['-I', '-X', 'utf8', '-m', 'opendirector.cli', '--help']);

const application = JSON.parse(readFileSync(join(windows, 'package.json'))).version;
writeFileSync(join(runtime, 'manifest.json'), JSON.stringify({
  version: 1, platform: process.platform, arch: process.arch,
  python: pythonRelative, application,
}, null, 2));
console.log(`prepare-runtime: ready (${distribution}, app ${application})`);

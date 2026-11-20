import json, os, subprocess, sys, tempfile, time, pathlib
extra = json.loads(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else {}
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 60
opts = {'baseURL': 'http://127.0.0.1:18099/v1', 'apiKey': '{env:OPENDIRECTOR_MODEL_KEY}'}
opts.update(extra)
cfg = {'autoupdate': False, 'default_agent': 'opendirector',
       'agent': {'opendirector': {'mode': 'primary', 'prompt': 'You are a test.'}, 'title': {'disable': True}},
       'permission': {'*': 'deny'}, 'mcp': {},
       'provider': {'opendirector': {'npm': '@ai-sdk/openai-compatible', 'name': 'OpenDirector', 'options': opts,
                    'models': {'m': {'name': 'm', 'modalities': {'input': ['text'], 'output': ['text']}}}}}}
work = tempfile.mkdtemp(prefix='b1-')
env = {'PATH': os.environ['PATH'], 'HOME': work, 'XDG_CONFIG_HOME': work, 'XDG_DATA_HOME': work + '/data',
       'OPENDIRECTOR_MODEL_KEY': 'k', 'OPENCODE_DISABLE_AUTOUPDATE': '1', 'OPENCODE_DISABLE_EXTERNAL_SKILLS': '1', 'OPENCODE_DISABLE_CLAUDE_CODE_SKILLS': '1',
       'OPENCODE_CONFIG_CONTENT': json.dumps(cfg), 'PWD': work}
binary = os.environ.get('OD_OPENCODE_BIN', 'node_modules/opencode-linux-x64-baseline/bin/opencode')  # from a checkout after npm ci
t0 = time.time()
p = subprocess.run([binary, 'run', '--dir', work, '--pure', '--format', 'json', '--agent', 'opendirector',
                    '--model', 'opendirector/m', 'hello'], env=env, cwd=work, capture_output=True, text=True, timeout=limit)
print('exit', p.returncode, 'secs', round(time.time() - t0, 1))
print('stdout:', (p.stdout or '')[:600])
print('stderr:', (p.stderr or '')[-600:])

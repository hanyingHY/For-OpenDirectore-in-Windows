# B1 reproduction: OpenCode retry storm on model gateway timeouts (#345)

Runs the bundled OpenCode runtime (`opencode-linux-x64-baseline`, 1.19.5, from `package-lock.json`) against a stub provider, with the same provider block that `packages/core/src/opendirector/agent/native.py` writes.

```sh
# export OD_OPENCODE_BIN=/path/to/node_modules/opencode-linux-x64-baseline/bin/opencode
python3 stub_provider.py 502 &          # every POST answers 502 (before the fix: gateway timeout)
python3 run_opencode.py '' 60           # observe repeated POSTs at +0, +2, +5, +9, +17 s ...
python3 stub_provider.py 400 &          # 424/4xx with a fixed message (after the fix)
python3 run_opencode.py '' 60           # exit after one POST, isRetryable=false, message shown
```

Results measured in the sandbox on 2026-11-20:

| Case | Provider reply | Requests in 60 s | OpenCode behaviour |
| --- | --- | --- | --- |
| before | 502 | 9+ (retrying) | never terminates |
| `maxRetries: 0` in provider options | 502 | 9+ | no effect: retries live in the session layer |
| after | 4xx, non-retryable | 1 | exits in ~3.7 s with `isRetryable: false` and the message |

The gateway change itself is covered by `tests/test_model_gateway.py` (applied from `patches/agent-gateway-terminal-failure.patch`).

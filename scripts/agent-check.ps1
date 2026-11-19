#Requires -Version 7.0
# Run the upstream native turn regression against the *packaged* interpreter,
# business services, skills and executable. Model transport is deterministic.
$ErrorActionPreference='Stop'
$base = if ($env:OD_TEST_APP) { $env:OD_TEST_APP } else { (Resolve-Path '.work/app').Path }
$src = (Get-Item '.work/OpenDirector-*' | Select-Object -First 1).FullName
$env:PATH = "$base\git\cmd;$base\media;$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
$env:PYTHONUTF8='1'
$env:OPENDIRECTOR_REAL_CLI='1'
$env:OPENDIRECTOR_REAL_CLI_WORKER='1'
# Keep test tools outside the application being packed.
$env:PYTHONPATH=Join-Path ([IO.Path]::GetTempPath()) 'OD-test-libraries'
$env:PYTHONDONTWRITEBYTECODE='1'
& "$base\python\python.exe" -m pip install --no-compile --target $env:PYTHONPATH pytest==9.1.1
if ($LASTEXITCODE) { throw 'pytest installation failed' }
# The upstream fixture emits a POSIX single-quoted multiword argument. Use
# double quotes in the deterministic model response: cmd.exe accepts these too.
# Tool name, catalog checks, project mutation and receipt assertions stay intact.
$case = Join-Path $src 'tests/test_native_runtime.py'
$old = Get-Content -Raw -Encoding utf8 $case
$adjusted = $old.Replace("--text 'Real OpenCode plan'", '--text \"Real OpenCode plan\"')
# A fixture provider sees only the synthetic project. Surface short tool
# results to diagnose platform-specific skill discovery and CLI quoting.
$needle='        count = len(requests)'
$adjusted=$adjusted.Replace($needle, "        for m in payload['messages']:`n            if m.get('role') == 'tool': print('FIXTURE_TOOL', m.get('tool_call_id'), str(m.get('content',''))[:400], flush=True)`n"+$needle)
if ($old -eq $adjusted) { throw 'Fixture command changed upstream' }
[IO.File]::WriteAllText($case, $adjusted, [Text.UTF8Encoding]::new($false))
$trace=Join-Path ([IO.Path]::GetTempPath()) 'OD Agent 测试'
Push-Location $src
try {
  & "$base\python\python.exe" -m pytest --basetemp $trace -q 'tests/test_native_runtime.py::test_real_opencode_default_hello_saves_direct_reply[plain]' 'tests/test_native_runtime.py::test_real_opencode_native_skill_and_gateway_write[False-default]' *> "$base\..\agent-test.txt"
  $status=$LASTEXITCODE
  Get-Content "$base\..\agent-test.txt" -Tail 45
  if ($status) {
    # Only report tool errors from this disposable test's fake-model traces.
    Select-String -Path "$base\..\agent-test.txt" -Pattern 'FIXTURE_TOOL|agent.model.error' | Select-Object -Last 12 | ForEach-Object { Write-Output "::warning::$($_.Line)" }
    Get-ChildItem $trace -Filter '*.opencode.jsonl' -Recurse | ForEach-Object {
      Get-Content $_.FullName | ForEach-Object {
        $part=($_ | ConvertFrom-Json).native.part
        if ($part.tool) { Write-Output ('::warning::CLI output: '+(($part.state.output + ' ' + $part.state.error) -replace '[\r\n]',' ').Substring(0,[Math]::Min(1500,($part.state.output + ' ' + $part.state.error).Length))) }
      }
    }
    Get-Content "$base\..\agent-test.txt" -Tail 10 | ForEach-Object { Write-Output "::warning::$_" }; throw 'Native bundled Agent regression failed'
  }
} finally { [IO.File]::WriteAllText($case,$old,[Text.UTF8Encoding]::new($false)); Pop-Location }

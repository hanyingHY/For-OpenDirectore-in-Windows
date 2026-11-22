#Requires -Version 7.0
$ErrorActionPreference='Stop'
trap { Write-Output ("::error::Smoke line {0}: {1}" -f $_.InvocationInfo.ScriptLineNumber,$_.Exception.Message); exit 1 }
Get-ChildItem -Path delivery/windows-*.png,delivery/windows-*.mp4,delivery/timeline-export.mp4 -ErrorAction SilentlyContinue | Remove-Item
# Every PASS is also written to a report file that the workflow publishes to the
# evidence branch, so each real-Windows run can be audited without its job log.
$report='delivery/windows-smoke-report.txt'
Remove-Item $report -ErrorAction SilentlyContinue
function Pass([string]$message) { Write-Output ('PASS: ' + $message); Add-Content -Path $report -Value ('PASS: ' + $message) }
$installer = (Get-ChildItem delivery/*.exe).FullName
$root = Join-Path $env:LOCALAPPDATA 'Programs\OpenDirector'
$tempRoot=[IO.Path]::GetTempPath()
$env:OPENDIRECTOR_ROOT = Join-Path $tempRoot 'OpenDirector 测试 projects'
function Run-Installer($package=$installer) { if ((Start-Process $package -ArgumentList '/S' -Wait -PassThru).ExitCode -ne 0) { throw 'Silent installation failed' } }
$expected=(Get-Content desktop/VERSION).Trim()
$numeric=$expected.Replace('-desktop.','.')
function Assert-PE($path) {
    $info=(Get-Item -LiteralPath $path).VersionInfo
    $fixed="$($info.FileMajorPart).$($info.FileMinorPart).$($info.FileBuildPart).$($info.FilePrivatePart)"
    if ($fixed -ne $numeric -or $info.ProductName -ne 'OpenDirector' -or !$info.FileDescription) { throw "Invalid PE metadata: $path ($fixed)" }
}
Assert-PE $installer
if ($env:OD_PREVIOUS_INSTALLER) { Run-Installer $env:OD_PREVIOUS_INSTALLER } else { Run-Installer }
New-Item -ItemType Directory -Force .work | Out-Null
# Seed a dummy model through the real store, never a user key. Compare exact
# bytes across upgrade + uninstall, outside the installed resources.
& "$root\app\python\python.exe" -I -c "from opendirector.installation import data_root; from opendirector.infrastructure.model_configs import ModelConfigs; ModelConfigs(data_root()).save('agent','http://127.0.0.1:18919/v1','offline-fixture','fake-test-key')"
if ($LASTEXITCODE) { throw 'Model fixture failed' }
$settings=Join-Path $env:OPENDIRECTOR_ROOT '.opendirector\models.json'
$hash=(Get-FileHash $settings).Hash
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=19222'
npm install --prefix scripts --no-save --no-package-lock playwright-core@1.56.1
if ($LASTEXITCODE) { throw 'Smoke driver setup failed' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DesktopProbe {
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hwnd, int x, int y, int w, int h, bool repaint);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@
function Test-UI($phase) {
    $modern=(Get-Content "$root\app\VERSION").Trim() -notmatch '^0\.1\.4-desktop\.[123]$'
    $occupied=$null
    if ($modern) {
        # This used to prevent OpenDirector from starting. Never accept a
        # connection: a successful GUI proves it reached the new listener.
        $occupied=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,48765)
        $occupied.Start()
    }
    $hostPath=$env:PATH
    try {
        $env:PATH="$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
        $proc=Start-Process "$root\app\OpenDirector.exe" -PassThru
    } finally { $env:PATH=$hostPath }
    try {
        if ($phase -eq 'reopen') { $env:OD_TEST_HOST_PID=$proc.Id }
        node scripts/smoke.mjs $phase
        if ($LASTEXITCODE) { Get-Content "$env:LOCALAPPDATA\OpenDirector\Desktop\desktop.log" -Tail 12 -ErrorAction SilentlyContinue | ForEach-Object { Write-Output "::warning::$_" }; throw "UI probe failed: $phase" }
        if ($modern) {
            $proc.Refresh()
            if ($phase -eq 'reopen') {
                $saved=(Get-Content "$env:LOCALAPPDATA\OpenDirector\Desktop\window.txt" -ErrorAction Stop).Trim()
                $now=New-Object DesktopProbe+RECT
                [DesktopProbe]::GetWindowRect($proc.MainWindowHandle,[ref]$now) | Out-Null
                $actual="$($now.Left),$($now.Top),$($now.Right-$now.Left),$($now.Bottom-$now.Top),0"
                if ($actual -ne $saved) { throw "Window geometry not restored: saved=$saved actual=$actual" }
                Pass "window geometry restored after relaunch ($actual)"
            }
            # SC_CLOSE is the title-bar X. A bare WM_CLOSE from CloseMainWindow
            # is categorized by WinForms as a Task Manager shutdown, not UserClosing.
            $window=$proc.MainWindowHandle
            if ($phase -eq 'create') {
                # C3: window geometry is remembered across hide + relaunch.
                if (![DesktopProbe]::MoveWindow($window,120,140,1100,720,$true)) { throw 'Could not move main window' }
                Start-Sleep -Milliseconds 800
                $moved=New-Object DesktopProbe+RECT
                [DesktopProbe]::GetWindowRect($window,[ref]$moved) | Out-Null
                $script:movedRect="$($moved.Left),$($moved.Top),$($moved.Right-$moved.Left),$($moved.Bottom-$moved.Top)"
            }
            if (($window -eq [IntPtr]::Zero) -or ![DesktopProbe]::IsWindowVisible($window) -or ![DesktopProbe]::PostMessage($window,0x112,[IntPtr]0xF060,[IntPtr]::Zero)) { throw 'Could not request window close' }
            $until=[DateTime]::UtcNow.AddSeconds(5)
            while ([DesktopProbe]::IsWindowVisible($window) -and [DateTime]::UtcNow -lt $until) { Start-Sleep -Milliseconds 100 }
            if ($proc.HasExited -or [DesktopProbe]::IsWindowVisible($window)) { throw "Close did not hide main HWND; exited=$($proc.HasExited)" }
            if ($phase -eq 'create') {
                $saved=(Get-Content "$env:LOCALAPPDATA\OpenDirector\Desktop\window.txt" -ErrorAction Stop).Trim()
                if ($saved -ne "$script:movedRect,0") { throw "Window geometry not saved on hide: saved=$saved expected=$script:movedRect" }
                Pass "window geometry saved on hide ($saved)"
            }
            $second=Start-Process "$root\app\OpenDirector.exe" -PassThru
            if (!$second.WaitForExit(5000) -or $second.ExitCode -ne 0) { throw 'Second launch did not hand off' }
            $until=[DateTime]::UtcNow.AddSeconds(5)
            # WinForms may recreate the native handle on Show. Identity is the
            # same live process + its visible OpenDirector main form, not HWND equality.
            do {
                $proc.Refresh(); $restored=$proc.MainWindowHandle
                if ($proc.MainWindowTitle -eq 'OpenDirector' -and [DesktopProbe]::IsWindowVisible($restored)) { break }
                Start-Sleep -Milliseconds 100
            } while ([DateTime]::UtcNow -lt $until)
            if (![DesktopProbe]::IsWindowVisible($restored) -or $proc.MainWindowTitle -ne 'OpenDirector') { throw "Second launch failed to restore window; original=$window current=$restored title=$($proc.MainWindowTitle) exited=$($proc.HasExited)" }
            $before=(Get-FileHash "$root\app\OpenDirector.exe").Hash
            $blocked=Start-Process $installer -ArgumentList '/S' -Wait -PassThru
            if (!$blocked.ExitCode -or $before -ne (Get-FileHash "$root\app\OpenDirector.exe").Hash -or $proc.HasExited) { throw 'Live install was not refused safely' }
            if ($phase -eq 'reopen') {
                $uninstaller=Join-Path $root 'Uninstall.exe'
                $beforeUninstall=(Get-FileHash $uninstaller).Hash
                $arp='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenDirectorDesktop'
                $registration=Get-ItemProperty $arp
                if ($registration.DisplayVersion -ne $expected -or $registration.DisplayIcon -notmatch 'OpenDirector\.exe' -or
                    $registration.Publisher -ne 'For-OpenDirector' -or $registration.EstimatedSize -lt 1) { throw 'Invalid installed-app registration' }
                foreach ($exe in @($uninstaller,"$root\app\OpenDirector.exe","$root\app\OpenDirector-CLI.exe")) { Assert-PE $exe }
                $blocked=Start-Process $uninstaller -ArgumentList '/S' -Wait -PassThru
                if ($blocked.ExitCode -ne 2 -or $proc.HasExited -or $before -ne (Get-FileHash "$root\app\OpenDirector.exe").Hash -or
                    $beforeUninstall -ne (Get-FileHash $uninstaller).Hash -or !(Test-Path $arp)) { throw "Live /S uninstall not refused safely (exit=$($blocked.ExitCode))" }
                Pass 'PE version metadata, ARP fields and bare Uninstall.exe /S returns 2 while running'
                ./verification/quit.ps1 -HostId $proc.Id -Agents 0 -Accept
                if (Test-Path "$env:LOCALAPPDATA\OpenDirector\Desktop\session.bin") { throw 'Clean exit left a CLI ticket' }
                $offline=(& "$root\app\OpenDirector-CLI.exe" project list | Out-String)
                if (!$LASTEXITCODE -or $offline -notmatch 'Open or restart OpenDirector') { throw 'Missing stopped-app CLI guidance' }
                & "$root\app\OpenDirector-CLI.exe" --help | Out-Null
                if ($LASTEXITCODE) { throw 'CLI help must work without a live desktop' }
            }
            Pass 'occupied legacy port, authenticated desktop, hide and single-instance restore'
        }
    } finally {
        if ($occupied) { $occupied.Stop() }
        if (!$proc.HasExited) { $proc.Kill(); $proc.WaitForExit() }
    }
}
Test-UI 'create'
# Mimic the durable state after the previous directory was renamed, but
# before activation. Force a staging failure: the old version must be back.
$before=(Get-FileHash "$root\app\OpenDirector.exe").Hash
Rename-Item "$root\app" previous
Set-Content -LiteralPath "$root\incoming" -Value 'intentional staging blocker'
$failed=Start-Process $installer -ArgumentList '/S' -Wait -PassThru
if (!$failed.ExitCode -or (Get-FileHash "$root\app\OpenDirector.exe").Hash -ne $before) { throw 'Interrupted upgrade lost its last good app' }
Remove-Item -LiteralPath "$root\incoming"
# Hold the real installer in its normal extraction window, not a mocked mutex.
$primary=Start-Process $installer -ArgumentList '/S' -PassThru
$until=[DateTime]::UtcNow.AddSeconds(60)
while (!(Test-Path "$root\incoming") -and !$primary.HasExited -and [DateTime]::UtcNow -lt $until) { Start-Sleep -Milliseconds 100 }
if (!(Test-Path "$root\incoming")) { throw 'Did not observe installer staging' }
$second=Start-Process $installer -ArgumentList '/S' -PassThru
if (!$second.WaitForExit(20000) -or !$second.ExitCode) { throw 'Overlapping installer not refused' }
if (!$primary.WaitForExit(150000) -or $primary.ExitCode) { throw 'First installer failed' }
# Upstream intentionally retains the last writer's lease for 60s on crash.
Start-Sleep -Seconds 61
# Use an isolated stand-in for the user’s incompatible newer OpenCode database.
# The packaged runtime must never open or rewrite it.
$env:XDG_DATA_HOME=Join-Path (Resolve-Path .work).Path 'global OpenCode 测试'
$env:XDG_CACHE_HOME=Join-Path $env:XDG_DATA_HOME 'cache'
$env:XDG_STATE_HOME=Join-Path $env:XDG_DATA_HOME 'state'
$fakeDb=Join-Path $env:XDG_DATA_HOME 'opencode\opencode.db'
New-Item -ItemType Directory -Force (Split-Path $fakeDb) | Out-Null
Remove-Item $fakeDb -ErrorAction SilentlyContinue
& "$root\app\python\python.exe" -I -c "import sqlite3,sys; sqlite3.connect(sys.argv[1]).execute('CREATE TABLE newer_schema (id INTEGER PRIMARY KEY)')" $fakeDb
if ($LASTEXITCODE) { throw 'Could not seed incompatible OpenCode database' }
$dbHash=(Get-FileHash $fakeDb).Hash
Test-UI 'reopen'
if ((Get-FileHash $fakeDb).Hash -ne $dbHash) { throw 'Bundled Agent modified external OpenCode database' }
$privateDb=Join-Path $env:LOCALAPPDATA 'OpenDirector\Desktop\agent-runtime\opencode-v1\data\opencode\opencode.db'
if (!(Test-Path $privateDb)) { throw 'Missing private Agent database' }
Pass 'skills and native turn succeeded with incompatible inherited XDG data; external database unmodified'
# Broken user-selected root: startup must fail with actionable native diagnostics,
# not open an empty canvas or destroy the inaccessible workspace.
$validRoot=$env:OPENDIRECTOR_ROOT
$env:OPENDIRECTOR_ROOT=Join-Path $tempRoot "OpenDirector 中文日志诊断 $([guid]::NewGuid()).txt"
New-Item -ItemType File -Path $env:OPENDIRECTOR_ROOT | Out-Null
try {
    $bad=Start-Process "$root\app\OpenDirector.exe" -PassThru
    $until=[DateTime]::UtcNow.AddSeconds(75)
    do {
        $message=(Get-Content "$env:LOCALAPPDATA\OpenDirector\Desktop\desktop.log" -Tail 15) -match 'Local service did not start.*服务启动失败'
        if ($message) { break }; Start-Sleep -Milliseconds 300
    } while ([DateTime]::UtcNow -lt $until)
    if (!$message) { throw 'Missing bilingual startup failure diagnostic' }
    if (!(Select-String -Path "$env:LOCALAPPDATA\OpenDirector\Desktop\desktop.log" -SimpleMatch (Split-Path $env:OPENDIRECTOR_ROOT -Leaf) -Quiet)) { throw 'Python traceback lost the Chinese path' }
} finally {
    if ($bad -and !$bad.HasExited) { $bad.Kill(); $bad.WaitForExit() }
    Remove-Item -LiteralPath $env:OPENDIRECTOR_ROOT; $env:OPENDIRECTOR_ROOT=$validRoot
}
# An independent shell registration installed by another application is not ours.
$cmd='HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\OpenDirector-CLI.exe'
New-Item $cmd -Force | Out-Null
Set-Item $cmd -Value 'C:\independent\OpenDirector-CLI.exe'
$projectFiles=@(Get-ChildItem $env:OPENDIRECTOR_ROOT -File -Recurse)
if (!$projectFiles.Count) { throw 'No project files to preserve' }
$uninstall=Start-Process "$root\Uninstall.exe" -ArgumentList '/S' -Wait -PassThru
# The launcher has exited; its disposable child can now remove the image.
$until=[DateTime]::UtcNow.AddSeconds(20)
while ((Test-Path "$root\Uninstall.exe") -and [DateTime]::UtcNow -lt $until) { Start-Sleep -Milliseconds 100 }
if ($uninstall.ExitCode -ne 0 -or (Test-Path "$root\app\OpenDirector.exe") -or (Test-Path "$root\Uninstall.exe")) { throw "Silent uninstall failed ($($uninstall.ExitCode))" }
foreach ($f in $projectFiles) { if (!(Test-Path $f.FullName)) { throw 'Uninstall removed project data' } }

if ((Get-FileHash $settings).Hash -ne $hash) { throw 'Upgrade or uninstall changed credentials' }

if ((Get-Item $cmd).GetValue('') -ne 'C:\independent\OpenDirector-CLI.exe') { throw 'Uninstall removed independent CLI' }
Remove-Item $cmd

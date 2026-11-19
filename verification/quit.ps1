#Requires -Version 7.0
# Drive the installed application's accessible Alt+Space system menu and its
# real native confirmation. Never search by a global window title.
param([Parameter(Mandatory)][int]$HostId,[Parameter(Mandatory)][int]$Agents,[switch]$Accept)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class QuitProbe {
    [DllImport("user32.dll")] public static extern IntPtr GetSystemMenu(IntPtr hwnd, bool revert);
    [DllImport("user32.dll")] public static extern uint GetMenuState(IntPtr menu, uint id, uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp);
    [DllImport("user32.dll")] public static extern IntPtr GetLastActivePopup(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string type, IntPtr text);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wp, StringBuilder text, uint flags, uint timeout, out IntPtr result);
}
'@
$proc=Get-Process -Id $HostId
$main=$proc.MainWindowHandle
if ([QuitProbe]::GetMenuState([QuitProbe]::GetSystemMenu($main,$false),0x1F00,0) -eq [uint32]::MaxValue) { throw 'Quit missing from system menu' }
if (![QuitProbe]::PostMessage($main,0x112,[IntPtr]0x1F00,[IntPtr]::Zero)) { throw 'Cannot invoke Quit' }
$until=[DateTime]::UtcNow.AddSeconds(15)
do {
    $dlg=[QuitProbe]::GetLastActivePopup($main)
    $no=[QuitProbe]::GetDlgItem($dlg,7)
    if ($dlg -ne $main -and $no -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 100
} while ([DateTime]::UtcNow -lt $until)
if ($dlg -eq $main -or $no -eq [IntPtr]::Zero) { throw 'Missing native quit confirmation' }
$item=[IntPtr]::Zero; $text=''
while (($item=[QuitProbe]::FindWindowEx($dlg,$item,'Static',[IntPtr]::Zero)) -ne [IntPtr]::Zero) {
    $buffer=[Text.StringBuilder]::new(2048); $length=[IntPtr]::Zero
    [void][QuitProbe]::SendMessageTimeout($item,13,[IntPtr]2048,$buffer,2,1000,[ref]$length)
    $text+=$buffer.ToString()
}
if (!$text.Contains("Agent: $Agents;") -or !$text.Contains('远端任务可能继续')) { throw "Unexpected quit status: $text" }
$id=if ($Accept) {6} else {7}
if (![QuitProbe]::PostMessage($dlg,0x111,[IntPtr]$id,[QuitProbe]::GetDlgItem($dlg,$id))) { throw 'Cannot answer quit confirmation' }
if ($Accept -and !$proc.WaitForExit(15000)) { throw 'Confirmed quit did not exit' }
Write-Output "PASS native Quit: $Agents active Agent(s), accepted=$($Accept.IsPresent)"

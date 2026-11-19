// NSIS's default uninstaller returns after spawning a temp copy, before
// un.onInit runs. Run an isolated copy directly so /S reports the actual result.
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Uninstall {
    [STAThread]
    static int Main(string[] args) {
        bool silent = args.Length == 1 && args[0] == "/S";
        if (args.Length != 0 && !silent) return 2;
        string root = Path.GetDirectoryName(Application.ExecutablePath);
        string temp = Path.Combine(Path.GetTempPath(), "OpenDirector-uninstall-" + Guid.NewGuid().ToString("N"));
        try {
            Directory.CreateDirectory(temp);
            string engine = Path.Combine(temp, "UninstallEngine.exe");
            File.Copy(Path.Combine(root, "UninstallEngine.exe"), engine);
            using (var process = Process.Start(new ProcessStartInfo(engine,
                    (silent ? "/S " : "") + "/ODWRAPPER=" + Process.GetCurrentProcess().Id + " _?=" + root) {
                UseShellExecute = false, WorkingDirectory = temp
            })) {
                process.WaitForExit();
                return process.ExitCode;
            }
        } catch (Exception error) {
            if (!silent) MessageBox.Show("Uninstall failed / 卸载失败\n\n" + error.Message, "OpenDirector");
            return 2;
        } finally {
            try { Directory.Delete(temp, true); }
            catch (IOException) {} catch (UnauthorizedAccessException) {}
        }
    }
}

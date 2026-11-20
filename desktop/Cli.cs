using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;

internal static class Cli {
    // Win32 argv quoting, including terminal backslashes before the closing quote.
    static string Arg(string value) {
        var result=new StringBuilder("\""); int slashes=0;
        foreach(char c in value) {
            if(c=='\\') { slashes++; continue; }
            result.Append('\\', c=='"' ? slashes*2+1 : slashes); slashes=0; result.Append(c);
        }
        return result.Append('\\',2*slashes).Append('"').ToString();
    }
    static int Main(string[] args) {
        string dir=AppDomain.CurrentDomain.BaseDirectory;
        var p=new ProcessStartInfo(Path.Combine(dir,"python","python.exe"), "-I -X utf8 " + Arg(Path.Combine(dir,"cli_entry.py")) + " " + string.Join(" ", Array.ConvertAll(args, Arg)));
        p.UseShellExecute=false;
        p.EnvironmentVariables["PATH"]=Path.Combine(dir,"media")+";"+Path.Combine(dir,"git","cmd")+";"+p.EnvironmentVariables["PATH"];
        string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OpenDirector","Desktop","session.bin");
        try {
            if(File.Exists(file)) p.EnvironmentVariables["OD_LOCAL_TICKET"]=Encoding.ASCII.GetString(ProtectedData.Unprotect(File.ReadAllBytes(file),null,DataProtectionScope.CurrentUser));
            using(var child=Process.Start(p)) { child.WaitForExit(); return child.ExitCode; }
        } catch(Exception ex) { Console.Error.WriteLine(ex.Message); return 1; }
    }
}

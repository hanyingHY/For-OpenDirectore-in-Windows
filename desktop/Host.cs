// Windows-only host for the upstream Chromium UI. No JavaScript/native bridge.
using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;

using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Host {
    const string Origin = "http://127.0.0.1:48765";
    static readonly string Install = AppDomain.CurrentDomain.BaseDirectory;
    static readonly string State = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenDirector", "Desktop");
    static readonly string Log = Path.Combine(State, "desktop.log");
    static readonly object LogLock = new object();
    static readonly string Secret = NewSecret();
    static readonly TaskCompletionSource<int> Ready = new TaskCompletionSource<int>();
    static readonly string Ticket = Path.Combine(State,"session.bin");
    internal static readonly Icon AppIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    static Process service;
    static Updates updates;
    static IntPtr job;
    static bool closing, confirming;
    static int port;
    static readonly string Ping = Guid.NewGuid().ToString("N");
    static EventWaitHandle activation;
    static void Restore() {
        main.Show(); if(main.WindowState==FormWindowState.Minimized) main.WindowState=FormWindowState.Normal;
        main.Activate(); SetForegroundWindow(main.Handle);
    }
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
    static async Task<bool> Confirm(string operation) {
        if(confirming || closing) return false;
        Restore(); confirming=true;
        try {
            string state;
            try {
                state=await Task.Run(()=>{
                    var req=(System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://127.0.0.1:"+port+"/__desktop/activity");
                    req.Proxy=null; req.Timeout=2500; req.Headers["X-OpenDirector-Desktop"]=Secret;
                    using(var res=req.GetResponse()) using(var r=new StreamReader(res.GetResponseStream())) return r.ReadToEnd();
                });
                int renders=0;
                var forms=new System.Collections.Generic.List<Form>(); foreach(Form f in Application.OpenForms) forms.Add(f);
                foreach(Form f in forms) foreach(Control c in f.Controls) {
                    var v=c as WebView2; if(v==null) continue;
                    var inspect=v.ExecuteScriptAsync("!!document.querySelector('.cw-render-status progress,.cw-timeline-pending:not(:has(.cw-timeline-pending-error))')");
                    if(await Task.WhenAny(inspect,Task.Delay(2500))!=inspect) throw new TimeoutException();
                    if(await inspect=="true") renders++;
                }
                state+="; Export / 导出: "+renders;
            } catch(Exception) { state="Task status unknown / 无法确认任务状态"; }
            return !closing && MessageBox.Show(main,state+"\n\nLocal work stops; remote jobs may continue. Save before proceeding.\n本地任务将停止，远端任务可能继续。请先保存。\n\n"+operation,"OpenDirector",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)==DialogResult.Yes;
        } finally { confirming=false; }
    }
    static CoreWebView2Environment engine;
    static Form main;
    static string NewSecret() { var b = new byte[32]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(b); return Convert.ToBase64String(b); }
    static void Write(string s) { lock (LogLock) { try { File.AppendAllText(Log, DateTime.Now.ToString("s") + " " + s + Environment.NewLine); } catch (IOException) {} catch (UnauthorizedAccessException) {} } }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr handle, int info, IntPtr data, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr handle, IntPtr proc);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    static void StartService() {
        job = CreateJobObject(IntPtr.Zero, null);
        // x64 JOBOBJECT_EXTENDED_LIMIT_INFORMATION; kill the entire backend/Agent/
        // FFmpeg process tree if the UI crashes. Python blocks on stdin until assigned.
        byte[] limits = new byte[144]; BitConverter.GetBytes(0x2000).CopyTo(limits, 16);
        var h = GCHandle.Alloc(limits, GCHandleType.Pinned);
        try { if (job == IntPtr.Zero || !SetInformationJobObject(job, 9, h.AddrOfPinnedObject(), (uint)limits.Length)) throw new System.ComponentModel.Win32Exception(); }
        finally { h.Free(); }
        var info = new ProcessStartInfo(Path.Combine(Install, "python", "python.exe"), "-I -X utf8 -u \"" + Path.Combine(Install, "service.py") + "\"");
        info.WorkingDirectory = State; info.UseShellExecute = false; info.CreateNoWindow = true;
        info.RedirectStandardInput = info.RedirectStandardOutput = info.RedirectStandardError = true;
        info.EnvironmentVariables["PATH"] = Path.Combine(Install,"media") + ";" + Path.Combine(Install,"git","cmd") + ";" + info.EnvironmentVariables["PATH"];
        info.EnvironmentVariables["PYTHONUTF8"] = "1";
        info.EnvironmentVariables["OPENDIRECTOR_BUNDLED_AGENT_HOME"] = Path.Combine(State, "agent-runtime");
        info.StandardErrorEncoding = info.StandardOutputEncoding = new System.Text.UTF8Encoding(false);
        service = new Process { StartInfo = info };
        service.ErrorDataReceived += (s,e) => { if(e.Data!=null) Write(e.Data); };
        service.OutputDataReceived += (s,e) => { int n; if(e.Data!=null && e.Data.StartsWith("OD-DESKTOP-READY ") && int.TryParse(e.Data.Substring(17),out n) && n>0 && n<=65535) Ready.TrySetResult(n); else if(e.Data==null) Ready.TrySetResult(0); else Write(e.Data); };
        service.Start();
        if (!AssignProcessToJobObject(job, service.Handle)) { service.Kill(); throw new System.ComponentModel.Win32Exception(); }
        service.BeginErrorReadLine(); service.BeginOutputReadLine(); service.StandardInput.WriteLine(Secret); service.StandardInput.Flush();
    }
    static bool Local(string address) { Uri uri; return Uri.TryCreate(address,UriKind.Absolute,out uri) && uri.GetLeftPart(UriPartial.Authority) == Origin; }
    // Alt+Space works even when Explorer has hidden the notification icon.
    // Keep Quit separate from SC_CLOSE (hide). No renderer IPC or test-only command.
    sealed class MainWindow : Form {
        const int QuitCommand = 0x1F00;
        [DllImport("user32.dll")] static extern IntPtr GetSystemMenu(IntPtr hwnd, bool revert);
        [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool AppendMenu(IntPtr menu, uint flags, UIntPtr id, string text);
        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            IntPtr menu=GetSystemMenu(Handle,false);
            AppendMenu(menu,0x800,UIntPtr.Zero,null);
            AppendMenu(menu,0,(UIntPtr)QuitCommand,"退出 OpenDirector / &Quit OpenDirector");
        }
        protected override void WndProc(ref Message m) {
            if(m.Msg==0x0112 && (m.WParam.ToInt64() & 0xFFF0)==QuitCommand) {
                if(updates!=null && !closing) BeginInvoke((Action)updates.Quit);
                return;
            }
            base.WndProc(ref m);
        }
    }
    static Form Window(bool primary=false) {
        Form form=primary?(Form)new MainWindow():new Form();
        form.Text="OpenDirector"; form.Icon=AppIcon; form.Size=new Size(1440,900); form.MinimumSize=new Size(800,560);
        form.StartPosition=FormStartPosition.CenterScreen; form.BackColor=Color.FromArgb(24,24,24);
        return form;
    }
    static async Task Mount(Form form, string address) {
        var view = new WebView2 { Dock=DockStyle.Fill, DefaultBackgroundColor=Color.FromArgb(24,24,24) };
        form.Controls.Add(view); view.BringToFront();
        await view.EnsureCoreWebView2Async(engine);
        var core = view.CoreWebView2;
        core.Settings.AreHostObjectsAllowed=false; core.Settings.IsWebMessageEnabled=false;
        core.AddWebResourceRequestedFilter(Origin + "/*", CoreWebView2WebResourceContext.All);
        bool trusted=false;
        string bootstrap=Origin+"/__desktop/bootstrap/"+Ping;
        core.WebResourceRequested += (s,e) => {
            if(e.Request.Uri==bootstrap) {
                // The first document is supplied by the host, never another localhost app.
                var html=new MemoryStream(System.Text.Encoding.UTF8.GetBytes("<!doctype html><title>OpenDirector</title>"));
                e.Response=engine.CreateWebResourceResponse(html,200,"OK","Content-Type: text/html\r\nCache-Control: no-store");
            } else if(trusted && Local(e.Request.Uri)) e.Request.Headers.SetHeader("X-OpenDirector-Desktop",Secret); };
        core.NavigationStarting += (s,e) => { if (!Local(e.Uri)) e.Cancel=true; };
        core.FrameNavigationStarting += (s,e) => { if(!Local(e.Uri) && e.Uri!="about:blank" && !e.Uri.StartsWith("blob:"+Origin+"/",StringComparison.Ordinal)) e.Cancel=true; };
        core.NewWindowRequested += async (s,e) => {
            e.Handled=true; Uri uri; if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)) return;
            try {
                if(Local(e.Uri)) { var child=Window(); child.Show(form); await Mount(child,uri.AbsoluteUri); }
                else if(e.IsUserInitiated && uri.Scheme=="https") Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute=true });
            } catch(Exception ex) { Error(ex); }
        };
        core.ProcessFailed += (s,e) => { if(!closing && (e.ProcessFailedKind==CoreWebView2ProcessFailedKind.BrowserProcessExited || e.ProcessFailedKind==CoreWebView2ProcessFailedKind.RenderProcessExited)) Fail(new Exception("Rendering stopped. Restart the app. / 渲染已中断，请重启应用。")); };
        var loaded=new TaskCompletionSource<bool>();
        EventHandler<CoreWebView2NavigationCompletedEventArgs> onLoad=(s,e)=>loaded.TrySetResult(e.IsSuccess);
        core.NavigationCompleted+=onLoad; core.Navigate(bootstrap);
        try {
            if(await Task.WhenAny(loaded.Task,Task.Delay(15000))!=loaded.Task || !await loaded.Task) throw new IOException("WebView startup timed out / 窗口启动失败");
            // ExecuteScriptAsync does not await JavaScript promises. Poll only the
            // synthetic page, and never hand the renderer the key or expected proof.
            string nonce=Guid.NewGuid().ToString("N");
            string expected;
            using(var h=new HMACSHA256(System.Text.Encoding.ASCII.GetBytes(Secret))) expected=BitConverter.ToString(h.ComputeHash(System.Text.Encoding.ASCII.GetBytes(nonce))).Replace("-","").ToLowerInvariant();
            await core.ExecuteScriptAsync("fetch('/__desktop/probe/"+nonce+"',{cache:'no-store',redirect:'error'}).then(r=>r.text()).then(t=>window.odProof=t).catch(()=>window.odProof='failed');void 0");
            for(int i=0;i<100;i++) { string proof=await core.ExecuteScriptAsync("window.odProof || null"); if(proof=="\""+expected+"\"") { trusted=true; break; } if(proof!="null") break; await Task.Delay(50); }
            if(!trusted) throw new IOException("Cannot authenticate the local service. Restart OpenDirector. / 无法验证本地服务，请重启应用。");
        } finally { core.NavigationCompleted-=onLoad; }
        core.Navigate(address);
    }
    static void Error(Exception e) { Write(e.ToString()); MessageBox.Show(e.Message + "\n\nDiagnostics / 日志: " + Log,"OpenDirector", MessageBoxButtons.OK,MessageBoxIcon.Error); }
    static void Fail(Exception e) { if(closing) return; closing=true; Error(e); main.Close(); }
    [STAThread] public static void Main() {
        SetProcessDPIAware(); Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        bool first;
        using(activation=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\OpenDirectorDesktop.Activate.x64"))
        using(var mutex = new Mutex(true,"Local\\OpenDirectorDesktop.x64",out first)) {
            if(!first) { foreach(var p in Process.GetProcessesByName("OpenDirector")) using(p) { if(p.Id!=Process.GetCurrentProcess().Id) AllowSetForegroundWindow(p.Id); } activation.Set(); return; }
            try {
                Directory.CreateDirectory(State);
                try { if(File.Exists(Log) && new FileInfo(Log).Length>2000000) { File.Copy(Log,Log+".old",true); File.Delete(Log); } }
                catch(IOException) {} catch(UnauthorizedAccessException) {}
                main=Window(true); main.Controls.Add(new Label { Text="OpenDirector   ·   Starting / 正在启动…", ForeColor=Color.White, Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleCenter });
                // WinForms may destroy a hidden form's HWND. Consume the
                // activation event on the UI thread, independently of that HWND.
                var wake=new System.Windows.Forms.Timer { Interval=200 };
                wake.Tick+=(s,e)=>{ if(!closing && activation.WaitOne(0)) { Restore(); Write("Activated existing window"); } };
                wake.Start();
                main.Shown += async (s,e) => { try {
                    StartService();
                    if(await Task.WhenAny(Ready.Task,Task.Delay(60000))!=Ready.Task || (port=await Ready.Task)==0) throw new Exception("Local service did not start. Check the diagnostic log. / 服务启动失败，请检查诊断日志。");
                    Write("Local service ready on loopback port " + port);
                    File.WriteAllBytes(Ticket, ProtectedData.Protect(System.Text.Encoding.ASCII.GetBytes(port+"\n"+Secret),null,DataProtectionScope.CurrentUser));
                    service.Exited += (p,a) => { if(!closing && main.IsHandleCreated) main.BeginInvoke((Action)(() => Fail(new Exception("Service exited. Restart OpenDirector. / 服务已退出，请重启应用。")))); };
                    service.EnableRaisingEvents=true;
                    engine=await CoreWebView2Environment.CreateAsync(null, Path.Combine(State,"WebView2"),new CoreWebView2EnvironmentOptions("--host-resolver-rules=\"MAP 127.0.0.1:48765 127.0.0.1:"+port+"\""));
                    await Mount(main,Origin+"/");
                    if(!closing) updates=new Updates(main, Restore, Confirm, () => { closing=true; main.Close(); }, Write,
                        p => { if(!AssignProcessToJobObject(job,p.Handle) && !p.HasExited) throw new System.ComponentModel.Win32Exception(); });
                } catch(WebView2RuntimeNotFoundException) { Fail(new Exception("Install Microsoft Edge WebView2 Evergreen Runtime (x64), then reopen. / 请安装微软 WebView2 Evergreen x64 运行时后重试。")); }
                  catch(Exception ex) { Fail(ex); } };
                main.FormClosing += (s,e) => {
                    if(!closing && updates!=null && updates.Applying) { e.Cancel=true; return; }
                    if(!closing && updates!=null && e.CloseReason==CloseReason.UserClosing) { e.Cancel=true; main.Hide(); updates.Hidden(); return; }
                    closing=true;
                };
                try { Application.Run(main); } finally { wake.Dispose(); }
            } catch(Exception e) { Error(e); }
            finally { closing=true; if(updates!=null) updates.Dispose(); try { if(service!=null && !service.HasExited) { service.StandardInput.Close(); service.WaitForExit(5000); } } catch(InvalidOperationException) {} finally { if(job!=IntPtr.Zero) CloseHandle(job); try { File.Delete(Ticket); } catch(IOException) {} } }
        }
    }
}

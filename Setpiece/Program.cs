using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;

namespace Setpiece.Rebuild;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var dataIndex = Array.IndexOf(args, "--data-root");
        var storage = new Storage(dataIndex >= 0 && args.Length > dataIndex + 1 ? args[dataIndex + 1] : null);
        var identity = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(storage.Root.ToUpperInvariant())))[..20];
        using var single = new Mutex(true, "Local\\Setpiece.Rebuild." + identity, out var first);
        if (!first)
        {
            try { using var pipe = new NamedPipeClientStream(".", "Setpiece.Rebuild." + identity, PipeDirection.Out);pipe.Connect(3000); }
            catch (IOException) { MessageBox.Show("Setpiece is already opening. Try again in a moment.", "Setpiece"); }
            catch (TimeoutException) { MessageBox.Show("The existing Setpiece window did not respond. Check its process before reopening.", "Setpiece"); }
            return;
        }
        if (Refresh.TryStart(args, storage)) return;
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => { storage.Log("Unhandled UI exception", e.Exception);MessageBox.Show("Setpiece encountered a problem. Your saved files are preserved.\n" + e.Exception.Message, "Setpiece"); };
        using var host = new Host(storage);
        var auditIndex=Array.IndexOf(args,"--capture-suite");
        if(auditIndex>=0){if(dataIndex<0||args.Length<=auditIndex+1)throw new InvalidOperationException("Visual audit requires --data-root and an output folder.");host.AuditOutput=Path.GetFullPath(args[auditIndex+1]);}
        using var cancellation = new CancellationTokenSource();
        _ = Task.Run(async () =>
        {
            while (!cancellation.IsCancellationRequested)
            {
                try
                {
                    using var pipe = new NamedPipeServerStream("Setpiece.Rebuild." + identity, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous|PipeOptions.CurrentUserOnly);
                    await pipe.WaitForConnectionAsync(cancellation.Token);
                    if (host.IsHandleCreated) host.BeginInvoke(() => { host.Show();if(host.WindowState == FormWindowState.Minimized)host.WindowState = FormWindowState.Normal;host.Activate();Windows.SetForegroundWindow(host.Handle); });
                }
                catch (OperationCanceledException) { break; }
                catch (IOException error) { storage.Log("Activation pipe", error); }
            }
        });
        Application.Run(host);
        cancellation.Cancel();
    }
}

internal static class Refresh
{
    internal static bool IsDue(string[] args, string directory, string? devFlag)
    {
        if (args.Contains("--skip-production-refresh")) return false;
        var marker = Path.Combine(directory, "setpiece.dev");
        if (devFlag != "1" && !File.Exists(marker)) return false;
        var stamp = Path.Combine(directory, "production.stamp");
        return devFlag == "1" || File.GetLastWriteTimeUtc(marker) > (File.Exists(stamp) ? File.GetLastWriteTimeUtc(stamp) : DateTime.MinValue);
    }

    public static bool TryStart(string[] args, Storage storage)
    {
        if (args.Contains("--skip-production-refresh")) { storage.Log("Production refresh skipped by flag.");return false; }
        if (!IsDue(args, AppContext.BaseDirectory, Environment.GetEnvironmentVariable("SETPIECE_DEV"))) return false;
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "build.ps1"))) directory = directory.Parent;
        if (directory is null) return false;
        var root = directory.FullName;
        var start = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = root };
        foreach (var value in new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", Path.Combine(root, "build.ps1"), "-Relaunch", "-WaitForProcess", Environment.ProcessId.ToString(), "-DataRoot", storage.Root }) start.ArgumentList.Add(value);
        Process.Start(start);storage.Log("Production rebuild requested; canonical relaunch follows a successful build.");return true;
    }
}

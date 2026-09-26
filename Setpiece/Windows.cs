using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal static class Windows
{
    internal delegate bool WindowVisitor(nint window, nint state);
    internal delegate void EventCallback(nint hook, uint kind, nint window, int objectId, int childId, uint thread, uint time);
    [StructLayout(LayoutKind.Sequential)] internal struct Rect { public int Left, Top, Right, Bottom; public readonly Rectangle Bounds => Rectangle.FromLTRB(Left, Top, Right, Bottom); }
    [StructLayout(LayoutKind.Sequential)] internal struct Placement {public int Length,Flags,Show;public Point Min,Max;public Rect Normal;}
    [DllImport("user32.dll")] internal static extern bool GetWindowPlacement(nint window,ref Placement placement);
    [DllImport("user32.dll")] internal static extern bool SetWindowPlacement(nint window,ref Placement placement);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] internal static extern nint FindWindowEx(nint parent,nint after,string? className,string? title);
    [DllImport("user32.dll")] internal static extern bool SetLayeredWindowAttributes(nint window,uint color,byte alpha,uint flags);
    [DllImport("user32.dll")] internal static extern bool EnumWindows(WindowVisitor visitor, nint state);
    [DllImport("user32.dll")] internal static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] internal static extern bool IsWindow(nint window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int GetWindowText(nint window, StringBuilder text, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int GetClassName(nint window, StringBuilder text, int capacity);
    [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("user32.dll")] internal static extern nint GetWindow(nint window, uint kind);
    [DllImport("user32.dll")] internal static extern bool GetWindowRect(nint window, out Rect rect);
    [DllImport("user32.dll", SetLastError = true)] internal static extern bool SetWindowPos(nint window, nint after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] internal static extern bool ShowWindow(nint window, int command);
    [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] internal static extern bool ReleaseCapture();
    [DllImport("user32.dll")] internal static extern nint SendMessage(nint window, uint message, nint wparam, nint lparam);
    [DllImport("user32.dll")] internal static extern nint SetWinEventHook(uint min, uint max, nint module, EventCallback callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] internal static extern bool UnhookWinEvent(nint hook);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] internal static extern nint GetWindowLongPtr(nint window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] internal static extern nint SetWindowLongPtr(nint window, int index, nint value);
    [DllImport("dwmapi.dll")] internal static extern int DwmGetWindowAttribute(nint window, uint attribute, out int value, int size);
    [DllImport("dwmapi.dll")] internal static extern int DwmGetWindowAttribute(nint window, uint attribute, out Rect value, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(nint window, uint attribute, ref int value, int size);
    internal static bool ApplyRoundedCorners(nint window,bool rounded=true)
    {
        // DWMWA_WINDOW_CORNER_PREFERENCE lets the compositor antialias the edge;
        // a GDI Region produces visibly stair-stepped corners on scaled displays.
        var preference=rounded?2:1;
        try{return DwmSetWindowAttribute(window,33,ref preference,sizeof(int))==0;}catch(DllNotFoundException){return false;}catch(EntryPointNotFoundException){return false;}
    }
    [StructLayout(LayoutKind.Sequential)] private struct Margins { public int Left,Right,Top,Bottom; }
    [DllImport("dwmapi.dll")] private static extern int DwmExtendFrameIntoClientArea(nint window, ref Margins margins);
    internal static void ExtendGlass(nint window)
    {
        // A sheet of glass makes the window's transparent pixels truly
        // transparent, so the widget's anti-aliased rounded card is composited
        // directly over the desktop with no rectangular window edge behind it.
        try{var margins=new Margins{Left=-1,Right=-1,Top=-1,Bottom=-1};DwmExtendFrameIntoClientArea(window,ref margins);}
        catch(DllNotFoundException){}
        catch(EntryPointNotFoundException){}
    }
    public static JsonArray Displays() => new(Screen.AllScreens.Select((s, i) => (JsonNode)new JsonObject { ["index"] = i, ["name"] = s.DeviceName, ["width"] = s.Bounds.Width, ["height"] = s.Bounds.Height, ["x"] = s.Bounds.X, ["y"] = s.Bounds.Y, ["primary"] = s.Primary }).ToArray());
    internal static string? TryReadProcessName(Func<string> read)
    {
        try { return read(); }
        catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException) { return null; }
    }
    public static void BehindApplications(nint layer)
    {
        nint desktop=0;EnumWindows((window,_)=>{if(FindWindowEx(window,0,"SHELLDLL_DefView",null)!=0){desktop=window;return false;}return true;},0);
        var predecessor=desktop==0?1:GetWindow(desktop,3);if(predecessor==layer)predecessor=GetWindow(layer,3);
        SetWindowPos(layer,predecessor,0,0,0,0,0x13);
    }
    public static JsonArray Visible()
    {
        var result = new JsonArray();
        EnumWindows((window, _) =>
        {
            if (!IsWindowVisible(window) || GetWindow(window, 4) != 0) return true;
            if(((long)GetWindowLongPtr(window,-20)&0x80)!=0)return true;
            var className=new StringBuilder(256);GetClassName(window,className,className.Capacity);
            if(className.ToString() is "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd")return true;
            GetWindowThreadProcessId(window, out var pid);
            if (pid == Environment.ProcessId) return true;
            int cloaked;DwmGetWindowAttribute(window, 14, out cloaked, sizeof(int));
            if (cloaked != 0) return true;
            var title = new StringBuilder(1024); GetWindowText(window, title, title.Capacity);
            if (title.Length == 0) return true;
            try
            {
                using var process = Process.GetProcessById((int)pid);
                var processName = TryReadProcessName(() => process.ProcessName);
                if (processName is not null) result.Add(new JsonObject { ["handle"] = window.ToString(), ["title"] = title.ToString(), ["process"] = processName });
            }
            catch (ArgumentException) { }
            return true;
        }, 0);
        return result;
    }
}

internal sealed class WindowCoordinator : IDisposable
{
    private sealed record Attachment(nint Handle, uint Process, long Started, Windows.Placement Original,string Name,string Title);
    private readonly Dictionary<string, Attachment> attachments = [];
    private readonly Dictionary<nint, Windows.Placement> pendingMoves = [];
    private readonly Dictionary<nint, bool> taskbars = [];
    private readonly Windows.EventCallback callback;
    private readonly nint hook;
    private readonly nint destroyedHook;
    private readonly Control dispatcher;
    public event Action<string>? Detached;
    public event Action<nint>? MoveEnded;
    public WindowCoordinator(Control dispatcher)
    {
        this.dispatcher = dispatcher;
        callback = Observe;
        hook = Windows.SetWinEventHook(0x000A, 0x000B, 0, callback, 0, 0, 2);
        destroyedHook=Windows.SetWinEventHook(0x8001,0x8001,0,callback,0,0,2);
        if (hook == 0) throw new InvalidOperationException("Windows could not start application movement tracking.");
    }
    private void Observe(nint token, uint kind, nint window, int objectId, int childId, uint thread, uint time)
    {
        if(kind==0x000A)
        {
            var entry=attachments.FirstOrDefault(p=>p.Value.Handle==window);
            if(entry.Key is not null){attachments.Remove(entry.Key);dispatcher.BeginInvoke(()=>Detached?.Invoke(entry.Key));return;}
            if(!Windows.IsWindow(window))return;Windows.GetWindowThreadProcessId(window,out var process);if(process==Environment.ProcessId)return;
            var original=new Windows.Placement{Length=Marshal.SizeOf<Windows.Placement>()};if(Windows.GetWindowPlacement(window,ref original))pendingMoves[window]=original;
            return;
        }
        if(kind==0x000B)
        {
            if(pendingMoves.ContainsKey(window))dispatcher.BeginInvoke(()=>MoveEnded?.Invoke(window));
            return;
        }
        if(kind!=0x8001||objectId!=0||childId!=0)return;
        pendingMoves.Remove(window);var destroyed=attachments.FirstOrDefault(p=>p.Value.Handle==window);if(destroyed.Key is null)return;attachments.Remove(destroyed.Key);dispatcher.BeginInvoke(()=>Detached?.Invoke(destroyed.Key));
    }
    public void Assign(string id, string handle, Rectangle destination)
    {
        if (!nint.TryParse(handle, out var hwnd) || !Windows.IsWindow(hwnd)) throw new InvalidOperationException("That window has closed. Refresh the app list.");
        Windows.GetWindowThreadProcessId(hwnd, out var pid);
        if (pid == Environment.ProcessId) throw new InvalidOperationException("Choose an external application.");
        var original=new Windows.Placement{Length=Marshal.SizeOf<Windows.Placement>()};if(!pendingMoves.Remove(hwnd,out original)&&!Windows.GetWindowPlacement(hwnd,ref original))throw new InvalidOperationException("The application window is no longer available.");
        var already=attachments.FirstOrDefault(p=>p.Value.Handle==hwnd);
        long started;try{using var process=Process.GetProcessById((int)pid);started=process.StartTime.ToUniversalTime().Ticks;}catch(Exception error) when(error is ArgumentException or System.ComponentModel.Win32Exception or InvalidOperationException){throw new InvalidOperationException("Windows could not verify this application's identity.");}
        var previous = attachments.GetValueOrDefault(id);
        Windows.ShowWindow(hwnd, 9);
        var placement=PlacementBounds(hwnd,destination);
        if (!Windows.SetWindowPos(hwnd, 0, placement.X, placement.Y, placement.Width, placement.Height, 0x4010)){Windows.SetWindowPlacement(hwnd,ref original);throw new InvalidOperationException("Windows refused this placement. Check the application's permissions.");}
        if(already.Key is not null&&already.Key!=id){attachments.Remove(already.Key);Detached?.Invoke(already.Key);}
        if (previous is not null && previous.Handle != hwnd) Restore(previous);
        var title=new StringBuilder(1024);Windows.GetWindowText(hwnd,title,title.Capacity);using var assignedProcess=Process.GetProcessById((int)pid);
        attachments[id] = already.Value??new Attachment(hwnd,pid,started,original,assignedProcess.ProcessName,title.ToString());
    }
    public bool Matches(string id,string name,string title)=>attachments.TryGetValue(id,out var entry)&&SameWindow(entry)&&entry.Name.Equals(name,StringComparison.OrdinalIgnoreCase)&&entry.Title==title;
    public void ForgetPendingMove(nint handle)=>pendingMoves.Remove(handle);
    public void Place(string id, Rectangle destination)
    {
        if (!attachments.TryGetValue(id, out var entry)) return;
        Windows.GetWindowThreadProcessId(entry.Handle, out var process);
        if (!SameWindow(entry)) { attachments.Remove(id); Detached?.Invoke(id); return; }
        var placement=PlacementBounds(entry.Handle,destination);
        Windows.SetWindowPos(entry.Handle, 0, placement.X, placement.Y, placement.Width, placement.Height, 0x4014);
    }
    private static Rectangle PlacementBounds(nint window,Rectangle visualDestination)
    {
        // Windows reports the resize frame (including its transparent DWM shadow)
        // as part of the window rectangle. Offset that invisible frame so the
        // pixels the user can actually see land exactly on the tile boundary.
        if(!Windows.GetWindowRect(window,out var outer)||Windows.DwmGetWindowAttribute(window,9,out Windows.Rect visual,Marshal.SizeOf<Windows.Rect>())!=0)
            return visualDestination;
        var left=visual.Left-outer.Left;var top=visual.Top-outer.Top;
        var right=outer.Right-visual.Right;var bottom=outer.Bottom-visual.Bottom;
        return Rectangle.FromLTRB(visualDestination.Left-left,visualDestination.Top-top,visualDestination.Right+right,visualDestination.Bottom+bottom);
    }
    public static Rectangle TileBounds(JsonObject profile, JsonObject board, JsonObject tile)
    {
        var index = board["MonitorIndex"]!.GetValue<int>();
        if (index < 0 || index >= Screen.AllScreens.Length) throw new InvalidOperationException("This display is disconnected. Choose an available display.");
        return TileBounds(Screen.AllScreens[index].Bounds,profile,board,tile);
    }
    internal static Rectangle TileBounds(Rectangle screen,JsonObject profile,JsonObject board,JsonObject tile)
    {
        var margin = Math.Min(profile["OuterMargin"]!.GetValue<double>(),Math.Max(0,(Math.Min(screen.Width,screen.Height)-1)/2d));
        var gap = profile["Gap"]!.GetValue<double>();
        // A shared gap must fit the smallest tile on this display, including
        // narrow partitions restored from profiles made on a larger monitor.
        foreach(var zone in board["Zones"]!.AsArray().OfType<JsonObject>())
            gap=Math.Min(gap,Math.Max(0,Math.Min(zone["Width"]!.GetValue<double>()*(screen.Width-2*margin),zone["Height"]!.GetValue<double>()*(screen.Height-2*margin))-1));
        var x = tile["X"]!.GetValue<double>();var y = tile["Y"]!.GetValue<double>();var w = tile["Width"]!.GetValue<double>();var h = tile["Height"]!.GetValue<double>();
        var left = screen.X + margin + x * (screen.Width - 2 * margin) + (x > .000001 ? gap / 2 : 0);
        var top = screen.Y + margin + y * (screen.Height - 2 * margin) + (y > .000001 ? gap / 2 : 0);
        var right = screen.X + margin + (x + w) * (screen.Width - 2 * margin) - (x + w < .999999 ? gap / 2 : 0);
        var bottom = screen.Y + margin + (y + h) * (screen.Height - 2 * margin) - (y + h < .999999 ? gap / 2 : 0);
        var pixelLeft=(int)Math.Round(left);var pixelTop=(int)Math.Round(top);
        return Rectangle.FromLTRB(pixelLeft,pixelTop,Math.Max(pixelLeft+1,(int)Math.Round(right)),Math.Max(pixelTop+1,(int)Math.Round(bottom)));
    }
    public void Release(string id) { if (attachments.Remove(id, out var entry)) Restore(entry); }
    public void ReleaseAll() { foreach (var id in attachments.Keys.ToArray()) Release(id); }
    public void Retain(IReadOnlySet<string> ids){foreach(var id in attachments.Keys.Where(id=>!ids.Contains(id)).ToArray())Release(id);}
    internal nint? AttachedHandle(string id)=>attachments.TryGetValue(id,out var entry)?entry.Handle:null;
    internal static JsonObject? RestoreCandidate(JsonArray visible,string process,string title,IReadOnlySet<string> reservedHandles,bool allowTitleFallback=true)
    {
        if(string.IsNullOrWhiteSpace(process))return null;
        var matches=visible.OfType<JsonObject>().Where(w=>string.Equals(w["process"]?.GetValue<string>(),process,StringComparison.OrdinalIgnoreCase)).ToArray();
        var exact=matches.Where(w=>w["title"]?.GetValue<string>()==title).ToArray();
        if(exact.Length>1)return null;
        var candidate=exact.Length==1?exact[0]:allowTitleFallback&&matches.Length==1?matches[0]:null;
        if(candidate is null)return null;
        var handle=candidate["handle"]?.GetValue<string>();
        return !string.IsNullOrWhiteSpace(handle)&&!reservedHandles.Contains(handle)?candidate:null;
    }
    private static bool SameWindow(Attachment entry)
    {
        if(!Windows.IsWindow(entry.Handle))return false;Windows.GetWindowThreadProcessId(entry.Handle,out var pid);if(pid!=entry.Process)return false;
        try{using var process=Process.GetProcessById((int)pid);return process.StartTime.ToUniversalTime().Ticks==entry.Started;}catch(Exception error) when(error is ArgumentException or System.ComponentModel.Win32Exception or InvalidOperationException){return false;}
    }
    private static void Restore(Attachment entry)
    {
        if(SameWindow(entry)){var placement=entry.Original;Windows.SetWindowPlacement(entry.Handle,ref placement);}
    }
    public void HideTaskbars(IReadOnlySet<int> displays)
    {
        foreach(var pair in taskbars.ToArray())
        {
            var screen=Screen.FromHandle(pair.Key);var index=Array.FindIndex(Screen.AllScreens,s=>s.DeviceName==screen.DeviceName);
            if(displays.Contains(index)&&Windows.IsWindow(pair.Key))continue;
            if(pair.Value&&Windows.IsWindow(pair.Key))Windows.ShowWindow(pair.Key,5);taskbars.Remove(pair.Key);
        }
        Windows.EnumWindows((window, _) =>
        {
            var name = new StringBuilder(128);Windows.GetClassName(window, name, name.Capacity);
            if (name.ToString() is not ("Shell_TrayWnd" or "Shell_SecondaryTrayWnd")) return true;
            var screen = Screen.FromHandle(window);var index = Array.FindIndex(Screen.AllScreens, s => s.DeviceName == screen.DeviceName);
            if (displays.Contains(index)) { if(!taskbars.ContainsKey(window))taskbars[window] = Windows.IsWindowVisible(window);Windows.ShowWindow(window, 0); }
            return true;
        }, 0);
    }
    public void RestoreTaskbars() { foreach (var pair in taskbars) if (pair.Value && Windows.IsWindow(pair.Key)) Windows.ShowWindow(pair.Key, 5); taskbars.Clear(); }
    public void Dispose() { Windows.UnhookWinEvent(hook);Windows.UnhookWinEvent(destroyedHook);ReleaseAll();RestoreTaskbars();GC.KeepAlive(callback); }
}

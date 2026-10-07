using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal sealed class Host : Form
{
    private readonly Storage storage;
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private WindowCoordinator? windows;
    private readonly Providers providers;
    private readonly List<Surface> surfaces = [];
    private readonly SemaphoreSlim layoutGate=new(1);
    private readonly Dictionary<string, BrowserSurface> browsers = new(StringComparer.OrdinalIgnoreCase);
    private CoreWebView2Environment? environment;
    private JsonObject? active;
    private bool launched;
    private bool closingConfirmed;
    private ReleaseUpdate? pendingUpdate;
    internal string? AuditOutput;
    public Host(Storage storage)
    {
        this.storage = storage;providers = new Providers(storage);
        providers.Pushed += service => { if(IsHandleCreated&&!IsDisposed)BeginInvoke(()=>{var message=PageMessage("service",JsonValue.Create(service));Post(message);foreach(var surface in surfaces)surface.Post(message);}); };
        Text = "Setpiece";if(Windows.AppIcon.Value is { } icon)Icon=icon;Size = new Size(1440, 960);MinimumSize = new Size(1040, 680);StartPosition = FormStartPosition.CenterScreen;FormBorderStyle = FormBorderStyle.None;BackColor = SurfaceColor;
        Controls.Add(view);Shown += async (_, _) => await Initialize();
        // WebView2 keeps drawing a minimized window unless it is told the page is hidden. Hidden, Studio stops
        // drawing, its timers slow down, its widgets stop polling and it gives memory back until it is restored.
        Resize += (_, _) => { ShowInterface(WindowState != FormWindowState.Minimized); WatchCover(); };
        coverCheck.Tick += (_, _) => CheckCover();
        FormClosing+=(_,e)=>{if(!closingConfirmed&&AuditOutput is null&&view.CoreWebView2 is not null&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Emit("request-close",null);}};
        FormClosed += (_, _) => { coverCheck.Dispose();coverWatch?.Dispose();foreach (var surface in surfaces) surface.Dispose();foreach (var browser in browsers.Values)browser.Dispose();windows?.Dispose();providers.Dispose(); };
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged += DisplayChanged;
        Disposed += (_, _) => Microsoft.Win32.SystemEvents.DisplaySettingsChanged -= DisplayChanged;
    }
    private System.Windows.Forms.Timer? displaySettle;
    /**
     * A monitor slept, woke or was replugged. Windows reorders its screens and renumbers them, and fires this
     * several times while it does, so the workspace waits for the change to settle, then finds every board's
     * monitor again by its identity and puts the desks, browsers and apps back where they belong.
     */
    private void DisplayChanged(object? sender, EventArgs e)
    {
        if(!IsHandleCreated)return;
        BeginInvoke(() =>
        {
            displaySettle?.Stop();displaySettle??=new System.Windows.Forms.Timer{Interval=1500};
            displaySettle.Tick-=DisplaySettled;displaySettle.Tick+=DisplaySettled;displaySettle.Start();
        });
    }
    private async void DisplaySettled(object? sender, EventArgs e)
    {
        displaySettle?.Stop();Emit("displays", Windows.Displays());
        if(active is null)return;
        await layoutGate.WaitAsync();
        try{ResolveDisplays(active);if(launched)await Launch(false);Emit("profile",active);}
        // An async event handler must not throw: a failed re-placement is logged and the next change tries again.
        catch(Exception error){storage.Log("Display change",error);}
        finally{layoutGate.Release();}
    }
    private async Task Initialize()
    {
        try
        {
            windows = new WindowCoordinator(this);
            windows.Detached += id => { if(active is not null) foreach(var tile in Tiles(active))if(tile["Id"]!.GetValue<string>()==id){tile["AssignedProcessName"]="";tile["AssignedWindowTitle"]="";}Emit("detached", JsonValue.Create(id)); };
            windows.MoveEnded += AutoAssignMovedWindow;
            if(AuditOutput is null){coverWatch=new Cover.Watcher(CheckCover);WatchCover();}
            environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(storage.Root,"Browser-v2"), new CoreWebView2EnvironmentOptions { AreBrowserExtensionsEnabled = true });
            await Configure(view);
            view.CoreWebView2.Navigate("https://setpiece.local/index.html");
            if(AuditOutput is not null){await VisualAudit.Run(this,storage,AuditOutput);Close();}
        }
        catch (Exception error) { storage.Log("Startup: " + error);MessageBox.Show("Setpiece could not open its interface.\n" + error.Message + "\nInstall or repair Microsoft Edge WebView2 Runtime, then try again.", "Setpiece");closingConfirmed=true;Close(); }
    }
    internal async Task Configure(WebView2 browser, bool privileged=true, Func<string,JsonObject,Task<JsonNode?>>? handler=null)
    {
        var options=environment!.CreateCoreWebView2ControllerOptions();options.ProfileName=privileged?"Interface":"Browsing";
        // Setpiece's own pages never show WebView2's default white: while a page loads, or while the graphics
        // process recovers, the desk and the main window stay their own dark colour instead of flashing a white display.
        if(privileged)browser.DefaultBackgroundColor=SurfaceColor;
        await browser.EnsureCoreWebView2Async(environment,options);
        browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
        // High-DPI policy (documented decision, deliberately explicit so it cannot drift):
        // Program.Main sets HighDpiMode.PerMonitorV2, so WinForms scales this borderless host by the
        // monitor scale factor and the docked WebView2 client area grows with it. The controller
        // therefore keeps the documented WebView2 defaults - raw-pixel bounds with RasterizationScale
        // tracking the monitor - which makes the CSS viewport equal the window in device-independent
        // pixels at every scale from 100% to 200%, keeping WindowCoordinator's CSS-px tile math and
        // domain.ts tilePercentBounds DPI-invariant.
        //
        // Deliberately NOT set here: CoreWebView2Controller.BoundsMode (UseRawPixels) and
        // CoreWebView2Controller.ShouldDetectMonitorScaleChanges (true). The WinForms wrapper in
        // Microsoft.Web.WebView2 1.0.4191.47 does not surface CoreWebView2Controller at all - it exposes
        // only ZoomFactor and EnsureCoreWebView2Async(environment, options), and
        // CoreWebView2ControllerOptions carries just ProfileName / IsInPrivateModeEnabled - so those two
        // properties stay at the defaults described above, which is precisely the behaviour we want.
        //
        // ZoomFactor is pinned to 1 on purpose: the in-app --ui-scale / --font-scale preferences are the
        // user-facing scale controls, and any other ZoomFactor would silently rescale the layout envelope
        // so a 1040x680 window would no longer correspond to a 1040x680 CSS viewport, breaking tile-bounds
        // parity.
        browser.ZoomFactor = 1;
        if (!privileged) return;
        // A desk or the main window whose page process stops would otherwise stay blank until Setpiece restarts.
        browser.CoreWebView2.ProcessFailed += (_, e) =>
        {
            storage.Log("WebView process failed: "+e.ProcessFailedKind+" ("+e.Reason+", exit "+e.ExitCode+") on "+browser.CoreWebView2.Source);
            if(e.ProcessFailedKind is CoreWebView2ProcessFailedKind.RenderProcessExited or CoreWebView2ProcessFailedKind.RenderProcessUnresponsive or CoreWebView2ProcessFailedKind.FrameRenderProcessExited)
                BeginInvoke(()=>{if(!browser.IsDisposed)browser.CoreWebView2.Reload();});
        };
        browser.CoreWebView2.SetVirtualHostNameToFolderMapping("setpiece.local", Path.Combine(AppContext.BaseDirectory,"UI"), CoreWebView2HostResourceAccessKind.DenyCors);
        browser.CoreWebView2.SetVirtualHostNameToFolderMapping("assets.setpiece.local", Path.Combine(AppContext.BaseDirectory,"Assets"), CoreWebView2HostResourceAccessKind.DenyCors);
        browser.CoreWebView2.NavigationStarting += (_, e) => { if (!Uri.TryCreate(e.Uri,UriKind.Absolute,out var uri) || uri.Host != "setpiece.local")e.Cancel = true; };
        browser.CoreWebView2.NewWindowRequested += (_, e) => { e.Handled = true;OpenExternal(e.Uri); };
        browser.CoreWebView2.WebMessageReceived += async (_, e) =>
        {
            if (!Uri.TryCreate(e.Source,UriKind.Absolute,out var origin) || origin.Scheme != "https" || origin.Host != "setpiece.local" || e.WebMessageAsJson.Length > 2_000_000) return;
            int id = 0;
            try
            {
                var request = JsonNode.Parse(e.WebMessageAsJson)!.AsObject();id = request["id"]!.GetValue<int>();
                var result = await (handler??HandleCommand)(request["command"]!.GetValue<string>(), request["payload"]?.AsObject() ?? new JsonObject());
                if(!browser.IsDisposed)browser.CoreWebView2.PostWebMessageAsJson(new JsonObject { ["id"] = id, ["result"] = result }.ToJsonString());
            }
            catch (Exception error) { storage.Log("Command failed", error);if(!browser.IsDisposed)browser.CoreWebView2.PostWebMessageAsJson(new JsonObject { ["id"] = id, ["error"] = error.Message }.ToJsonString()); }
        };
    }
    internal async Task<JsonNode?> HandleCommand(string command, JsonObject payload)
    {
        var serialized=command is "profile" or "switch-profile" or "assign" or "release" or "launch" or "stop";
        if(serialized)await layoutGate.WaitAsync();
        try{return await DispatchCommand(command,payload);}finally{if(serialized)layoutGate.Release();}
    }
    private async Task<JsonNode?> DispatchCommand(string command, JsonObject payload)
    {
        switch (command)
        {
            case "bootstrap":
                var profiles=storage.Profiles();foreach(var entry in profiles.OfType<JsonObject>())if(entry["profile"] is JsonObject stored)ResolveDisplays(stored);
                return new JsonObject { ["profiles"] = profiles, ["displays"] = Windows.Displays(), ["preferences"] = storage.Preferences(), ["connections"] = providers.PublicSettings(), ["browsers"] = BrowserCatalog(), ["executable"] = Environment.ProcessPath, ["dataRoot"] = storage.Root, ["runtime"] = environment?.BrowserVersionString, ["profile"] = active?.DeepClone(), ["launched"] = launched };
            case "check-update":
                pendingUpdate = await ReleaseUpdates.Check();
                return new JsonObject { ["current"] = ReleaseUpdates.Current.ToString(3), ["latest"] = pendingUpdate?.Version.ToString(3), ["url"] = pendingUpdate?.Page.ToString() };
            case "install-update":
                if (pendingUpdate is null) throw new InvalidOperationException("Check for an update first.");
                var update = pendingUpdate;
                pendingUpdate = null;
                await ReleaseUpdates.DownloadAndStart(update);
                BeginInvoke(() => { closingConfirmed = true;Close(); });
                return null;
            case "windows": return Windows.Visible();
            case "save": var savedProfile=Storage.Normalize(payload["profile"]!.AsObject(),false);StampDisplayNames(savedProfile);return JsonValue.Create(storage.SaveProfile(payload["key"]?.GetValue<string>(),savedProfile));
            case "delete": storage.DeleteProfile(payload["key"]!.GetValue<string>());return null;
            case "preferences": storage.SaveDocument("appearance-v2.json",payload);Broadcast("appearance",payload);return null;
            case "profile": active = Storage.Normalize(payload["profile"]!.AsObject(),false);ResolveDisplays(active);PlaceActive(payload["restoreApplications"]?.GetValue<bool>()??false);if(launched)await Launch(false);else foreach(var browser in browsers.Values)browser.Emit("profile",active);return null;
            case "switch-profile": windows!.ReleaseAll();active=Storage.Normalize(payload["profile"]!.AsObject(),false);ResolveDisplays(active);if(launched)await Launch(true);return null;
            case "assign":
                var candidate=Storage.Normalize(payload["profile"]!.AsObject(),false);ResolveDisplays(candidate);var tileId = payload["id"]!.GetValue<string>();
                var (board,tile) = FindTile(tileId,candidate);
                if(tile["ContentKind"]!.GetValue<string>()!="Application")throw new InvalidOperationException("Widgets and browser tiles cannot receive applications.");
                var before=active;active=candidate;
                try{windows!.Assign(tileId,payload["handle"]!.GetValue<string>(),WindowCoordinator.TileBounds(candidate,board,tile));}catch{active=before;throw;}
                return active.DeepClone();
            case "release": windows!.Release(payload["id"]!.GetValue<string>());return null;
            case "launch": active = Storage.Normalize(payload["profile"]!.AsObject(),false);ResolveDisplays(active);StampDisplayNames(active);var key=storage.SaveProfile(payload["key"]?.GetValue<string>(),active);await Launch(true);Emit("workspace",JsonValue.Create(launched));return JsonValue.Create(key);
            case "stop": launched=false;foreach(var s in surfaces)s.Dispose();surfaces.Clear();foreach(var b in browsers.Values)b.Hide();windows!.ReleaseAll();windows.RestoreTaskbars();WatchCover();Emit("workspace",JsonValue.Create(false));return null;
            case "volume": return providers.SetVolume(payload);
            case "discord-voice":return await providers.VoiceControl(payload);
            case "twitch-say":return await providers.TwitchSay(payload);
            case "spotify-playback":return await providers.Playback(payload);
            case "spotify-like":return await providers.SaveTrack(payload);
            case "manage-widget":Show();WindowState=FormWindowState.Normal;Activate();Emit("manage-widget",payload["id"]);return null;
            case "inspect-widget":Show();WindowState=FormWindowState.Normal;Activate();Emit("inspect-widget",payload["id"]);return null;
            case "service": return await providers.Read(payload["service"]!.GetValue<string>());
            case "connect":var connected=await providers.Connect(payload);Broadcast("connections",providers.PublicSettings());return connected;
            case "disconnect":providers.Disconnect(payload["service"]!.GetValue<string>());Broadcast("connections",providers.PublicSettings());return null;
            case "claude-sign-in":AiUsage.OpenClaudeSignIn();return null;
            case "stop-search": return await providers.SearchStops(payload["query"]!.GetValue<string>());
            case "timezone-search": return await providers.SearchTimezones(payload["query"]?.GetValue<string>()??"");
            case "note-read": return storage.ReadOptional("notes-v2.json");
            // Every open Notes widget (Studio and the desk) shows the same note, so a save reaches them all.
            case "note-save": storage.SaveDocument("notes-v2.json",payload);Broadcast("note",payload);return JsonValue.Create(DateTimeOffset.Now.ToString("O"));
            case "brave-bookmarks": return BraveBookmarks.Import(storage);
            case "brave-bookmarks-read": return BraveBookmarks.Read(storage);
            case "external": OpenExternal(payload["url"]!.GetValue<string>());return null;
            case "window":
                switch(payload["action"]!.GetValue<string>()) { case "drag":Windows.ReleaseCapture();Windows.SendMessage(Handle,0xA1,2,0);break;case "minimize":WindowState=FormWindowState.Minimized;break;case "maximize":MaximizedBounds=Screen.FromControl(this).WorkingArea;WindowState=WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;break;case "close":Close();break;case "close-confirmed":closingConfirmed=true;Close();break; }
                return null;
            case "browser-open": await OpenBrowser(payload["name"]!.GetValue<string>(),payload["url"]?.GetValue<string>()??"https://www.youtube.com/",new Rectangle(Location.X+80,Location.Y+100,1000,700),null,false,false);return null;
            case "browser-list":return BrowserCatalog();
            // A desk window answers this itself; a desk page shown anywhere else (a design capture) has nothing covered.
            case "covered-tiles":return new JsonArray();
            default: throw new InvalidOperationException("This action is not supported by this version of Setpiece.");
        }
    }
    private static IEnumerable<JsonObject> Tiles(JsonObject profile) => profile["MonitorBoards"]!.AsArray().OfType<JsonObject>().SelectMany(b=>b["Zones"]!.AsArray().OfType<JsonObject>());
    private JsonArray BrowserCatalog()
    {
        var result=new Dictionary<string,JsonObject>(StringComparer.OrdinalIgnoreCase);var saved=storage.ReadOptional("browsers-v2.json");
        foreach(var pair in saved)
        {
            var state=pair.Value as JsonObject;var tabs=state?["tabs"] as JsonArray;var selected=state?["selected"]?.GetValue<string>();
            var current=tabs?.OfType<JsonObject>().FirstOrDefault(t=>t["id"]?.GetValue<string>()==selected)??tabs?.OfType<JsonObject>().FirstOrDefault();
            result[pair.Key]=new JsonObject{["name"]=pair.Key,["tabs"]=tabs?.Count??0,["url"]=current?["url"]?.DeepClone()};
        }
        IEnumerable<JsonObject> profiles=storage.Profiles().OfType<JsonObject>().Select(p=>p["profile"]).OfType<JsonObject>();if(active is not null)profiles=profiles.Append(active);
        foreach(var profile in profiles)foreach(var tile in Tiles(profile).Where(t=>t["ContentKind"]?.GetValue<string>()=="Web"))
        {
            var name=tile["SharedWebName"]?.GetValue<string>()?.Trim();if(string.IsNullOrWhiteSpace(name)||result.ContainsKey(name))continue;
            var url=tile["Web"]?["Tabs"]?.AsArray().FirstOrDefault()?["Url"]?.GetValue<string>()??"https://www.google.com/";
            result[name]=new JsonObject{["name"]=name,["tabs"]=0,["url"]=url};
        }
        return new JsonArray(result.Values.OrderBy(v=>v["name"]!.GetValue<string>(),StringComparer.OrdinalIgnoreCase).Select(v=>(JsonNode)v).ToArray());
    }
    private void AutoAssignMovedWindow(nint handle)
    {
        // A move that does not end in a tile must not leave its placement behind as a later assignment's restore point.
        if(!launched||active is null||!Windows.IsWindow(handle)){windows!.ForgetPendingMove(handle);return;}
        var selected=active["MonitorIndices"]!.AsArray().Select(n=>n!.GetValue<int>()).ToHashSet();var pointer=Control.MousePosition;
        foreach(var board in active["MonitorBoards"]!.AsArray().OfType<JsonObject>())
        {
            var index=board["MonitorIndex"]!.GetValue<int>();if(!selected.Contains(index)||index<0||index>=Screen.AllScreens.Length)continue;
            foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>())
            {
                if(tile["ContentKind"]!.GetValue<string>()!="Application"||!string.IsNullOrWhiteSpace(tile["AssignedProcessName"]!.GetValue<string>()))continue;
                var bounds=WindowCoordinator.TileBounds(active,board,tile);if(!bounds.Contains(pointer))continue;
                try
                {
                    Windows.GetWindowThreadProcessId(handle,out var pid);using var process=Process.GetProcessById((int)pid);var title=new System.Text.StringBuilder(1024);Windows.GetWindowText(handle,title,title.Capacity);
                    tile["AssignedProcessName"]=process.ProcessName;tile["AssignedWindowTitle"]=title.ToString();windows!.Assign(tile["Id"]!.GetValue<string>(),handle.ToString(),bounds);Emit("profile",active);return;
                }
                catch(Exception error) when(error is ArgumentException or System.ComponentModel.Win32Exception or InvalidOperationException){windows!.ForgetPendingMove(handle);storage.Log("Automatic app assignment",error);return;}
            }
        }
        windows!.ForgetPendingMove(handle);
    }
    private static void StampDisplayNames(JsonObject profile)
    {
        foreach(var board in profile["MonitorBoards"]!.AsArray().OfType<JsonObject>())
        {
            var index=board["MonitorIndex"]!.GetValue<int>();
            if(index>=0&&index<Screen.AllScreens.Length){board["MonitorDeviceName"]=Screen.AllScreens[index].DeviceName;board["MonitorId"]=Windows.MonitorId(Screen.AllScreens[index].DeviceName);}
        }
    }
    private static void ResolveDisplays(JsonObject profile)
    {
        var boards=profile["MonitorBoards"]!.AsArray().OfType<JsonObject>().ToArray();
        var selected=profile["MonitorIndices"]!.AsArray().Select(n=>n!.GetValue<int>()).ToHashSet();
        var currentIndex=profile["MonitorIndex"]!.GetValue<int>();var current=boards.FirstOrDefault(b=>b["MonitorIndex"]!.GetValue<int>()==currentIndex);
        var selectedBoards=boards.Where(b=>selected.Contains(b["MonitorIndex"]!.GetValue<int>())).ToHashSet();var unavailable=Screen.AllScreens.Length;
        foreach(var board in boards)
        {
            var old=board["MonitorIndex"]!.GetValue<int>();var name=board["MonitorDeviceName"]?.GetValue<string>()??"";var id=board["MonitorId"]?.GetValue<string>()??"";
            // The monitor's identity decides; the DISPLAYn name only for boards saved before identities were kept.
            var resolved=id.Length>0?Array.FindIndex(Screen.AllScreens,s=>Windows.MonitorId(s.DeviceName).Equals(id,StringComparison.OrdinalIgnoreCase))
                :string.IsNullOrWhiteSpace(name)?old:Array.FindIndex(Screen.AllScreens,s=>s.DeviceName.Equals(name,StringComparison.OrdinalIgnoreCase));
            if(resolved<0)resolved=unavailable++;
            board["MonitorIndex"]=resolved;
            if(resolved<Screen.AllScreens.Length){board["MonitorDeviceName"]=Screen.AllScreens[resolved].DeviceName;if(id.Length==0)board["MonitorId"]=Windows.MonitorId(Screen.AllScreens[resolved].DeviceName);}
        }
        profile["MonitorIndices"]=new JsonArray(selectedBoards.Select(b=>(JsonNode)JsonValue.Create(b["MonitorIndex"]!.GetValue<int>())!).ToArray());
        profile["MonitorIndex"]=current?["MonitorIndex"]?.DeepClone()??profile["MonitorIndices"]!.AsArray().FirstOrDefault()?.DeepClone()??JsonValue.Create(0);
    }
    private (JsonObject board,JsonObject tile) FindTile(string id,JsonObject? profile=null)
    {
        foreach(var board in (profile??active)!["MonitorBoards"]!.AsArray().OfType<JsonObject>())foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>())if(tile["Id"]!.GetValue<string>()==id)return(board,tile);
        throw new InvalidOperationException("This tile no longer exists.");
    }
    private void PlaceActive(bool restoreMissing=false)
    {
        if(active is null)return;var selected=active["MonitorIndices"]!.AsArray().Select(n=>n!.GetValue<int>()).ToHashSet();var ids=new HashSet<string>();
        var visible=restoreMissing?Windows.Visible():new JsonArray();var unrestored=0;
        var reservedHandles=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if(restoreMissing)foreach(var board in active["MonitorBoards"]!.AsArray().OfType<JsonObject>().Where(b=>selected.Contains(b["MonitorIndex"]!.GetValue<int>())))foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>().Where(t=>t["ContentKind"]!.GetValue<string>()=="Application"))
        {
            var id=tile["Id"]!.GetValue<string>();var name=tile["AssignedProcessName"]!.GetValue<string>();var title=tile["AssignedWindowTitle"]!.GetValue<string>();
            if(name.Length!=0&&windows!.Matches(id,name,title)&&windows.AttachedHandle(id) is nint handle)reservedHandles.Add(handle.ToString());
        }
        foreach(var board in active["MonitorBoards"]!.AsArray().OfType<JsonObject>())
        {
            var index=board["MonitorIndex"]!.GetValue<int>();if(!selected.Contains(index)||index<0||index>=Screen.AllScreens.Length)continue;
            foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>().Where(t=>t["ContentKind"]!.GetValue<string>()=="Application"))
            {
                var id=tile["Id"]!.GetValue<string>();var name=tile["AssignedProcessName"]!.GetValue<string>();var title=tile["AssignedWindowTitle"]!.GetValue<string>();if(name.Length==0)continue;ids.Add(id);
                if(!windows!.Matches(id,name,title)){windows.Release(id);if(restoreMissing){var match=WindowCoordinator.RestoreCandidate(visible,name,title,reservedHandles,allowTitleFallback:false);if(match is not null){var handle=match["handle"]!.GetValue<string>();windows.Assign(id,handle,WindowCoordinator.TileBounds(active,board,tile));reservedHandles.Add(handle);}else unrestored++;}}
                windows.Place(id,WindowCoordinator.TileBounds(active,board,tile));
            }
        }
        windows!.Retain(ids);
        if(restoreMissing)NotifyUnrestored(unrestored);
    }
    private void NotifyUnrestored(int count)
    {
        if(count==0)return;
        var subject=count==1?"One assigned application tile could not be restored":$"{count} assigned application tiles could not be restored";
        var action=count==1?"Open the app, close duplicate windows with the same title, or reassign the tile.":"Open the apps, close duplicate windows with the same title, or reassign those tiles.";
        Emit("notice",JsonValue.Create(subject+": no unique window match. "+action));
    }
    private async Task Launch(bool restore)
    {
        if(active is null)return;launched=true;
        var kept=new HashSet<string>();
        var keptBrowsers=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        // Window enumeration only serves restoring apps; live layout edits skip it.
        var visible=restore?Windows.Visible():new JsonArray();var selected=active["MonitorIndices"]!.AsArray().Select(n=>n!.GetValue<int>()).ToHashSet();var reservedHandles=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var unrestored=0;
        if(restore)foreach(var board in active["MonitorBoards"]!.AsArray().OfType<JsonObject>().Where(b=>selected.Contains(b["MonitorIndex"]!.GetValue<int>())))foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>().Where(t=>t["ContentKind"]!.GetValue<string>()=="Application"))
        {
            var id=tile["Id"]!.GetValue<string>();var name=tile["AssignedProcessName"]!.GetValue<string>();var title=tile["AssignedWindowTitle"]!.GetValue<string>();
            if(name.Length!=0&&windows!.Matches(id,name,title)&&windows.AttachedHandle(id) is nint handle)reservedHandles.Add(handle.ToString());
        }
        foreach(var board in active["MonitorBoards"]!.AsArray().OfType<JsonObject>())
        {
            var index=board["MonitorIndex"]!.GetValue<int>();if(!selected.Contains(index))continue;
            // A monitor that is asleep or unplugged: its browsers stay open, hidden, for when it comes back.
            if(index>=Screen.AllScreens.Length){foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>().Where(t=>t["ContentKind"]!.GetValue<string>()=="Web")){var shared=tile["SharedWebName"]?.GetValue<string>();var key=string.IsNullOrWhiteSpace(shared)?"tile-"+tile["Id"]!.GetValue<string>():shared;keptBrowsers.Add(key);if(browsers.TryGetValue(key,out var sleeping))sleeping.Hide();}continue;}
            // The desk draws this display's wallpaper and widgets; applications and browsers sit above it.
            await EnsureSurface("workspace-"+index,Screen.AllScreens[index].Bounds,$"workspace={index}",kept);
            foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>())
            {
                var kind=tile["ContentKind"]!.GetValue<string>();var bounds=WindowCoordinator.TileBounds(active,board,tile);
                if(kind=="Web") { var shared=tile["SharedWebName"]?.GetValue<string>();var name=string.IsNullOrWhiteSpace(shared)?"tile-"+tile["Id"]!.GetValue<string>():shared;var url=tile["Web"]?["Tabs"]?.AsArray().FirstOrDefault()?["Url"]?.GetValue<string>()??"https://www.youtube.com/";keptBrowsers.Add(name);await OpenBrowser(name,url,bounds,tile["Web"]?.AsObject(),tile["ConstrainFullscreenToTile"]?.GetValue<bool>()??false,true); }
                else if(restore)
                {
                    var process=tile["AssignedProcessName"]!.GetValue<string>();if(string.IsNullOrWhiteSpace(process))continue;
                    var id=tile["Id"]!.GetValue<string>();var title=tile["AssignedWindowTitle"]!.GetValue<string>();
                    if(windows!.Matches(id,process,title))continue;
                    var match=WindowCoordinator.RestoreCandidate(visible,process,title,reservedHandles);
                    if(match is not null){var handle=match["handle"]!.GetValue<string>();windows.Assign(id,handle,bounds);reservedHandles.Add(handle);tile["AssignedWindowTitle"]=match["title"]!.DeepClone();}else unrestored++;
                }
            }
        }
        foreach(var obsolete in surfaces.Where(s=>!kept.Contains(s.Key)).ToArray()){obsolete.Dispose();surfaces.Remove(obsolete);}
        foreach(var pair in browsers.Where(p=>!keptBrowsers.Contains(p.Key)).ToArray()){if(pair.Key.StartsWith("tile-",StringComparison.Ordinal)){pair.Value.Dispose();browsers.Remove(pair.Key);}else pair.Value.Hide();}
        foreach(var surface in surfaces)surface.Settle();
        // Browser cards frost the wallpaper behind them: they hear about a new one like the desks do.
        foreach(var browser in browsers.Values)browser.Emit("profile",active);
        windows!.HideTaskbars(selected);PlaceActive();if(restore)NotifyUnrestored(unrestored);
        WatchCover();CheckCover();
    }
    private async Task EnsureSurface(string key,Rectangle bounds,string query,HashSet<string> kept)
    {
        kept.Add(key);var surface=surfaces.FirstOrDefault(s=>s.Key==key);
        if(surface is null){surface=new Surface(this,bounds){Key=key};surfaces.Add(surface);await surface.Start(query);}
        else{surface.Bounds=bounds;surface.Emit("profile",active!);}
    }
    private async Task OpenBrowser(string name,string url,Rectangle bounds,JsonObject? initial=null,bool constrainFullscreen=false,bool docked=false)
    {
        name=storage.ReadOptional("browsers-v2.json").FirstOrDefault(p=>p.Key.Equals(name,StringComparison.OrdinalIgnoreCase)).Key??name.Trim();
        if(browsers.TryGetValue(name,out var existing)){existing.Docked=docked;existing.Place(bounds,constrainFullscreen);existing.Show();existing.NotifyState();return;}
        var browser=new BrowserSurface(this,storage,name,bounds,constrainFullscreen){Docked=docked};browsers[name]=browser;await browser.Start(url,initial);
    }
    internal void Emit(string name,JsonNode? data)=>Post(PageMessage(name,data));
    private void Post(string message){if(view.CoreWebView2 is not null)view.CoreWebView2.PostWebMessageAsJson(message);}
    /** An event for a page, serialized once however many pages hear it. */
    internal static string PageMessage(string name,JsonNode? data)=>"{\"event\":"+JsonSerializer.Serialize(name)+",\"data\":"+(data?.ToJsonString()??"null")+"}";
    private Cover.Watcher? coverWatch;
    private readonly System.Windows.Forms.Timer coverCheck = new() { Interval = 1000 };
    private bool studioCovered;
    /** Looks for covered windows while there is something to rest: Studio on screen, or a launched workspace's desks. */
    private void WatchCover()=>coverCheck.Enabled=coverWatch is not null&&(WindowState!=FormWindowState.Minimized||surfaces.Count>0);
    /**
     * Rests what nobody can see (see Cover): Studio while other windows hide all of it, and on each desk the
     * widgets under applications. Runs each second and right after windows come forward, minimize or stop moving.
     */
    private void CheckCover()
    {
        if(coverWatch is null||IsDisposed||!coverCheck.Enabled)return;
        var stack=Cover.Stack();
        var studio=WindowState!=FormWindowState.Minimized&&Cover.Showing(stack,Handle,Bounds).Count==0;
        if(studio!=studioCovered){studioCovered=studio;Emit("page-covered",JsonValue.Create(studio));}
        if(active is null||!launched)return;
        foreach(var board in active["MonitorBoards"]!.AsArray().OfType<JsonObject>())
        {
            var index=board["MonitorIndex"]!.GetValue<int>();
            if(index>=Screen.AllScreens.Length||surfaces.FirstOrDefault(s=>s.Key=="workspace-"+index) is not { IsDisposed: false } desk)continue;
            var showing=Cover.Showing(stack,desk.Handle,desk.Bounds);
            desk.Cover(board["Zones"]!.AsArray().OfType<JsonObject>().Where(t=>t["ContentKind"]?.GetValue<string>()=="Widget"&&!Cover.Shows(showing,WindowCoordinator.TileBounds(active,board,t))).Select(t=>t["Id"]!.GetValue<string>()).ToArray());
        }
    }
    private void ShowInterface(bool shown)
    {
        if(view.Visible==shown)return;
        view.Visible=shown;if(view.CoreWebView2 is { } core)SetMemoryTarget(core,shown);
    }
    /** Asks a page that is out of sight to keep less memory (caches and the like); it works as before when shown. */
    internal static void SetMemoryTarget(CoreWebView2 core,bool active)
    {
        try{core.MemoryUsageTargetLevel=active?CoreWebView2MemoryUsageTargetLevel.Normal:CoreWebView2MemoryUsageTargetLevel.Low;}
        // An older WebView2 Runtime lacks the setting; the page then keeps its memory, as before.
        catch(Exception error) when(error is NotImplementedException or InvalidCastException or System.Runtime.InteropServices.COMException){}
    }
    internal void NotifyBrowserCatalog()=>Emit("browsers",BrowserCatalog());
    /** The desk window under a place on screen, while a workspace is launched. */
    internal Surface? DeskAt(Rectangle bounds)=>surfaces.FirstOrDefault(s=>!s.IsDisposed&&s.Visible&&s.Bounds.Contains(bounds));
    /** The browser toolbar changed where fullscreen goes; the workspace's tiles for that browser follow, and Studio hears of it. */
    internal void BrowserFullscreenChanged(string name,bool constrain)
    {
        if(active is null)return;
        foreach(var tile in Tiles(active).Where(t=>t["ContentKind"]?.GetValue<string>()=="Web"))
        {
            var shared=tile["SharedWebName"]?.GetValue<string>();var tileName=string.IsNullOrWhiteSpace(shared)?"tile-"+tile["Id"]!.GetValue<string>():shared;
            if(tileName.Equals(name,StringComparison.OrdinalIgnoreCase))tile["ConstrainFullscreenToTile"]=constrain;
        }
        Emit("profile",active);
    }
    // Matches the UI's Material 3 surface role, so the window never flashes another color before the page paints.
    private Color SurfaceColor=>storage.Preferences()["mode"]?.GetValue<string>()=="light"?Color.FromArgb(252,248,255):Color.FromArgb(19,19,24);
    private void Broadcast(string name,JsonNode data){var message=PageMessage(name,data);Post(message);foreach(var surface in surfaces)surface.Post(message);foreach(var browser in browsers.Values)browser.Post(message);}
    internal static void OpenExternal(string url){if(!Uri.TryCreate(url,UriKind.Absolute,out var uri)||uri.Scheme is not ("https" or "http"))throw new InvalidOperationException("Use an HTTP or HTTPS address.");Process.Start(new ProcessStartInfo(uri.AbsoluteUri){UseShellExecute=true});}
    protected override void WndProc(ref Message message)
    {
        base.WndProc(ref message);
        if(message.Msg!=0x84||WindowState!=FormWindowState.Normal)return;
        var p=PointToClient(new Point((short)((long)message.LParam&0xffff),(short)(((long)message.LParam>>16)&0xffff)));
        const int border=7;var left=p.X<border;var right=p.X>Width-border;var top=p.Y<border;var bottom=p.Y>Height-border;
        message.Result=top?(left?13:right?14:12):bottom?(left?16:right?17:15):left?10:right?11:message.Result;
    }
    protected override CreateParams CreateParams { get {var p=base.CreateParams;p.Style|=0x00040000;return p;} }
}

/// <summary>
/// The desk behind a launched workspace, one per display: the wallpaper and every widget in one page, so the
/// display composes them once per frame. It always stays below applications, yet takes clicks and typing so
/// the widgets work (Notes, volume, playback).
/// </summary>
internal sealed class Surface : Form
{
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    internal string Key {get;init;}="";
    private bool settling;
    /** The widget tiles on this desk that other windows hide, as last told to the page. */
    private string[] coveredTiles=[];
    private readonly Host host;private readonly WebView2 view=new(){Dock=DockStyle.Fill};
    public Surface(Host host,Rectangle bounds){this.host=host;Bounds=bounds;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;BackColor=Color.FromArgb(19,19,24);Controls.Add(view);Text="Setpiece workspace";}
    protected override bool ShowWithoutActivation=>true;
    // A tool window: never in the taskbar or Alt+Tab.
    protected override CreateParams CreateParams { get {var p=base.CreateParams;p.ExStyle|=0x80;return p;} }
    public async Task Start(string query)
    {
        Show();Settle();
        await host.Configure(view,true,Command);
        view.CoreWebView2.Navigate("https://setpiece.local/index.html?"+query);
    }
    /** The desk page asks which of its widgets are covered when it starts (or restarts after a failure). */
    private Task<JsonNode?> Command(string command,JsonObject payload)=>command=="covered-tiles"?Task.FromResult<JsonNode?>(CoveredTiles()):host.HandleCommand(command,payload);
    private JsonArray CoveredTiles()=>new(coveredTiles.Select(id=>(JsonNode)JsonValue.Create(id)).ToArray());
    internal void Cover(string[] ids){if(ids.SequenceEqual(coveredTiles))return;coveredTiles=ids;Emit("tiles-covered",CoveredTiles());}
    /** Puts the desk in its layer: just above the Windows desktop, below every application. */
    internal void Settle()
    {
        if(!IsHandleCreated||IsDisposed)return;
        settling=true;
        try{Windows.BehindApplications(Handle);}
        finally{settling=false;}
    }
    protected override void WndProc(ref Message message)
    {
        // Nothing but Settle changes the layer: clicking or typing on the desk must not lift it over applications.
        if(message.Msg==0x46&&!settling&&message.LParam!=0)
        {
            var position=System.Runtime.InteropServices.Marshal.PtrToStructure<Windows.WindowPos>(message.LParam);
            position.Flags|=0x4;System.Runtime.InteropServices.Marshal.StructureToPtr(position,message.LParam,false);
        }
        base.WndProc(ref message);
    }
    /** Where the display's wallpaper falls inside a window, so a glass card can frost the part behind it. */
    internal static JsonObject WallpaperViewport(Rectangle bounds)
    {
        var screen=Screen.FromRectangle(bounds).Bounds;
        string Percent(double value)=>value.ToString("0.######",System.Globalization.CultureInfo.InvariantCulture)+"%";
        return new JsonObject{["left"]=Percent(100d*(screen.Left-bounds.Left)/bounds.Width),["top"]=Percent(100d*(screen.Top-bounds.Top)/bounds.Height),["width"]=Percent(100d*screen.Width/bounds.Width),["height"]=Percent(100d*screen.Height/bounds.Height),["right"]="auto",["bottom"]="auto"};
    }
    /** A picture of the desk as it is drawn now, the size of its window. */
    internal async Task<Bitmap?> Picture()
    {
        if(view.CoreWebView2 is null)return null;
        using var stream=new MemoryStream();await view.CoreWebView2.CapturePreviewAsync(Microsoft.Web.WebView2.Core.CoreWebView2CapturePreviewImageFormat.Png,stream);stream.Position=0;
        return new Bitmap(stream);
    }
    public void Emit(string name,JsonNode data)=>Post(Host.PageMessage(name,data));
    public void Post(string message){if(view.CoreWebView2 is not null)view.CoreWebView2.PostWebMessageAsJson(message);}
}

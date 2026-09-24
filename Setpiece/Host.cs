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
    internal string? AuditOutput;
    public Host(Storage storage)
    {
        this.storage = storage;providers = new Providers(storage);
        Text = "Setpiece";Size = new Size(1440, 960);MinimumSize = new Size(1040, 680);StartPosition = FormStartPosition.CenterScreen;FormBorderStyle = FormBorderStyle.None;BackColor = Color.FromArgb(18, 21, 19);
        Controls.Add(view);Shown += async (_, _) => await Initialize();
        FormClosing+=(_,e)=>{if(!closingConfirmed&&AuditOutput is null&&view.CoreWebView2 is not null&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Emit("request-close",null);}};
        FormClosed += (_, _) => { foreach (var surface in surfaces) surface.Dispose();foreach (var browser in browsers.Values)browser.Dispose();windows?.Dispose();providers.Dispose(); };
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged += DisplayChanged;
        Disposed += (_, _) => Microsoft.Win32.SystemEvents.DisplaySettingsChanged -= DisplayChanged;
    }
    private void DisplayChanged(object? sender, EventArgs e) { if(IsHandleCreated)BeginInvoke(() => Emit("displays", Windows.Displays())); }
    private async Task Initialize()
    {
        try
        {
            windows = new WindowCoordinator(this);
            windows.Detached += id => { if(active is not null) foreach(var tile in Tiles(active))if(tile["Id"]!.GetValue<string>()==id){tile["AssignedProcessName"]="";tile["AssignedWindowTitle"]="";}Emit("detached", JsonValue.Create(id)); };
            windows.MoveEnded += AutoAssignMovedWindow;
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
                return new JsonObject { ["profiles"] = profiles, ["displays"] = Windows.Displays(), ["preferences"] = storage.Preferences(), ["connections"] = providers.PublicSettings(), ["browsers"] = BrowserCatalog(), ["executable"] = Environment.ProcessPath, ["dataRoot"] = storage.Root, ["runtime"] = environment?.BrowserVersionString, ["profile"] = active?.DeepClone() };
            case "windows": return Windows.Visible();
            case "save": var savedProfile=Storage.Normalize(payload["profile"]!.AsObject(),false);StampDisplayNames(savedProfile);return JsonValue.Create(storage.SaveProfile(payload["key"]?.GetValue<string>(),savedProfile));
            case "delete": storage.DeleteProfile(payload["key"]!.GetValue<string>());return null;
            case "preferences": storage.SaveDocument("appearance-v2.json",payload);Broadcast("appearance",payload);return null;
            case "profile": active = Storage.Normalize(payload["profile"]!.AsObject(),false);ResolveDisplays(active);PlaceActive(payload["restoreApplications"]?.GetValue<bool>()??false);if(launched)await Launch(false);return null;
            case "switch-profile": windows!.ReleaseAll();active=Storage.Normalize(payload["profile"]!.AsObject(),false);ResolveDisplays(active);if(launched)await Launch(true);return null;
            case "assign":
                var candidate=Storage.Normalize(payload["profile"]!.AsObject(),false);ResolveDisplays(candidate);var tileId = payload["id"]!.GetValue<string>();
                var (board,tile) = FindTile(tileId,candidate);
                if(tile["ContentKind"]!.GetValue<string>()!="Application")throw new InvalidOperationException("Widgets and browser tiles cannot receive applications.");
                var before=active;active=candidate;
                try{windows!.Assign(tileId,payload["handle"]!.GetValue<string>(),WindowCoordinator.TileBounds(candidate,board,tile));}catch{active=before;throw;}
                return active.DeepClone();
            case "release": windows!.Release(payload["id"]!.GetValue<string>());return null;
            case "launch": active = Storage.Normalize(payload["profile"]!.AsObject(),false);ResolveDisplays(active);StampDisplayNames(active);var key=storage.SaveProfile(payload["key"]?.GetValue<string>(),active);await Launch(true);return JsonValue.Create(key);
            case "stop": launched=false;foreach(var s in surfaces)s.Dispose();surfaces.Clear();foreach(var b in browsers.Values)b.Hide();windows!.ReleaseAll();windows.RestoreTaskbars();return null;
            case "volume": return providers.SetVolume(payload);
            case "discord-voice":return await providers.VoiceControl(payload);
            case "spotify-playback":return await providers.Playback(payload);
            case "manage-widget":Show();WindowState=FormWindowState.Normal;Activate();Emit("manage-widget",payload["id"]);return null;
            case "inspect-widget":Show();WindowState=FormWindowState.Normal;Activate();Emit("inspect-widget",payload["id"]);return null;
            case "open-game":
                var game=surfaces.FirstOrDefault(s=>s.Key=="scrapbots");if(game is null){game=new Surface(this,new Rectangle(Location.X+80,Location.Y+80,980,740),false){Key="scrapbots"};surfaces.Add(game);await game.Start("game=1");}game.Show();game.Activate();return null;
            case "service": return await providers.Read(payload["service"]!.GetValue<string>());
            case "connect":var connected=await providers.Connect(payload);Broadcast("connections",providers.PublicSettings());return connected;
            case "disconnect":providers.Disconnect(payload["service"]!.GetValue<string>());Broadcast("connections",providers.PublicSettings());return null;
            case "stop-search": return await providers.SearchStops(payload["query"]!.GetValue<string>());
            case "timezone-search": return await providers.SearchTimezones(payload["query"]?.GetValue<string>()??"");
            case "note-read": return storage.ReadOptional("notes-v2.json");
            case "note-save": storage.SaveDocument("notes-v2.json",payload);return JsonValue.Create(DateTimeOffset.Now.ToString("O"));
            case "game-read": return storage.ReadOptional("scrapbots-v2.json");
            case "game-save": storage.SaveDocument("scrapbots-v2.json",payload);return null;
            case "brave-bookmarks": return BraveBookmarks.Import(storage);
            case "brave-bookmarks-read": return BraveBookmarks.Read(storage);
            case "external": OpenExternal(payload["url"]!.GetValue<string>());return null;
            case "window":
                switch(payload["action"]!.GetValue<string>()) { case "drag":Windows.ReleaseCapture();Windows.SendMessage(Handle,0xA1,2,0);break;case "minimize":WindowState=FormWindowState.Minimized;break;case "maximize":MaximizedBounds=Screen.FromControl(this).WorkingArea;WindowState=WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;break;case "close":Close();break;case "close-confirmed":closingConfirmed=true;Close();break; }
                return null;
            case "browser-open": await OpenBrowser(payload["name"]!.GetValue<string>(),payload["url"]?.GetValue<string>()??"https://www.youtube.com/",new Rectangle(Location.X+80,Location.Y+100,1000,700),null,false);return null;
            case "browser-list":return BrowserCatalog();
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
        if(!launched||active is null||!Windows.IsWindow(handle))return;
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
            if(index>=0&&index<Screen.AllScreens.Length)board["MonitorDeviceName"]=Screen.AllScreens[index].DeviceName;
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
            var old=board["MonitorIndex"]!.GetValue<int>();var name=board["MonitorDeviceName"]?.GetValue<string>()??"";
            var resolved=string.IsNullOrWhiteSpace(name)?old:Array.FindIndex(Screen.AllScreens,s=>s.DeviceName.Equals(name,StringComparison.OrdinalIgnoreCase));
            if(resolved<0)resolved=unavailable++;
            board["MonitorIndex"]=resolved;
            if(string.IsNullOrWhiteSpace(name)&&resolved<Screen.AllScreens.Length)board["MonitorDeviceName"]=Screen.AllScreens[resolved].DeviceName;
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
        var visible=Windows.Visible();var selected=active["MonitorIndices"]!.AsArray().Select(n=>n!.GetValue<int>()).ToHashSet();var reservedHandles=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var unrestored=0;
        foreach(var board in active["MonitorBoards"]!.AsArray().OfType<JsonObject>().Where(b=>selected.Contains(b["MonitorIndex"]!.GetValue<int>())))foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>().Where(t=>t["ContentKind"]!.GetValue<string>()=="Application"))
        {
            var id=tile["Id"]!.GetValue<string>();var name=tile["AssignedProcessName"]!.GetValue<string>();var title=tile["AssignedWindowTitle"]!.GetValue<string>();
            if(name.Length!=0&&windows!.Matches(id,name,title)&&windows.AttachedHandle(id) is nint handle)reservedHandles.Add(handle.ToString());
        }
        foreach(var board in active["MonitorBoards"]!.AsArray().OfType<JsonObject>())
        {
            var index=board["MonitorIndex"]!.GetValue<int>();if(!selected.Contains(index)||index>=Screen.AllScreens.Length)continue;
            await EnsureSurface("workspace-"+index,Screen.AllScreens[index].Bounds,true,$"workspace={index}",kept);
            foreach(var tile in board["Zones"]!.AsArray().OfType<JsonObject>())
            {
                var kind=tile["ContentKind"]!.GetValue<string>();var bounds=WindowCoordinator.TileBounds(active,board,tile);
                if(kind=="Widget") { await EnsureSurface("widget-"+tile["Id"]+"-"+tile["WidgetId"],bounds,false,"widget="+Uri.EscapeDataString(tile["WidgetId"]!.GetValue<string>())+"&display="+index,kept); }
                else if(kind=="Web") { var shared=tile["SharedWebName"]?.GetValue<string>();var name=string.IsNullOrWhiteSpace(shared)?"tile-"+tile["Id"]!.GetValue<string>():shared;var url=tile["Web"]?["Tabs"]?.AsArray().FirstOrDefault()?["Url"]?.GetValue<string>()??"https://www.youtube.com/";keptBrowsers.Add(name);await OpenBrowser(name,url,bounds,tile["Web"]?.AsObject(),tile["ConstrainFullscreenToTile"]?.GetValue<bool>()??false); }
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
        windows!.HideTaskbars(selected);PlaceActive();if(restore)NotifyUnrestored(unrestored);
    }
    private async Task EnsureSurface(string key,Rectangle bounds,bool clickThrough,string query,HashSet<string> kept)
    {
        kept.Add(key);var surface=surfaces.FirstOrDefault(s=>s.Key==key);
        if(surface is null){surface=new Surface(this,bounds,clickThrough){Key=key};surfaces.Add(surface);await surface.Start(query);}
        else{surface.Bounds=bounds;surface.Emit("profile",active!);}
    }
    private async Task OpenBrowser(string name,string url,Rectangle bounds,JsonObject? initial=null,bool constrainFullscreen=false)
    {
        name=storage.ReadOptional("browsers-v2.json").FirstOrDefault(p=>p.Key.Equals(name,StringComparison.OrdinalIgnoreCase)).Key??name.Trim();
        if(browsers.TryGetValue(name,out var existing)){existing.Place(bounds,constrainFullscreen);existing.Show();return;}
        var browser=new BrowserSurface(this,storage,name,bounds,constrainFullscreen);browsers[name]=browser;await browser.Start(url,initial);
    }
    internal void Emit(string name,JsonNode? data) { if(view.CoreWebView2 is not null)view.CoreWebView2.PostWebMessageAsJson(new JsonObject{["event"]=name,["data"]=data?.DeepClone()}.ToJsonString()); }
    internal void NotifyBrowserCatalog()=>Emit("browsers",BrowserCatalog());
    internal double CornerRadius=>storage.Preferences()["radius"]?.GetValue<double>()??24;
    private void Broadcast(string name,JsonNode data){Emit(name,data);foreach(var surface in surfaces)surface.Emit(name,data);foreach(var browser in browsers.Values)browser.Emit(name,data);}
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

internal sealed class Surface : Form
{
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    internal string Key {get;init;}="";
    private readonly Host host;private readonly bool clickThrough;private readonly WebView2 view=new(){Dock=DockStyle.Fill};private double radius;
    public Surface(Host host,Rectangle bounds,bool clickThrough){this.host=host;this.clickThrough=clickThrough;radius=host.CornerRadius;Bounds=bounds;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;if(!clickThrough)BackColor=Color.Black;Controls.Add(view);Text="Setpiece workspace";HandleCreated+=(_,_)=>UpdateShape();SizeChanged+=(_,_)=>UpdateShape();UpdateShape();}
    protected override bool ShowWithoutActivation=>true;
    protected override CreateParams CreateParams { get {var p=base.CreateParams;p.ExStyle|=0x80;if(clickThrough)p.ExStyle|=0x08000000|0x20|0x80000;return p;} }
    public async Task Start(string query)
    {
        if(!clickThrough)query+="&surface=1";
        Show();
        if(clickThrough){Windows.SetLayeredWindowAttributes(Handle,0,255,2);Windows.BehindApplications(Handle);}
        await host.Configure(view);
        if(!clickThrough){try{view.DefaultBackgroundColor=Color.Transparent;}catch(Exception){}}
        view.CoreWebView2.NavigationCompleted+=(_,_)=>UpdateViewport();LocationChanged+=(_,_)=>UpdateViewport();SizeChanged+=(_,_)=>UpdateViewport();view.CoreWebView2.Navigate("https://setpiece.local/index.html?"+query);
    }
    private void UpdateViewport()
    {
        if(clickThrough||Width<=0||Height<=0)return;
        var screen=Screen.FromRectangle(Bounds).Bounds;
        string Percent(double value)=>value.ToString("0.######",System.Globalization.CultureInfo.InvariantCulture)+"%";
        Emit("wallpaper-viewport",new JsonObject{["left"]=Percent(100d*(screen.Left-Left)/Width),["top"]=Percent(100d*(screen.Top-Top)/Height),["width"]=Percent(100d*screen.Width/Width),["height"]=Percent(100d*screen.Height/Height),["right"]="auto",["bottom"]="auto"});
    }
    private void UpdateShape()
    {
        if(clickThrough||Width<1||Height<1)return;
        // Widget windows are composited with per-pixel transparency (DWM glass),
        // so the page's rounded card is the only visible shape and its corners
        // anti-alias against whatever is behind the window. Keep the window itself
        // rectangular and unrounded.
        var old=Region;Region=null;old?.Dispose();
        Windows.ApplyRoundedCorners(Handle,false);
        Windows.ExtendGlass(Handle);
    }
    public void Emit(string name,JsonNode data){if(name=="appearance"){radius=data["radius"]?.GetValue<double>()??24;UpdateShape();}if(view.CoreWebView2 is not null)view.CoreWebView2.PostWebMessageAsJson(new JsonObject{["event"]=name,["data"]=data.DeepClone()}.ToJsonString());}
}

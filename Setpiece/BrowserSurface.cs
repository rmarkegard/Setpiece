using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

// The local toolbar alone has a host bridge. Remote pages have no application capabilities.
// The toolbar page draws the whole card (tone, glass, corners) on a transparent window; the web
// pages sit in the opening it reports, so the browser matches the widgets around it.
internal sealed class BrowserSurface : Form
{
    private sealed record Tab(string Id, WebView2 View) { public string? Error { get; set; } }
    private readonly Host host;
    private readonly Storage storage;
    private readonly string name;
    private readonly WebView2 chrome = new() { Dock=DockStyle.Fill };
    private readonly Panel pages = new() { BackColor=Color.FromArgb(24,24,28) };
    /** The opening for the web page, in CSS pixels, as the toolbar last reported it. */
    private (double Top,double Left,double Right,double Bottom,double Radius)? frame;
    private readonly List<Tab> tabs=[];
    private Tab? selected;
    private bool pinned=true;
    private bool diagnostics;
    private bool constrainFullscreen;
    private bool fullscreen;
    private Rectangle restoreBounds;
    private Rectangle tileBounds;
    private string extensionStatus="Loading extension…";
    private bool closing;
    /** In a workspace tile the browser stays put: it cannot be dragged off its tile. A browser opened on its own can. */
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    internal bool Docked {get;set;}
    private readonly PageCorners corners;
    private readonly System.Windows.Forms.Timer cornerTimer=new(){Interval=60};
    /** Set when the corner windows cannot draw; the page then keeps only its hard-edged rounded region. */
    private bool cornersFailed;
    /** What the page's shape was last cut for, so an unchanged layout does not re-clip the playing page. */
    private (Size Size,int Radius,bool Failed)? shaped;
    private string look="";
    public BrowserSurface(Host host,Storage storage,string name,Rectangle bounds,bool constrainFullscreen=false)
    {
        this.host=host;this.storage=storage;this.name=name;this.constrainFullscreen=constrainFullscreen;tileBounds=bounds;Bounds=bounds;Text="Setpiece · "+name;if(Windows.AppIcon.Value is { } icon)Icon=icon;
        FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.Manual;MinimumSize=new Size(280,160);BackColor=Color.Black;
        Controls.Add(pages);Controls.Add(chrome);
        corners=new PageCorners(this);cornerTimer.Tick+=async(_,_)=>{cornerTimer.Stop();await RefreshCorners();};
        VisibleChanged+=(_,_)=>{if(Visible)ScheduleCorners();else corners.Hide();};
        // Per-pixel transparency, as for widget windows: the card's own rounded, anti-aliased edge is the window's shape.
        HandleCreated+=(_,_)=>{Windows.ApplyRoundedCorners(Handle,false);Windows.ExtendGlass(Handle);};
        Resize+=(_,_)=>{ApplyPin();Windows.ExtendGlass(Handle);UpdateViewport();};Move+=(_,_)=>{UpdateViewport();ScheduleCorners();};
        FormClosing+=(_,e)=>{if(!closing){e.Cancel=true;Hide();}};
    }
    public void Place(Rectangle bounds,bool constrain)
    {
        tileBounds=bounds;constrainFullscreen=constrain;
        if(!fullscreen)Bounds=bounds;
        else Bounds=constrainFullscreen?tileBounds:Screen.FromRectangle(tileBounds).Bounds;
    }
    public async Task Start(string url,JsonObject? initial=null)
    {
        Show();await host.Configure(chrome,true,Command);
        try{chrome.DefaultBackgroundColor=Color.Transparent;}catch(Exception){}
        chrome.CoreWebView2.NavigationCompleted+=(_,_)=>{EmitState();UpdateViewport();};
        chrome.CoreWebView2.Navigate("https://setpiece.local/index.html?browser="+Uri.EscapeDataString(name));
        var saved=storage.ReadOptional("browsers-v2.json")[name]?.AsObject();
        if(saved is null&&initial is not null)saved=new JsonObject{["pinned"]=initial["ToolbarPinned"]?.DeepClone(),["selected"]=initial["SelectedTabId"]?.DeepClone(),["tabs"]=new JsonArray((initial["Tabs"] as JsonArray??new JsonArray()).OfType<JsonObject>().Select(t=>(JsonNode)new JsonObject{["id"]=t["Id"]?.DeepClone(),["url"]=t["Url"]?.DeepClone()??JsonValue.Create(url)}).ToArray())};
        pinned=saved?["pinned"]?.GetValue<bool>()??true;
        if(saved?["tabs"] is JsonArray urls&&urls.Count>0){foreach(var entry in urls.Take(20))await Add(entry!["url"]!.GetValue<string>(),entry["id"]?.GetValue<string>());var id=saved["selected"]?.GetValue<string>();Select(tabs.FirstOrDefault(t=>t.Id==id)??tabs[0]);}
        else await Add(url);
        ApplyPin();EmitState();
    }
    private static string Address(string value)
    {
        if(!value.Contains("://",StringComparison.Ordinal))value="https://"+value;
        if(!Uri.TryCreate(value,UriKind.Absolute,out var uri)||uri.Scheme is not ("http" or "https"))throw new InvalidDataException("Enter an HTTP or HTTPS web address.");
        return uri.AbsoluteUri;
    }
    /** Opens a tab; a background tab (a middle-clicked bookmark) leaves the current one in front. */
    private async Task Add(string url,string? id=null,bool select=true)
    {
        var address=Address(url);var tab=await CreateTab(id);
        tab.View.CoreWebView2.Navigate(address);if(select)Select(tab);else EmitState();Persist();
    }
    /** A new, not yet navigated tab. A page's popup (a sign-in window, say) is handed one of these, so it keeps its opener. */
    private async Task<Tab> CreateTab(string? id=null)
    {
        if(tabs.Count>=20)throw new InvalidOperationException("Close a tab before opening another (20 maximum).");
        var view=new WebView2{Dock=DockStyle.Fill,Visible=false};pages.Controls.Add(view);
        await host.Configure(view,false);
        var core=view.CoreWebView2;var tab=new Tab(id??Guid.NewGuid().ToString("N"),view);tabs.Add(tab);
        core.Settings.AreDevToolsEnabled=true;
        core.NavigationStarting+=(_,e)=>{if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out var uri)||uri.Scheme is not ("http" or "https" or "about" or "blob"))e.Cancel=true;tab.Error=null;EmitState();};
        // Popups open as tabs, but as the page's own new window: "Sign in with Google" and similar flows
        // talk back to the page that opened them, and close themselves when they are done.
        core.NewWindowRequested+=async(_,e)=>
        {
            var deferral=e.GetDeferral();
            try{var popup=await CreateTab();e.NewWindow=popup.View.CoreWebView2;e.Handled=true;Select(popup);Persist();}
            catch(Exception error) when(error is InvalidOperationException or System.Runtime.InteropServices.COMException or ArgumentException){e.Handled=true;tab.Error=error.Message;EmitState();}
            finally{deferral.Complete();}
        };
        core.WindowCloseRequested+=async(_,_)=>await Close(tab);
        core.ContextMenuRequested+=(_,e)=>
        {
            var link=e.ContextMenuTarget.LinkUri;if(!Uri.TryCreate(link,UriKind.Absolute,out var target)||target.Scheme is not ("http" or "https"))return;
            var item=core.Environment.CreateContextMenuItem("Open link in default browser",null,CoreWebView2ContextMenuItemKind.Command);
            item.CustomItemSelected+=(_,_)=>host.BeginInvoke(()=>Host.OpenExternal(target.AbsoluteUri));
            e.MenuItems.Insert(0,item);
        };
        core.SourceChanged+=(_,_)=>{Persist();EmitState();};core.DocumentTitleChanged+=(_,_)=>EmitState();core.HistoryChanged+=(_,_)=>EmitState();
        core.NavigationCompleted+=(_,e)=>{tab.Error=e.IsSuccess?null:"This page could not load ("+e.WebErrorStatus+"). Check the address or try reloading.";EmitState();};
        core.ProcessFailed+=(_,e)=>{tab.Error="The browser process stopped ("+e.ProcessFailedKind+"). Reload this tab to recover.";EmitState();};
        core.ContainsFullScreenElementChanged+=(_,_)=>{if(tab==selected)SetFullscreen(core.ContainsFullScreenElement);};
        try
        {
            var folder=Path.Combine(AppContext.BaseDirectory,"Assets","Extensions","uBOLite");
            var installed=await core.Profile.GetBrowserExtensionsAsync();var extension=installed.FirstOrDefault(e=>e.Name.Contains("uBlock",StringComparison.OrdinalIgnoreCase));
            if(extension is null&&File.Exists(Path.Combine(folder,"manifest.json")))extension=await core.Profile.AddBrowserExtensionAsync(folder);
            if(extension is not null&&!extension.IsEnabled)await extension.EnableAsync(true);
            extensionStatus=extension is null?"uBlock Origin Lite is unavailable. Rebuild to restore the bundled extension.":extension.Name+" · enabled";
        }
        catch(Exception error){extensionStatus="Extension could not start: "+error.Message;}
        return tab;
    }
    private async Task Close(Tab target)
    {
        var index=tabs.IndexOf(target);if(index<0)return;tabs.RemoveAt(index);var wasSelected=target==selected;target.View.Dispose();
        if(tabs.Count==0)await Add("https://www.google.com/");else if(wasSelected)Select(tabs[Math.Max(0,index-1)]);
        Persist();EmitState();
    }
    private void Select(Tab tab){selected=tab;foreach(var item in tabs)item.View.Visible=item==tab;tab.View.BringToFront();SetFullscreen(tab.View.CoreWebView2.ContainsFullScreenElement);EmitState();}
    private void ApplyPin()
    {
        chrome.Visible=!fullscreen||diagnostics;pages.Visible=!diagnostics;
        if(fullscreen||diagnostics)corners.Hide();
        // Fullscreen inside the tile keeps the card's rounded corners; fullscreen on the whole display is square.
        if(fullscreen&&!diagnostics){pages.Bounds=ClientRectangle;var f0=frame??(0,8,8,8,12);SetPageShape(constrainFullscreen?(int)Math.Round((f0.Radius+f0.Left)*DeviceDpi/96d):0,exact:true);shaped=null;pages.BringToFront();return;}
        // Until the toolbar reports its opening, leave room for the toolbar it is about to draw.
        var f=frame??(pinned?(132,8,8,8,12):(52,8,8,8,12));var scale=DeviceDpi/96d;int Px(double v)=>(int)Math.Round(v*scale);
        var bounds=Rectangle.FromLTRB(Px(f.Left),Px(f.Top),Math.Max(Px(f.Left)+1,ClientSize.Width-Px(f.Right)),Math.Max(Px(f.Top)+1,ClientSize.Height-Px(f.Bottom)));
        var moved=pages.Bounds!=bounds;if(moved)pages.Bounds=bounds;
        var shape=(bounds.Size,Px(f.Radius),cornersFailed);pages.BringToFront();if(!moved&&shaped==shape)return;shaped=shape;
        // The region trims the page to its rounded shape (hard-edged, and needed: a square corner would poke past
        // the card's own rounded edge); the corner windows then lay the smooth edge over it.
        SetPageShape(Px(f.Radius));ScheduleCorners();
    }
    private void ScheduleCorners(){cornerTimer.Stop();cornerTimer.Start();}
    /** Draws the smooth page corners from a fresh capture of the toolbar page. */
    private async Task RefreshCorners()
    {
        if(!Visible||fullscreen||diagnostics||frame is null||cornersFailed||chrome.CoreWebView2 is null||chrome.Width<1){corners.Hide();return;}
        try
        {
            using var stream=new MemoryStream();await chrome.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);stream.Position=0;
            using var card=new Bitmap(stream);
            if(!Visible||fullscreen||diagnostics){corners.Hide();return;}
            var radius=(int)Math.Round(frame.Value.Radius*DeviceDpi/96d);
            if(!corners.Show(card,chrome.PointToScreen(Point.Empty),card.Width/(double)chrome.Width,RectangleToScreen(pages.Bounds),radius)){cornersFailed=true;corners.Hide();ApplyPin();}
        }
        catch(Exception error) when(error is ArgumentException or InvalidOperationException or System.Runtime.InteropServices.COMException or ObjectDisposedException){corners.Hide();}
    }
    /**
     * Trims the page's corners. With the smooth corner windows on top, the cut sits 2px outside the true
     * curve (a region only keeps whole pixels, and cut exactly it bites into the curve's soft edge);
     * without them it follows the curve itself.
     */
    private void SetPageShape(int radius,bool exact=false)
    {
        var old=pages.Region;var w=pages.Width;var h=pages.Height;
        if(radius<=1||w<2*radius||h<2*radius)pages.Region=null;
        else
        {
            var cut=cornersFailed||exact?radius:radius+2;var region=new Region(new Rectangle(0,0,w,h));
            foreach(var (cx,cy,sx,sy) in new[]{(radius,radius,0,0),(w-radius,radius,w-radius,0),(w-radius,h-radius,w-radius,h-radius),(radius,h-radius,0,h-radius)})
            {
                using var circle=new System.Drawing.Drawing2D.GraphicsPath();circle.AddEllipse(cx-cut,cy-cut,cut*2,cut*2);
                using var corner=new Region(new Rectangle(sx,sy,radius,radius));corner.Exclude(circle);region.Exclude(corner);
            }
            pages.Region=region;
        }
        old?.Dispose();
    }
    private void UpdateViewport(){if(chrome.CoreWebView2 is not null&&Width>0&&Height>0)Emit("wallpaper-viewport",Surface.WallpaperViewport(Bounds));}
    private void SetFullscreen(bool value)
    {
        if(fullscreen==value)return;
        if(value){restoreBounds=Bounds;Bounds=constrainFullscreen?tileBounds:Screen.FromRectangle(tileBounds).Bounds;}
        else if(!restoreBounds.IsEmpty)Bounds=restoreBounds;
        fullscreen=value;ApplyPin();
    }
    private async Task<JsonNode?> Command(string command,JsonObject payload)
    {
        if(command!="browser")return await host.HandleCommand(command,payload);
        var action=payload["action"]?.GetValue<string>();var core=selected?.View.CoreWebView2;
        switch(action)
        {
            case "state":break;
            case "frame":
                double Read(string key)=>Math.Clamp(payload[key]?.GetValue<double>()??0,0,4000);
                frame=(Read("top"),Read("left"),Read("right"),Read("bottom"),Math.Min(Read("radius"),64));ApplyPin();
                // New colours fade in over .8s: draw the corners now and again once they have settled.
                var newLook=payload["look"]?.GetValue<string>()??"";if(newLook!=look){look=newLook;ScheduleCorners();_=Task.Delay(1000).ContinueWith(_=>{if(IsHandleCreated&&!IsDisposed)BeginInvoke(ScheduleCorners);},TaskScheduler.Default);}
                return null;
            // Where fullscreen video goes: the tile, or the whole display. The workspace keeps the choice.
            case "fullscreen-mode":
                constrainFullscreen=!constrainFullscreen;if(fullscreen)Bounds=constrainFullscreen?tileBounds:Screen.FromRectangle(tileBounds).Bounds;
                host.BrowserFullscreenChanged(name,constrainFullscreen);break;
            case "navigate":core?.Navigate(Address(payload["url"]!.GetValue<string>()));break;
            case "back":if(core?.CanGoBack==true)core.GoBack();break;
            case "forward":if(core?.CanGoForward==true)core.GoForward();break;
            case "reload":core?.Reload();break;
            case "external":if(core is not null)Host.OpenExternal(core.Source);break;
            case "add":await Add(payload["url"]?.GetValue<string>()??"https://www.google.com/",null,payload["background"]?.GetValue<bool>()!=true);break;
            // A repeated click can name a tab that has already closed; it is ignored rather than reported.
            case "select":if(Find(payload) is { } chosen)Select(chosen);break;
            case "close":if(Find(payload) is { } target)await Close(target);break;
            case "pin":pinned=!pinned;ApplyPin();break;
            case "diagnostics":diagnostics=payload["open"]?.GetValue<bool>()??false;ApplyPin();break;
            case "drag":if(!Docked){Windows.ReleaseCapture();Windows.SendMessage(Handle,0xA1,2,0);}break;
            case "devtools":core?.OpenDevToolsWindow();break;
            default:throw new InvalidOperationException("Unknown browser action.");
        }
        Persist();EmitState();return State();
    }
    private Tab? Find(JsonObject payload){var id=payload["id"]?.GetValue<string>();return tabs.FirstOrDefault(t=>t.Id==id);}
    private static readonly Lazy<string> runtime=new(()=>CoreWebView2Environment.GetAvailableBrowserVersionString());
    private JsonObject State()=>new(){["tabs"]=new JsonArray(tabs.Select(t=>(JsonNode)new JsonObject{["id"]=t.Id,["title"]=t.View.CoreWebView2.DocumentTitle??"New tab",["url"]=t.View.CoreWebView2.Source}).ToArray()),["selected"]=selected?.Id,["url"]=selected?.View.CoreWebView2.Source,["back"]=selected?.View.CoreWebView2.CanGoBack??false,["forward"]=selected?.View.CoreWebView2.CanGoForward??false,["pinned"]=pinned,["constrain"]=constrainFullscreen,["docked"]=Docked,["extension"]=extensionStatus,["error"]=selected?.Error,["runtime"]=runtime.Value};
    // Unchanged state is not rewritten or rebroadcast. An unreadable file is preserved and logged, not overwritten.
    private void Persist()
    {
        if(tabs.Count==0)return;
        try
        {
            var document=storage.ReadOptional("browsers-v2.json");var state=State();if(JsonNode.DeepEquals(document[name],state))return;
            document[name]=state;storage.SaveDocument("browsers-v2.json",document);
        }
        catch(Exception error) when(error is IOException or UnauthorizedAccessException or System.Text.Json.JsonException or InvalidDataException or InvalidOperationException){storage.Log("Browser state could not be saved",error);return;}
        host.NotifyBrowserCatalog();
    }
    internal void NotifyState()=>EmitState();
    private void EmitState(){if(chrome.CoreWebView2 is not null)Emit("browser",State());}
    public void Emit(string name,JsonNode data){if(chrome.CoreWebView2 is not null&&!IsDisposed)chrome.CoreWebView2.PostWebMessageAsJson(new JsonObject{["event"]=name,["data"]=data.DeepClone()}.ToJsonString());}
    protected override void Dispose(bool disposing){closing=true;if(disposing){cornerTimer.Dispose();corners.Dispose();}if(fullscreen&&!restoreBounds.IsEmpty)Bounds=restoreBounds;base.Dispose(disposing);}
}

using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

// The local toolbar alone has a host bridge. Remote pages have no application capabilities.
internal sealed class BrowserSurface : Form
{
    private sealed record Tab(string Id, WebView2 View) { public string? Error { get; set; } }
    private readonly Host host;
    private readonly Storage storage;
    private readonly string name;
    private readonly WebView2 chrome = new() { Dock=DockStyle.Top, Height=112 };
    private readonly Panel pages = new() { Dock=DockStyle.Fill };
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
    public BrowserSurface(Host host,Storage storage,string name,Rectangle bounds,bool constrainFullscreen=false)
    {
        this.host=host;this.storage=storage;this.name=name;this.constrainFullscreen=constrainFullscreen;tileBounds=bounds;Bounds=bounds;Text="Setpiece · "+name;
        FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.Manual;MinimumSize=new Size(280,160);
        Controls.Add(pages);Controls.Add(chrome);
        HandleCreated+=(_,_)=>Windows.ApplyRoundedCorners(Handle);
        Resize+=(_,_)=>{ApplyPin();Windows.ApplyRoundedCorners(Handle);};
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
        chrome.CoreWebView2.NavigationCompleted+=(_,_)=>EmitState();
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
    private async Task Add(string url,string? id=null)
    {
        if(tabs.Count>=20)throw new InvalidOperationException("Close a tab before opening another (20 maximum).");
        var address=Address(url);var view=new WebView2{Dock=DockStyle.Fill,Visible=false};pages.Controls.Add(view);
        await host.Configure(view,false);
        var core=view.CoreWebView2;var tab=new Tab(id??Guid.NewGuid().ToString("N"),view);tabs.Add(tab);
        core.Settings.AreDevToolsEnabled=true;
        core.NavigationStarting+=(_,e)=>{if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out var uri)||uri.Scheme is not ("http" or "https" or "about" or "blob"))e.Cancel=true;tab.Error=null;EmitState();};
        core.NewWindowRequested+=async(_,e)=>{e.Handled=true;try{await Add(e.Uri);}catch(Exception error){tab.Error=error.Message;EmitState();}};
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
        core.Navigate(address);Select(tab);Persist();
    }
    private void Select(Tab tab){selected=tab;foreach(var item in tabs)item.View.Visible=item==tab;tab.View.BringToFront();SetFullscreen(tab.View.CoreWebView2.ContainsFullScreenElement);EmitState();}
    private void ApplyPin(){chrome.Visible=!fullscreen||diagnostics;chrome.Height=diagnostics?ClientSize.Height:pinned?124:40;pages.Visible=!diagnostics;}
    private void SetFullscreen(bool value)
    {
        if(fullscreen==value)return;
        if(value){restoreBounds=Bounds;Bounds=constrainFullscreen?tileBounds:Screen.FromRectangle(tileBounds).Bounds;}
        else if(!restoreBounds.IsEmpty)Bounds=restoreBounds;
        fullscreen=value;Windows.ApplyRoundedCorners(Handle,!fullscreen||constrainFullscreen);ApplyPin();
    }
    private async Task<JsonNode?> Command(string command,JsonObject payload)
    {
        if(command!="browser")return await host.HandleCommand(command,payload);
        var action=payload["action"]?.GetValue<string>();var core=selected?.View.CoreWebView2;
        switch(action)
        {
            case "state":break;
            case "navigate":core?.Navigate(Address(payload["url"]!.GetValue<string>()));break;
            case "back":if(core?.CanGoBack==true)core.GoBack();break;
            case "forward":if(core?.CanGoForward==true)core.GoForward();break;
            case "reload":core?.Reload();break;
            case "external":if(core is not null)Host.OpenExternal(core.Source);break;
            case "add":await Add("https://www.google.com/");break;
            case "select":Select(tabs.First(t=>t.Id==payload["id"]!.GetValue<string>()));break;
            case "close":
                var target=tabs.First(t=>t.Id==payload["id"]!.GetValue<string>());tabs.Remove(target);target.View.Dispose();
                if(tabs.Count==0)await Add("https://www.google.com/");else if(target==selected)Select(tabs[0]);break;
            case "pin":pinned=!pinned;ApplyPin();break;
            case "diagnostics":diagnostics=payload["open"]?.GetValue<bool>()??false;ApplyPin();break;
            case "hide":Hide();break;
            case "drag":Windows.ReleaseCapture();Windows.SendMessage(Handle,0xA1,2,0);break;
            case "devtools":core?.OpenDevToolsWindow();break;
            default:throw new InvalidOperationException("Unknown browser action.");
        }
        Persist();EmitState();return State();
    }
    private JsonObject State()=>new(){["tabs"]=new JsonArray(tabs.Select(t=>(JsonNode)new JsonObject{["id"]=t.Id,["title"]=t.View.CoreWebView2.DocumentTitle??"New tab",["url"]=t.View.CoreWebView2.Source}).ToArray()),["selected"]=selected?.Id,["url"]=selected?.View.CoreWebView2.Source,["back"]=selected?.View.CoreWebView2.CanGoBack??false,["forward"]=selected?.View.CoreWebView2.CanGoForward??false,["pinned"]=pinned,["extension"]=extensionStatus,["error"]=selected?.Error,["runtime"]=CoreWebView2Environment.GetAvailableBrowserVersionString()};
    private void Persist(){if(tabs.Count==0)return;var document=storage.ReadOptional("browsers-v2.json");document[name]=State();storage.SaveDocument("browsers-v2.json",document);host.NotifyBrowserCatalog();}
    private void EmitState(){if(chrome.CoreWebView2 is not null)Emit("browser",State());}
    public void Emit(string name,JsonNode data){if(chrome.CoreWebView2 is not null&&!IsDisposed)chrome.CoreWebView2.PostWebMessageAsJson(new JsonObject{["event"]=name,["data"]=data.DeepClone()}.ToJsonString());}
    protected override void Dispose(bool disposing){closing=true;if(fullscreen&&!restoreBounds.IsEmpty)Bounds=restoreBounds;base.Dispose(disposing);}
}

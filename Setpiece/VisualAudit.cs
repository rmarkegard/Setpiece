using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

// Uses the same rendered components and live service boundary as the desktop app.
// Invoked explicitly with an isolated data root; never writes normal user profiles.
internal static class VisualAudit
{
    private sealed record Scene(string Name,string Query,int Width,int Height,string? Service=null);
    // Synthetic populated states exist only in the explicitly requested isolated audit.
    private static JsonNode DesignFixture(string service){var result=JsonNode.Parse(service switch{
        "system"=>"""{"status":"ready","title":"System","detail":"15.1 / 31.9 GB memory","data":{"cpu":18,"memory":47,"gpu":48,"temperature":46,"download":254000,"upload":7800}}""",
        "weather"=>"""{"status":"ready","title":"16°","detail":"Oslo","data":{"feelsLike":14.5,"wind":24.8,"code":61},"items":[{"title":"19:00","detail":"16.8° · 100% rain"},{"title":"20:00","detail":"16.7° · 100% rain"},{"title":"21:00","detail":"16.7° · 91% rain"},{"title":"22:00","detail":"16.8° · 77% rain"},{"title":"23:00","detail":"16.9° · 63% rain"}]}""",
        "bambu-lab"=>"""{"status":"ready","title":"Printing","detail":"A1 Mini","data":{"stage":"Layer by layer","progress":68,"minutes":24,"layer":198,"layers":291,"nozzle":219.578,"bed":59.783,"cameraStatus":"Camera unavailable in design sample"}}""",
        "google-calendar"=>"""{"status":"ready","title":"Today","detail":"Your upcoming events","items":[{"title":"Design review with the team","detail":"10:30 · 45 min"},{"title":"Lunch with Sara","detail":"12:00 · City centre"},{"title":"Focus time","detail":"14:00 · 2 hours"}]}""",
        "ruter"=>"""{"status":"ready","title":"Kjelsås stasjon","detail":"Departures nearby","items":[{"title":"54 · Tåsen","detail":"2 min"},{"title":"54 · Kværnerbyen","detail":"5 min"},{"title":"12 · Majorstuen","detail":"7 min"},{"title":"54 · Ekeberg hageby","detail":"11 min"}]}""",
        "discord"=>"""{"status":"ready","title":"Setpiece Makers","detail":"4 members online","items":[{"title":"Ruben","detail":"online"},{"title":"Mira","detail":"online"},{"title":"Tess","detail":"idle"},{"title":"Jon","detail":"online"}]}""",
        "spotify"=>"""{"status":"ready","title":"Night Drive","detail":"Chromatics · Kill for Love","data":{"progress":119000,"duration":280000,"playing":true}}""",
        "email"=>"""{"status":"ready","title":"6 messages need attention","detail":"Unread in the last 24 hours","items":[{"title":"Quarterly update","detail":"Alex · 10 min ago"},{"title":"Design review","detail":"Mira · 25 min ago"},{"title":"Invoice 2841","detail":"Finance · 1 h ago"},{"title":"Weekend plans","detail":"Tess · 2 h ago"}]}""",
        "news"=>"""{"status":"ready","title":"A quieter web is taking shape","detail":"The latest from VG","items":[{"title":"A quieter web is taking shape","detail":"New tools change the daily rhythm."},{"title":"The city prepares for a warm weekend","detail":"A forecast worth planning around."},{"title":"Researchers map the next generation of chips","detail":"The work continues across the field."},{"title":"Local teams meet in a close final","detail":"A late goal changed the match."}]}""",
        "reddit"=>"""{"status":"ready","title":"r/technology","detail":"A conversation worth a moment","items":[{"title":"A new approach to local-first software","detail":"1.2k points · 318 comments"},{"title":"What are you building this week?","detail":"642 points · 129 comments"},{"title":"An open standard gets a new release","detail":"529 points · 84 comments"}]}""",
        "battery"=>"""{"status":"ready","title":"81%","detail":"About 4 h 20 min remaining","data":{"level":81,"charging":false}}""",
        "volume"=>"""{"status":"ready","title":"System volume","detail":"Windows output device","data":{"level":42,"peak":28,"muted":false}}""",
        "codex"=>"""{"status":"ready","title":"AI Usage","detail":"Account limits","data":{"codex":{"windows":[{"name":"codex","minutes":300,"used":8,"reset":1790000000},{"name":"codex","minutes":10080,"used":78,"reset":1790200000}]},"opencode":{"available":true,"sessions":51,"tokens":15236247,"cost":9.29},"go":{"windows":[{"name":"rolling","used":0},{"name":"weekly","used":0},{"name":"monthly","used":49}]}}}""",
        _=>"""{"status":"disconnected","title":"Connect a service","detail":"Design review"}"""
    })!;
        if(service=="google-calendar"){var items=result["items"]!.AsArray();var original=items.Select(x=>x!.DeepClone()).ToArray();for(var i=0;i<21;i++)items.Add(original[i%original.Length].DeepClone());}
        return result;
    }
    public static async Task Run(Host host,Storage storage,string output)
    {
        Directory.CreateDirectory(output);
        if(Environment.GetCommandLineArgs().Contains("--capture-layout")){await LayoutAudit.Run(host,storage,output);return;}
        using var providers=new Providers(storage);
        var arguments=Environment.GetCommandLineArgs();
        var design=arguments.Contains("--design-review");
        var offline=arguments.Contains("--offline-review");
        if(!design&&!offline){
        await providers.Connect(new JsonObject{["service"]="weather",["location"]="Oslo"});
        var stops=await providers.SearchStops("Jernbanetorget");
        if(stops.FirstOrDefault() is JsonObject stop)await providers.Connect(new JsonObject{["service"]="ruter",["stopId"]=stop["id"]!.DeepClone(),["stopName"]=stop["name"]!.DeepClone()});
        }
        var profile=Storage.Normalize(new JsonObject{["Name"]="Setpiece Reveal",["MonitorIndex"]=0,["WallpaperId"]="fjord-glass",["AnimatedWallpaper"]=false,["Zones"]=new JsonArray(
            new JsonObject{["X"]=0d,["Y"]=0d,["Width"]=.5,["Height"]=1d},
            new JsonObject{["X"]=.5,["Y"]=0d,["Width"]=.5,["Height"]=.5,["ContentKind"]="Widget",["WidgetId"]="clock"},
            new JsonObject{["X"]=.5,["Y"]=.5,["Width"]=.5,["Height"]=.5,["ContentKind"]="Widget",["WidgetId"]="weather"})});
        if(design)foreach(var board in profile["MonitorBoards"]!.AsArray())board!["WidgetScale"]=1.6;
        storage.SaveProfile("visual-review",profile);
        await host.HandleCommand("profile",new JsonObject{["profile"]=profile.DeepClone()});
        var scenes=new List<Scene>();
        foreach(var route in new[]{"Studio","Widgets","Browsers","Appearance","Settings"})
            scenes.Add(new(route.ToLowerInvariant(),"route="+route,1440,route=="Widgets"?1500:route=="Appearance"?1500:route=="Settings"?1400:1000));
        var widgets=new[]{"clock","system","google-calendar","discord","spotify","codex","weather","bambu-lab","ruter","news","notes","email","battery","volume","reddit","idle-game","market","focus","github","twitter"};
        foreach(var widget in widgets)scenes.Add(new("widget-"+widget,"widget="+widget,440,440,widget));
        foreach(var widget in widgets)
        {
            scenes.Add(new("compact-"+widget,"widget="+widget,360,220,widget));
            scenes.Add(new("tall-"+widget,"widget="+widget,280,660,widget));
        }
        foreach(var service in new[]{"weather","ruter","calendar","google","spotify","discord","reddit","news","email","codex","system","bambu-lab"})scenes.Add(new("guide-"+service,"guide="+service,1000,900));
        scenes.Add(new("game-pilot","game=1",1000,800));scenes.Add(new("game-skills","game=1&skills=1",1000,800));
        scenes.Add(new("workspace","workspace=0",1440,900));
        if(design){scenes.Clear();foreach(var widget in widgets)foreach(var size in new[]{new Size(300,340),new Size(540,325),new Size(280,660),new Size(360,220),new Size(512,286),new Size(384,286),new Size(936,256),new Size(343,271),new Size(344,635)})scenes.Add(new($"design-{widget}-{size.Width}x{size.Height}","widget="+widget,size.Width,size.Height,widget));}
        var filterIndex=Array.IndexOf(arguments,"--capture-filter");
        if(filterIndex>=0&&filterIndex+1<arguments.Length)
        {
            var filters=arguments[filterIndex+1].Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);
            scenes.RemoveAll(scene=>!filters.Any(value=>value.StartsWith('=')?scene.Name.Equals(value[1..],StringComparison.OrdinalIgnoreCase):scene.Name.Contains(value,StringComparison.OrdinalIgnoreCase)));
        }
        var results=new JsonArray();
        using var frame=new Form{Text="Setpiece visual audit",FormBorderStyle=FormBorderStyle.None,StartPosition=FormStartPosition.Manual,Location=new Point(40,40),ShowInTaskbar=false};
        using var view=new WebView2{Dock=DockStyle.Fill};frame.Controls.Add(view);frame.Show();await host.Configure(view,true,async(command,payload)=>design&&command=="service"?DesignFixture(payload["service"]!.GetValue<string>()):await host.HandleCommand(command,payload));
        view.CoreWebView2.NavigationStarting+=(_,args)=>storage.Log("Audit navigation starting: "+args.Uri);
        view.CoreWebView2.NavigationCompleted+=(_,args)=>storage.Log($"Audit navigation completed: success={args.IsSuccess}; error={args.WebErrorStatus}; source={view.CoreWebView2?.Source ?? "<unavailable>"}");
        view.CoreWebView2.ProcessFailed+=(_,args)=>storage.Log("Audit WebView2 process failed: "+args.ProcessFailedKind);
        foreach(var theme in new[]{"terminal","luna"})foreach(var scene in scenes)
        {
            frame.ClientSize=new Size(scene.Width,scene.Height);
            if(!design&&scene.Service is not null&&widgets.Take(16).Contains(scene.Service)&&scene.Service is not ("notes" or "idle-game"))await host.HandleCommand("service",new JsonObject{["service"]=scene.Service});
            var completion=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            void Complete(object? sender,CoreWebView2NavigationCompletedEventArgs args){if(args.IsSuccess)completion.TrySetResult();else completion.TrySetException(new IOException("Audit navigation failed: "+args.WebErrorStatus));}
            view.CoreWebView2.NavigationCompleted+=Complete;
            try
            {
                view.CoreWebView2.Navigate("https://setpiece.local/index.html?capture=1&theme="+theme+"&"+scene.Query);
                try{await completion.Task.WaitAsync(TimeSpan.FromSeconds(30));}
                catch(TimeoutException){storage.Log($"Audit navigation timed out after 30 seconds: scene={scene.Name}; theme={theme}; source={view.CoreWebView2?.Source ?? "<unavailable>"}");throw;}
            }
            finally{if(view.CoreWebView2 is { } core)core.NavigationCompleted-=Complete;}
            for(var i=0;i<100;i++){var ready=await view.CoreWebView2.ExecuteScriptAsync("document.body.dataset.captureReady==='true' && !document.querySelector('.state-label')?.textContent.includes('loading')");if(ready=="true")break;await Task.Delay(200);}
            await Task.Delay(600);
            var measurement=await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({pageOverflow:!!document.querySelector('.page')&&document.querySelector('.page').scrollHeight>document.querySelector('.page').clientHeight+2,widgets:[...document.querySelectorAll('.fit-container')].map(e=>{const c=e.firstElementChild,r=c.getBoundingClientRect(),b=e.getBoundingClientRect(),overflows=[...e.querySelectorAll('*')].filter(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1).slice(0,12).map(n=>{const x=n.getBoundingClientRect(),s=getComputedStyle(n);return {tag:n.tagName,className:typeof n.className==='string'?n.className:n.getAttribute('class'),scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,left:Math.round(x.left),right:Math.round(x.right),top:Math.round(x.top),bottom:Math.round(x.bottom),overflowX:s.overflowX,overflowY:s.overflowY,minWidth:s.minWidth,width:s.width,paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,gap:s.gap,display:s.display,flexWrap:s.flexWrap}});return {scrolls:e.scrollHeight>e.clientHeight+1,horizontalOverflow:e.scrollWidth>e.clientWidth+1,eventCount:e.querySelectorAll('.agenda>div').length,zoom:Number(c.style.zoom),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,innerScrollHeight:c.scrollHeight,innerClientHeight:c.clientHeight,width:b.width,height:b.height,contentWidth:r.width,contentHeight:r.height,fits:r.right<=b.right+2&&r.bottom<=b.bottom+2,overflows}})})");
            var file=theme+"-"+scene.Name+".png";
            await using(var stream=File.Create(Path.Combine(output,file)))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
            results.Add(new JsonObject{["file"]=file,["width"]=scene.Width,["height"]=scene.Height,["measurement"]=JsonNode.Parse(JsonNode.Parse(measurement)!.GetValue<string>())});
            File.WriteAllText(Path.Combine(output,"manifest.json"),results.ToJsonString(new(){WriteIndented=true}));
            storage.Log("Visual audit captured "+file);
        }
    }
}

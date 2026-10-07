using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

// Uses the same rendered components and live service boundary as the desktop app.
// Invoked explicitly with an isolated data root; never writes normal user profiles.
internal static class VisualAudit
{
    private sealed record Scene(string Name,string Query,int Width,int Height,string? Service=null);
    // Synthetic populated states exist only in the explicitly requested isolated audit. They mirror the
    // development fixtures in UI/src/dev/fixtures.ts (the widget redesign's sample data), relative to now.
    private static JsonNode DesignFixture(string service)
    {
        var now=DateTimeOffset.Now;string At(double minutes)=>now.AddMinutes(minutes).ToString("O");
        string Day(int days,int hour,int minute)=>new DateTimeOffset(now.Date.AddDays(days).AddHours(hour).AddMinutes(minute),now.Offset).ToString("O");
        var soon=now.AddHours(2);soon=soon.AddMinutes(soon.Minute<30?30-soon.Minute:60-soon.Minute).AddSeconds(-soon.Second);
        return JsonNode.Parse(service switch{
            "system"=>"""{"status":"ready","title":"18% CPU","detail":"15.1 / 31.9 GB memory","data":{"cpu":18,"memory":47,"gpu":31,"temperature":46,"download":254000,"upload":7800,"usedGb":15.1,"totalGb":31.9,"cpuName":"AMD Ryzen 7 7800X3D 8-Core Processor","gpuName":"NVIDIA GeForce RTX 4070"}}""",
            "weather"=>$$"""{"status":"ready","title":"16°","detail":"Oslo","updated":"{{At(0)}}","data":{"feelsLike":14.5,"wind":12,"code":2,"high":18,"low":11},"items":[{{string.Join(",",new[]{16,17,17,16,14,12}.Select((t,i)=>$$"""{"title":"{{now.AddHours(i):HH}}:00","detail":"{{t}}° · 10% rain","temp":{{t}}}"""))}}]}""",
            "bambu-lab"=>"""{"status":"ready","title":"Making something good","detail":"Bambu Lab A1 Mini","data":{"stage":"RUNNING","progress":68,"minutes":24,"layer":198,"layers":291,"nozzle":220,"bed":65,"job":"Benchy","filament":"PLA Matte","cameraStatus":"Camera unavailable in design sample"}}""",
            "google-calendar"=>$$"""{"status":"ready","title":"Your next 6 months","detail":"Upcoming events","items":[{{string.Join(",",new[]{(soon.ToString("O"),"Dinner with Sara","Mathallen"),(Day(2,17,30),"Verity","Odeon Kino"),(Day(4,20,45),"Digger","Rockefeller"),(Day(11,9,0),"Setpiece 2.0 launch","Release day"),(Day(19,8,0),"Bygdøyløpet","10 km"),(Day(46,19,0),"Fotball","Ullevaal Stadion"),(Day(54,12,30),"Flight to London","OSL → LHR"),(Day(57,14,15),"Flight to Oslo","LHR → OSL"),(Day(81,18,0),"Julebord","Grand Hotel")}.Select((e,i)=>$$"""{"id":"event-{{i}}","title":"{{e.Item2}}","detail":"{{e.Item3}}","start":"{{e.Item1}}","place":"{{e.Item3}}"}"""))}}]}""",
            "ruter"=>$$"""{"status":"ready","title":"Kjelsås stasjon","detail":"Live departures · Entur","items":[{{string.Join(",",new[]{(2,"54","Tåsen","bus","A"),(5,"54","Kværnerbyen","bus","A"),(7,"12","Majorstuen","tram","B"),(11,"54","Ekeberg hageby","bus","A"),(14,"R10","Drammen","rail","1"),(19,"25","Majorstuen","bus","C")}.Select(d=>$$"""{"id":"{{d.Item2}}-{{d.Item3}}","title":"{{d.Item2}} · {{d.Item3}}","detail":"{{d.Item1}} min","line":"{{d.Item2}}","destination":"{{d.Item3}}","mode":"{{d.Item4}}","platform":"{{d.Item5}}","minutes":{{d.Item1}},"time":"{{At(d.Item1)}}","delay":0}"""))}}]}""",
            "discord"=>"""{"status":"ready","title":"Lounge","detail":"4 participants · Discord desktop","items":[{"id":"you","title":"You","detail":"In call"},{"id":"sara","title":"Sara","detail":"In call"},{"id":"jonas","title":"Jonas","detail":"In call"},{"id":"ingrid","title":"Ingrid","detail":"In call"}],"data":{"voice":true,"server":"Setpiece Crew","muted":false,"deafened":false}}""",
            "spotify"=>"""{"status":"ready","title":"Night Drive","detail":"Chromatics","data":{"album":"Night Drive","track":"2Z8WuEywRWYTKe1NybPQEW","device":"Studio PC","progress":119000,"duration":280000,"playing":true,"liked":false}}""",
            "email"=>$$"""{"status":"ready","title":"Unread, within reach","detail":"Google inbox · latest unread messages","data":{"count":4,"source":"Gmail · Primary"},"items":[{"title":"Re: Widget review notes","detail":"Sara Lie","from":"Sara Lie","time":"{{Day(0,9,12)}}"},{"title":"[setpiece] PR #8 is ready for review","detail":"GitHub","from":"GitHub","time":"{{Day(0,8,47)}}"},{"title":"Your filament order has shipped","detail":"Bambu Lab","from":"Bambu Lab","time":"{{Day(0,8,3)}}"},{"title":"Your monthly pass renews on Friday","detail":"Ruter","from":"Ruter","time":"{{Day(-((int)now.DayOfWeek==0?7:(int)now.DayOfWeek),18,20)}}"}]}""",
            "news"=>$$"""{"status":"ready","title":"The latest from VG","detail":"Headlines from Norway","items":[{"title":"Rekordvarm september: Oslo slo 100 år gammel rekord","detail":"","category":"Nyheter","published":"{{At(-12)}}"},{"title":"Nordlyset kan bli synlig over hele Sør-Norge i natt","detail":"","category":"Vær","published":"{{At(-48)}}"},{"title":"Ny T-banelinje til Fornebu åpner tidligere enn planlagt","detail":"","category":"Nyheter","published":"{{At(-120)}}"},{"title":"Bodø/Glimt snudde kampen på overtid – full jubel på Aspmyra","detail":"","category":"Sport","published":"{{At(-180)}}"}]}""",
            "reddit"=>$$"""{"status":"ready","title":"r/technology","detail":"Hot conversations","items":[{"title":"Researchers demo a laptop battery that charges in under five minutes","detail":"4210 points","score":4210,"created":{{now.AddHours(-5).ToUnixTimeSeconds()}}},{"title":"The quiet comeback of the dedicated music player","detail":"2870 points","score":2870,"created":{{now.AddHours(-3).ToUnixTimeSeconds()}}},{"title":"Open-source printer firmware adds live layer previews","detail":"1940 points","score":1940,"created":{{now.AddHours(-2).ToUnixTimeSeconds()}}},{"title":"A tiny e-ink dashboard that shows your whole day at a glance","detail":"860 points","score":860,"created":{{now.AddMinutes(-40).ToUnixTimeSeconds()}}}]}""",
            "twitch"=>"""{"status":"ready","title":"#setpiece","detail":"Live chat","data":{"channel":"setpiece","connected":true},"items":[{"id": "c1", "title": "Nova_Flux", "detail": "just got here, what did I miss?", "color": "#9146FF", "action": false, "badges": ["moderator"], "parts": [{"t": "just got here, what did I miss?"}]},{"id": "c2", "title": "kettleDrum", "detail": "the new layout looks so clean", "color": "#1E90FF", "action": false, "badges": ["subscriber"], "parts": [{"t": "the new layout looks so clean"}]},{"id": "c3", "title": "ping_pong", "detail": "same, those rounded corners \ud83d\udc4c", "color": "#FF7F50", "action": false, "badges": [], "parts": [{"t": "same, those rounded corners \ud83d\udc4c"}]},{"id": "c4", "title": "Marit", "detail": "we are so back", "color": "#2E8B57", "action": false, "badges": ["vip"], "parts": [{"t": "we are so back"}]},{"id": "c5", "title": "jonasdev", "detail": "anyone know what song this is?", "color": "", "action": false, "badges": [], "parts": [{"t": "anyone know what song this is?"}]},{"id": "c6", "title": "Streamer", "detail": "thanks for the follow, welcome in!", "color": "#E91E63", "action": false, "badges": ["broadcaster"], "parts": [{"t": "thanks for the follow, welcome in!"}]}]}""",
            "battery"=>"""{"status":"ready","title":"76%","detail":"3h 18m remaining","data":{"level":76,"charging":false,"plugged":false,"saver":false,"remaining":11880}}""",
            "volume"=>"""{"status":"ready","title":"42%","detail":"Speakers (Realtek Audio)","data":{"level":42,"peak":28,"muted":false}}""",
            "codex"=>"""{"status":"ready","title":"Room for your next idea","detail":"Claude and Codex limits, OpenCode activity","data":{"claude":{"windows":[{"name":"claude","minutes":300,"used":34,"resetText":"CLAUDE_RESET"},{"name":"claude","minutes":10080,"used":61}]},"codex":{"windows":[{"name":"codex","minutes":300,"used":8,"reset":CODEX_RESET},{"name":"codex","minutes":10080,"used":78}]},"opencode":{"available":true,"sessions":51,"tokens":15236247,"cost":9.29},"go":{"windows":[{"name":"rolling","used":3},{"name":"weekly","used":12},{"name":"monthly","used":49}]}}}""".Replace("CLAUDE_RESET",At(134.5)).Replace("CODEX_RESET",now.AddHours(4).ToUnixTimeSeconds().ToString()),
            _=>"""{"status":"disconnected","title":"Connect a service","detail":"Design review"}"""
        })!;
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
        var profile=Storage.Normalize(new JsonObject{["Name"]="Setpiece Reveal",["MonitorIndex"]=0,["WallpaperId"]="jade-synthesis",["Zones"]=new JsonArray(
            new JsonObject{["X"]=0d,["Y"]=0d,["Width"]=.5,["Height"]=1d},
            new JsonObject{["X"]=.5,["Y"]=0d,["Width"]=.5,["Height"]=.5,["ContentKind"]="Widget",["WidgetId"]="clock"},
            new JsonObject{["X"]=.5,["Y"]=.5,["Width"]=.5,["Height"]=.5,["ContentKind"]="Widget",["WidgetId"]="weather"})});
        if(design)foreach(var board in profile["MonitorBoards"]!.AsArray())board!["WidgetScale"]=1.6;
        storage.SaveProfile("visual-review",profile);
        await host.HandleCommand("profile",new JsonObject{["profile"]=profile.DeepClone()});
        var scenes=new List<Scene>();
        foreach(var route in new[]{"Studio","Widgets","Browsers","Appearance","Settings"})
            scenes.Add(new(route.ToLowerInvariant(),"route="+route,1440,route=="Widgets"?1500:route=="Appearance"?1500:route=="Settings"?1400:1000));
        var widgets=new[]{"clock","system","google-calendar","discord","twitch","spotify","codex","weather","bambu-lab","ruter","news","notes","email","battery","volume","reddit","market","focus","github","twitter"};
        foreach(var widget in widgets)scenes.Add(new("widget-"+widget,"widget="+widget,440,440,widget));
        foreach(var widget in widgets)
        {
            scenes.Add(new("compact-"+widget,"widget="+widget,360,220,widget));
            scenes.Add(new("tall-"+widget,"widget="+widget,280,660,widget));
        }
        foreach(var service in new[]{"weather","ruter","calendar","google","spotify","discord","reddit","news","email","codex","system","bambu-lab"})scenes.Add(new("guide-"+service,"guide="+service,1000,900));
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
            if(!design&&scene.Service is not null&&widgets.Take(15).Contains(scene.Service)&&scene.Service!="notes")await host.HandleCommand("service",new JsonObject{["service"]=scene.Service});
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

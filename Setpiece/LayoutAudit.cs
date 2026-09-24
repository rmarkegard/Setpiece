using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

// Opt-in production WebView2 integration checks, using an isolated audit data root.
internal static class LayoutAudit
{
    public static async Task Run(Host host,Storage storage,string output)
    {
        var profile=Storage.Normalize(new JsonObject{["Name"]="Free placement",["MonitorIndex"]=0,["SmartSnap"]=false,["AnimatedWallpaper"]=false,["Zones"]=new JsonArray(
            new JsonObject{["Id"]="app",["X"]=0d,["Y"]=0d,["Width"]=.5,["Height"]=1d},
            new JsonObject{["Id"]="clock",["X"]=.5,["Y"]=0d,["Width"]=.5,["Height"]=1d,["ContentKind"]="Widget",["WidgetId"]="clock"})});
        storage.SaveProfile("layout-audit",profile);
        using var frame=new Form{Text="Setpiece layout audit",FormBorderStyle=FormBorderStyle.None,StartPosition=FormStartPosition.Manual,Location=new Point(40,40),ShowInTaskbar=false};
        using var view=new WebView2{Dock=DockStyle.Fill};frame.Controls.Add(view);frame.Show();await host.Configure(view);
        var results=new JsonArray();
        async Task<JsonNode> Read(string expression)=>JsonNode.Parse(await view.CoreWebView2.ExecuteScriptAsync(expression))!;
        async Task Mouse(string type,double x,double y)=>await view.CoreWebView2.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent",new JsonObject{["type"]=type,["x"]=x,["y"]=y,["button"]="left",["buttons"]=type=="mouseReleased"?0:1,["clickCount"]=1}.ToJsonString());
        async Task Drag(string selector,double dx,double dy)
        {
            await Read("document.querySelector("+System.Text.Json.JsonSerializer.Serialize(selector)+").scrollIntoView({block:'nearest',inline:'nearest'})");
            await Task.Delay(50);
            var point=await Read("(()=>{const r=document.querySelector("+System.Text.Json.JsonSerializer.Serialize(selector)+").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
            var x=point["x"]!.GetValue<double>();var y=point["y"]!.GetValue<double>();
            await Mouse("mousePressed",x,y);await Mouse("mouseMoved",x+dx,y+dy);await Mouse("mouseReleased",x+dx,y+dy);await Task.Delay(150);
        }
        async Task Check(bool condition,string name){if(!condition)throw new InvalidOperationException("Layout audit failed: "+name);results.Add(new JsonObject{["check"]=name,["passed"]=true});File.WriteAllText(Path.Combine(output,"layout-checks.json"),results.ToJsonString(new(){WriteIndented=true}));await Task.CompletedTask;}
        foreach(var scene in new[]{("landscape",1920,1080,1440,1000),("ultrawide",3440,1440,1440,1000),("portrait",1080,1920,1440,1000),("4k",3840,2160,1440,1000),("small-window",1920,1080,1040,680)})
        {
            frame.ClientSize=new Size(scene.Item4,scene.Item5);
            var ready=new TaskCompletionSource();
            void Complete(object? sender,CoreWebView2NavigationCompletedEventArgs e){if(e.IsSuccess)ready.TrySetResult();else ready.TrySetException(new IOException(e.WebErrorStatus.ToString()));}
            view.CoreWebView2.NavigationCompleted+=Complete;
            try{view.CoreWebView2.Navigate("https://setpiece.local/index.html?capture=1&theme=terminal");await ready.Task.WaitAsync(TimeSpan.FromSeconds(30));}
            finally{view.CoreWebView2.NavigationCompleted-=Complete;}
            for(var i=0;i<100;i++){if((await Read("document.body.dataset.captureReady==='true'")).GetValue<bool>())break;await Task.Delay(100);}
            view.CoreWebView2.PostWebMessageAsJson(new JsonObject{["event"]="displays",["data"]=new JsonArray(new JsonObject{["index"]=0,["name"]="Audit display",["width"]=scene.Item2,["height"]=scene.Item3,["x"]=0,["y"]=0,["primary"]=true})}.ToJsonString());
            await Task.Delay(250);
            var bounds=await Read("(()=>{const r=document.querySelector('.board').getBoundingClientRect();return {width:r.width,height:r.height}})()");
            var width=bounds["width"]!.GetValue<double>();var height=bounds["height"]!.GetValue<double>();
            await Check(Math.Abs(width/height-scene.Item2/(double)scene.Item3)<.002,scene.Item1+": preview matches monitor aspect ratio");
            await Check((await Read("document.querySelectorAll('.tile-resize').length")).GetValue<int>()==8,scene.Item1+": selected tile exposes eight resize handles");
            await Drag(".selected .resize-se",-.15*width,-.3*height);
            var smaller=await Read("parseFloat(document.querySelector('.board .tile').style.width)");
            await Check(smaller.GetValue<double>()<40,scene.Item1+": pointer resize creates empty space");
            await Drag(".selected .tile-heading",.08*width,.1*height);
            await Check((await Read("parseFloat(document.querySelector('.board .tile').style.left)")).GetValue<double>()>5,scene.Item1+": pointer drag moves application tile freely");
            await Drag(".selected .tile-heading",width,0);
            await Check((await Read("(()=>{const a=document.querySelector('.board .tile').getBoundingClientRect(),b=document.querySelectorAll('.board .tile')[1].getBoundingClientRect();return a.right<=b.left})()")).GetValue<bool>(),scene.Item1+": fast drag stops at neighboring widget");
            await Read("document.querySelectorAll('.board .tile')[1].click()");await Task.Delay(100);
            await Drag(".selected .resize-se",-.12*width,-.4*height);
            await Drag(".selected .widget-grip",.04*width,.15*height);
            await Check((await Read("parseFloat(document.querySelectorAll('.board .tile')[1].style.top)")).GetValue<double>()>10,scene.Item1+": widget resizes and moves independently");
            await using var stream=File.Create(Path.Combine(output,scene.Item1+".png"));await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
        }
    }
}

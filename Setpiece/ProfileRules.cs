using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal static class ProfileRules
{
    private const double Epsilon=.000001;
    internal static double Number(JsonObject source,string key,double fallback)
    {
        if(source[key] is not JsonValue value)return fallback;
        var number=value.TryGetValue<double>(out var d)?d:value.TryGetValue<int>(out var i)?i:value.TryGetValue<long>(out var l)?l:fallback;
        return double.IsFinite(number)?number:fallback;
    }
    private static string Text(JsonObject source,string key,string fallback="")=>source[key] is JsonValue v&&v.TryGetValue<string>(out var s)?s:fallback;
    private static bool Flag(JsonObject source,string key,bool fallback)=>source[key] is JsonValue v&&v.TryGetValue<bool>(out var b)?b:fallback;
    private static int Index(JsonObject source,string key)=>Math.Clamp((int)Number(source,key,0),0,128);
    public static JsonObject Normalize(JsonObject profile,bool repair)
    {
        var notices=new List<string>();
        profile["Name"]=Text(profile,"Name","Untitled workspace").Trim();if(Text(profile,"Name").Length==0)profile["Name"]="Untitled workspace";
        profile["Gap"]=Math.Clamp(Number(profile,"Gap",12),0,40);profile["OuterMargin"]=Math.Clamp(Number(profile,"OuterMargin",16),0,64);
        profile["SnapStep"]=Math.Clamp(Number(profile,"SnapStep",.05),.01,.2);profile["SmartSnap"]=Flag(profile,"SmartSnap",true);profile["AnimatedWallpaper"]=Flag(profile,"AnimatedWallpaper",true);
        profile["SchemaVersion"]=18;profile["FreeformBoard"]=true;
        var wallpaper=Text(profile,"WallpaperId","ambient");var known=new[]{"ambient","fjord-glass","paper-horizon","moss-geometry","blue-hour","ember-grid","slate-dunes","orchard-mist","violet-current","quiet-coast","mono-bloom"};profile["WallpaperId"]=known.Contains(wallpaper)?wallpaper:"ambient";
        var current=Index(profile,"MonitorIndex");var selected=new List<int>();
        if(profile["MonitorIndices"] is JsonArray indices)foreach(var item in indices){if(item is JsonValue value&&value.TryGetValue<int>(out var index)&&index is >=0 and <=128&&!selected.Contains(index))selected.Add(index);}
        if(selected.Count==0)selected.Add(current);if(!selected.Contains(current))current=selected[0];
        profile["MonitorIndex"]=current;profile["MonitorIndices"]=new JsonArray(selected.Select(i=>(JsonNode)JsonValue.Create(i)!).ToArray());
        var boards=profile["MonitorBoards"] as JsonArray;
        if(boards is null||boards.Count==0){boards=new JsonArray();profile["MonitorBoards"]=boards;}
        if(boards.Count>129||boards.Any(b=>b is not JsonObject))throw new InvalidDataException("The monitor board collection is invalid. The original file is preserved.");
        foreach(var index in selected)if(!boards.OfType<JsonObject>().Any(b=>Index(b,"MonitorIndex")==index))boards.Add(new JsonObject{["MonitorIndex"]=index,["WidgetScale"]=Number(profile,"WidgetScale",1),["Zones"]=profile["Zones"]?.DeepClone()??new JsonArray()});
        var seenBoards=new HashSet<int>();var ids=new HashSet<string>();
        foreach(var board in boards.OfType<JsonObject>())
        {
            var index=Index(board,"MonitorIndex");if(!seenBoards.Add(index))throw new InvalidDataException("This profile contains duplicate monitor boards. The original file is preserved.");
            board["MonitorIndex"]=index;board["MonitorDeviceName"]=Text(board,"MonitorDeviceName");board["WidgetScale"]=Math.Clamp(Number(board,"WidgetScale",1),.75,3);
            var tiles=board["Zones"] as JsonArray??new JsonArray();if(board["Zones"] is not JsonArray)board["Zones"]=tiles;
            if(tiles.Count>20||tiles.Any(t=>t is not JsonObject))throw new InvalidDataException("This board contains an invalid tile collection. The original file is preserved.");
            if(tiles.Count==0)tiles.Add(new JsonObject{["X"]=0d,["Y"]=0d,["Width"]=1d,["Height"]=1d});
            foreach(var tile in tiles.OfType<JsonObject>())
            {
                var id=Text(tile,"Id");if(string.IsNullOrWhiteSpace(id)||!ids.Add(id)){id=Guid.NewGuid().ToString();ids.Add(id);}tile["Id"]=id;tile["Name"]=Text(tile,"Name","Untitled tile");
                var kind=Text(tile,"ContentKind","Application");tile["ContentKind"]=kind.Equals("Widget",StringComparison.OrdinalIgnoreCase)?"Widget":kind.Equals("Web",StringComparison.OrdinalIgnoreCase)?"Web":"Application";
                tile["ConstrainFullscreenToTile"]=Flag(tile,"ConstrainFullscreenToTile",false);
                foreach(var field in new[]{"WidgetId","WidgetArg","AssignedProcessName","AssignedWindowTitle","SharedWebName"})tile[field]=Text(tile,field);
                if(Text(tile,"WidgetId")=="calendar")tile["WidgetId"]="google-calendar";
                if(Text(tile,"ContentKind")!="Application"){tile["AssignedProcessName"]="";tile["AssignedWindowTitle"]="";}
                if(Flag(tile,"SharedWeb",false)&&string.IsNullOrWhiteSpace(Text(tile,"SharedWebName")))tile["SharedWebName"]="Shared";
                if(tile["Web"] is not JsonObject)tile["Web"]=new JsonObject();var web=tile["Web"]!.AsObject();
                web["ToolbarPinned"]=Flag(web,"ToolbarPinned",true);web["SelectedTabId"]=Text(web,"SelectedTabId");
                if(web["Tabs"] is not JsonArray)web["Tabs"]=new JsonArray();
                foreach(var field in new[]{"X","Y","Width","Height"})tile[field]=Number(tile,field,field is "Width" or "Height"?1:0);
            }
            if(!IsLayout(tiles.OfType<JsonObject>().ToArray()))
            {
                if(!repair)throw new InvalidDataException("Tiles must stay inside the display without overlapping.");
                if(board["OriginalGeometryV2"] is null)board["OriginalGeometryV2"]=tiles.DeepClone();
                var rows=Math.Max(1,(int)Math.Floor(Math.Sqrt(tiles.Count)));var offset=0;
                for(var row=0;row<rows;row++){var columns=(int)Math.Ceiling((tiles.Count-offset)/(double)(rows-row));for(var col=0;col<columns;col++){var tile=tiles[offset++]!.AsObject();tile["X"]=col/(double)columns;tile["Y"]=row/(double)rows;tile["Width"]=1d/columns;tile["Height"]=1d/rows;}}
                notices.Add("Display "+(index+1)+" had overlapping or out-of-bounds geometry. A filled layout is shown; its original geometry is preserved in the profile's recovery data.");
            }
        }
        if(notices.Count>0)profile["NormalizationNotice"]=string.Join(" ",notices);
        var target=boards.OfType<JsonObject>().First(b=>Index(b,"MonitorIndex")==current);profile["Zones"]=target["Zones"]!.DeepClone();profile["WidgetScale"]=target["WidgetScale"]!.DeepClone();
        return profile;
    }
    internal static bool IsLayout(JsonObject[] tiles)
    {
        if(tiles.Length is <1 or >20)return false;
        for(var i=0;i<tiles.Length;i++)
        {
            var a=tiles[i];var x=Number(a,"X",-1);var y=Number(a,"Y",-1);var w=Number(a,"Width",-1);var h=Number(a,"Height",-1);
            if(w<.025-Epsilon||h<.025-Epsilon||x< -Epsilon||y< -Epsilon||x+w>1+Epsilon||y+h>1+Epsilon)return false;
            for(var j=i+1;j<tiles.Length;j++){var b=tiles[j];var bx=Number(b,"X",-1);var by=Number(b,"Y",-1);if(Math.Min(x+w,bx+Number(b,"Width",0))-Math.Max(x,bx)>Epsilon&&Math.Min(y+h,by+Number(b,"Height",0))-Math.Max(y,by)>Epsilon)return false;}
        }
        return true;
    }
}

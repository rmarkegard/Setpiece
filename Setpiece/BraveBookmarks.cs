using Microsoft.Data.Sqlite;
using System.Text;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal static class BraveBookmarks
{
    private static readonly string[] Roots=["bookmark_bar","other","synced"];

    public static JsonObject Read(Storage storage)=>storage.ReadOptional("brave-bookmarks-v1.json");

    public static JsonObject Import(Storage storage)
    {
        var userData=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BraveSoftware","Brave-Browser","User Data");
        if(!Directory.Exists(userData))throw new InvalidOperationException("Brave user data was not found for this Windows account.");
        var items=new JsonArray();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach(var file in Directory.EnumerateDirectories(userData).Select(folder=>Path.Combine(folder,"Bookmarks")).Where(File.Exists).OrderBy(p=>p,StringComparer.OrdinalIgnoreCase))
        {
            JsonObject document;try{document=JsonNode.Parse(File.ReadAllText(file))?.AsObject()??new JsonObject();}catch(Exception error) when(error is IOException or System.Text.Json.JsonException){continue;}
            var profile=Path.GetFileName(Path.GetDirectoryName(file))??"Default";var profileItems=new List<JsonObject>();
            if(document["roots"] is JsonObject roots)foreach(var root in Roots)if(roots[root] is JsonObject node)Collect(node,"",profile,profileItems,seen);
            var icons=Favicons(Path.GetDirectoryName(file)!,profileItems.Select(i=>i["url"]!.GetValue<string>()).ToHashSet(StringComparer.OrdinalIgnoreCase));
            foreach(var item in profileItems){var url=item["url"]!.GetValue<string>();item["icon"]=icons.GetValueOrDefault(url)??Fallback(item["title"]!.GetValue<string>());items.Add(item);}
        }
        if(items.Count==0)throw new InvalidOperationException("No Brave bookmarks were found. Close Brave briefly if its profile is locked, then try again.");
        var result=new JsonObject{["imported"]=DateTimeOffset.Now.ToString("O"),["count"]=items.Count,["items"]=items};storage.SaveDocument("brave-bookmarks-v1.json",result);return result;
    }

    private static void Collect(JsonObject node,string folder,string profile,List<JsonObject> items,HashSet<string> seen)
    {
        var name=node["name"]?.GetValue<string>()??"";var type=node["type"]?.GetValue<string>()??"";
        if(type=="url")
        {
            var url=node["url"]?.GetValue<string>()??"";if(Uri.TryCreate(url,UriKind.Absolute,out var uri)&&uri.Scheme is "http" or "https")
            {
                var identity=profile+'\n'+folder+'\n'+url+'\n'+name;if(seen.Add(identity))items.Add(new JsonObject{["title"]=name,["url"]=url,["host"]=uri.Host,["folder"]=folder,["profile"]=profile});
            }
            return;
        }
        if(node["children"] is not JsonArray children)return;var next=string.IsNullOrWhiteSpace(name)?folder:string.IsNullOrWhiteSpace(folder)?name:folder+" / "+name;
        foreach(var child in children.OfType<JsonObject>())Collect(child,next,profile,items,seen);
    }

    private static Dictionary<string,string> Favicons(string profileFolder,HashSet<string> wanted)
    {
        var result=new Dictionary<string,(int Width,string Data)>(StringComparer.OrdinalIgnoreCase);var path=Path.Combine(profileFolder,"Favicons");if(!File.Exists(path))return [];
        var snapshotFolder=Path.Combine(Path.GetTempPath(),"Setpiece-Brave-Favicons-"+Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(snapshotFolder);var snapshot=Path.Combine(snapshotFolder,"Favicons");File.Copy(path,snapshot);
            if(File.Exists(path+"-wal"))File.Copy(path+"-wal",snapshot+"-wal");
            using var connection=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=snapshot,Mode=SqliteOpenMode.ReadWrite,Pooling=false,DefaultTimeout=2}.ToString());connection.Open();
            using var command=connection.CreateCommand();command.CommandText="SELECT icon_mapping.page_url, favicon_bitmaps.width, favicon_bitmaps.image_data FROM icon_mapping JOIN favicon_bitmaps ON favicon_bitmaps.icon_id=icon_mapping.icon_id WHERE length(favicon_bitmaps.image_data)>0 ORDER BY favicon_bitmaps.width DESC";
            using var reader=command.ExecuteReader();while(reader.Read()){var url=reader.GetString(0);if(!wanted.Contains(url)||result.ContainsKey(url))continue;var bytes=(byte[])reader[2];if(bytes.Length is >0 and <=1_000_000)result[url]=(reader.GetInt32(1),"data:"+Mime(bytes)+";base64,"+Convert.ToBase64String(bytes));}
        }
        catch(Exception error) when(error is IOException or SqliteException or UnauthorizedAccessException){ }
        finally{try{Directory.Delete(snapshotFolder,true);}catch(IOException){}catch(UnauthorizedAccessException){}}
        return result.ToDictionary(p=>p.Key,p=>p.Value.Data,StringComparer.OrdinalIgnoreCase);
    }

    private static string Mime(byte[] bytes)=>bytes.Length>3&&bytes[0]==0x89&&bytes[1]==0x50&&bytes[2]==0x4e&&bytes[3]==0x47?"image/png":bytes.Length>2&&bytes[0]==0xff&&bytes[1]==0xd8?"image/jpeg":"image/x-icon";
    private static string Fallback(string title)
    {
        var letter=string.IsNullOrWhiteSpace(title)?"•":System.Net.WebUtility.HtmlEncode(title.Trim()[0].ToString().ToUpperInvariant());
        var svg=$"<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><rect width='32' height='32' rx='8' fill='#6750a4'/><text x='16' y='22' text-anchor='middle' font-family='Segoe UI' font-size='17' fill='white'>{letter}</text></svg>";
        return "data:image/svg+xml;base64,"+Convert.ToBase64String(Encoding.UTF8.GetBytes(svg));
    }
}

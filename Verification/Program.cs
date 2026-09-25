using Setpiece.Rebuild;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

var root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../artifacts/verification",DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss")));
Directory.CreateDirectory(root);var store=new Storage(root);var passed=0;
void Check(bool condition,string name){if(!condition)throw new InvalidOperationException("FAIL: "+name);Console.WriteLine("PASS: "+name);passed++;}
JsonObject Profile()=>new(){["Name"]="Verification",["MonitorIndex"]=0,["CustomLegacyField"]="retained",["Zones"]=new JsonArray(new JsonObject{["Id"]="first",["X"]=0d,["Y"]=0d,["Width"]=.5,["Height"]=1d,["ContentKind"]="Application",["ConstrainFullscreenToTile"]=true},new JsonObject{["Id"]="second",["X"]=.5,["Y"]=0d,["Width"]=.5,["Height"]=1d,["ContentKind"]="Widget",["WidgetId"]="google-calendar",["AssignedProcessName"]="must-clear"})};

var profile=Storage.Normalize(Profile());var board=profile["MonitorBoards"]![0]!.AsObject();var tiles=board["Zones"]!.AsArray();
Check(ProfileRules.IsLayout(tiles.OfType<JsonObject>().ToArray()),"Legacy root zones become a filled monitor board");
Check(tiles[0]!["ConstrainFullscreenToTile"]!.GetValue<bool>(),"Tiled fullscreen preference survives normalization");
Check(tiles[1]!["AssignedProcessName"]!.GetValue<string>()==""&&tiles[1]!["WidgetId"]!.GetValue<string>()=="google-calendar","Widget identity survives and application assignment is cleared");
Check(profile["CustomLegacyField"]!.GetValue<string>()=="retained","Unknown legacy properties survive normalization");
var normalizedAgain=Storage.Normalize(profile.DeepClone().AsObject());Check(JsonNode.DeepEquals(profile,normalizedAgain),"Normalization is idempotent");
foreach(var id in ProfileRules.WallpaperIds)
{
    var wallpaperProfile=Profile();wallpaperProfile["WallpaperId"]=id;wallpaperProfile["AnimatedWallpaper"]=false;
    var wallpaperKey=store.SaveProfile(null,wallpaperProfile);
    var savedWallpaper=store.Profiles().OfType<JsonObject>().Single(p=>p["key"]!.GetValue<string>()==wallpaperKey)["profile"]!;
    Check(savedWallpaper["WallpaperId"]!.GetValue<string>()==id&&!savedWallpaper["AnimatedWallpaper"]!.GetValue<bool>(),"Wallpaper and static preference survive save/load: "+id);
    store.DeleteProfile(wallpaperKey);
}
var legacyWallpapers=new Dictionary<string,string>
{
    ["fjord-glass"]="jade-synthesis",
    ["paper-horizon"]="peach-contour",
    ["moss-geometry"]="modular-moss",
    ["blue-hour"]="glacial-diffusion",
    ["ember-grid"]="chromatic-echo",
    ["slate-dunes"]="mineral-memory",
    ["orchard-mist"]="moss-imprint",
    ["violet-current"]="violet-interference",
    ["quiet-coast"]="ceramic-resonance",
    ["mono-bloom"]="mercury-flow",
};
foreach(var (oldId,newId) in legacyWallpapers)
{
    var oldProfile=Profile();oldProfile["WallpaperId"]=oldId;oldProfile["AnimatedWallpaper"]=true;
    var migrated=Storage.Normalize(oldProfile);
    Check(migrated["WallpaperId"]!.GetValue<string>()==newId&&migrated["AnimatedWallpaper"]!.GetValue<bool>()&&migrated["CustomLegacyField"]!.GetValue<string>()=="retained","Legacy wallpaper migrates without losing preferences: "+oldId);
    Check(JsonNode.DeepEquals(migrated,Storage.Normalize(migrated.DeepClone().AsObject())),"Wallpaper migration is idempotent: "+oldId);
}
var unknownWallpaper=Profile();unknownWallpaper["WallpaperId"]="../unknown";
Check(Storage.Normalize(unknownWallpaper)["WallpaperId"]!.GetValue<string>()=="ambient","Unknown wallpaper safely falls back to Ambient");
var narrow=Storage.Normalize(new JsonObject{["Name"]="Narrow tiles",["Gap"]=40d,["OuterMargin"]=16d,["Zones"]=new JsonArray(
    new JsonObject{["X"]=0d,["Y"]=0d,["Width"]=.475,["Height"]=1d},
    new JsonObject{["X"]=.475,["Y"]=0d,["Width"]=.025,["Height"]=1d},
    new JsonObject{["X"]=.5,["Y"]=0d,["Width"]=.5,["Height"]=1d})});
var narrowBoard=narrow["MonitorBoards"]![0]!.AsObject();
var narrowBounds=narrowBoard["Zones"]!.AsArray().OfType<JsonObject>().Select(t=>WindowCoordinator.TileBounds(new System.Drawing.Rectangle(-960,0,960,600),narrow,narrowBoard,t)).ToArray();
Check(narrowBounds.All(b=>b.Width>0&&b.Height>0&&b.Left>=-944&&b.Right<=-16)&&narrowBounds[1].Left-narrowBounds[0].Right==narrowBounds[2].Left-narrowBounds[1].Right,"Large gaps keep narrow tiles positive, on display, and evenly spaced");
var noReservedHandles=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
var duplicateWindows=new JsonArray(new JsonObject{["handle"]="11",["process"]="notepad",["title"]="Untitled - Notepad"},new JsonObject{["handle"]="12",["process"]="notepad",["title"]="Untitled - Notepad"});
Check(WindowCoordinator.RestoreCandidate(duplicateWindows,"notepad","Untitled - Notepad",noReservedHandles) is null,"Duplicate same-title app windows are not restored arbitrarily");
var distinctWindows=new JsonArray(new JsonObject{["handle"]="21",["process"]="editor",["title"]="Notes.md - Editor"},new JsonObject{["handle"]="22",["process"]="editor",["title"]="Plan.md - Editor"});
Check(WindowCoordinator.RestoreCandidate(distinctWindows,"EDITOR","Plan.md - Editor",noReservedHandles)?["handle"]?.GetValue<string>()=="22","A unique saved title selects its matching app window");
var reservedExact=new HashSet<string>(StringComparer.OrdinalIgnoreCase){"21"};
Check(WindowCoordinator.RestoreCandidate(distinctWindows,"editor","Notes.md - Editor",reservedExact) is null,"Restore does not steal a window already assigned to another tile");
var changedTitle=new JsonArray(new JsonObject{["handle"]="31",["process"]="editor",["title"]="Renamed.md - Editor"});
Check(WindowCoordinator.RestoreCandidate(changedTitle,"editor","Old name.md - Editor",noReservedHandles)?["handle"]?.GetValue<string>()=="31","A single unambiguous app window can restore after its title changes");
Check(WindowCoordinator.RestoreCandidate(changedTitle,"editor","Old name.md - Editor",noReservedHandles,allowTitleFallback:false) is null,"Live profile edits do not bind to a renamed process window");
Check(WindowCoordinator.RestoreCandidate(distinctWindows,"editor","Closed.md - Editor",noReservedHandles) is null,"A changed title does not choose among multiple app windows");
var free=Profile();free["Zones"]![0]!["Width"]=.2;free["Zones"]![0]!["Y"]=.15;free["Zones"]![0]!["Height"]=.3;
var freeNormalized=Storage.Normalize(free,false);var freeTile=freeNormalized["MonitorBoards"]![0]!["Zones"]![0]!;
Check(freeTile["Width"]!.GetValue<double>()==.2&&freeTile["Y"]!.GetValue<double>()==.15&&freeNormalized["NormalizationNotice"] is null,"Intentional empty space survives native validation without repair");
var freeKey=store.SaveProfile(null,freeNormalized);var freeLoaded=store.Profiles().OfType<JsonObject>().Single(p=>p["key"]!.GetValue<string>()==freeKey);
Check(JsonNode.DeepEquals(freeLoaded["profile"],freeNormalized),"Free placement and empty space survive saving and reloading");
store.DeleteProfile(freeKey);
var malformed=Profile();malformed["Zones"]![0]!["Width"]=.7;var repaired=Storage.Normalize(malformed);
Check(repaired["MonitorBoards"]![0]!["OriginalGeometryV2"] is not null&&repaired["NormalizationNotice"] is not null,"Malformed geometry is recovered with original values and a visible notice");
var rejected=false;try{var invalid=Profile();invalid["Zones"]![0]!["Width"]=.7;Storage.Normalize(invalid,false);}catch(InvalidDataException){rejected=true;}
Check(rejected,"Invalid geometry is rejected at the native command boundary");
var oversized=Profile();oversized["Zones"]=new JsonArray(Enumerable.Range(0,21).Select(_=>(JsonNode)new JsonObject()).ToArray());rejected=false;try{Storage.Normalize(oversized);}catch(InvalidDataException){rejected=true;}
Check(rejected,"Over-20-tile files are preserved instead of silently truncating content");
var key=store.SaveProfile(null,profile);var loaded=store.Profiles().OfType<JsonObject>().Single();
Check(loaded["key"]!.GetValue<string>()==key&&JsonNode.DeepEquals(loaded["profile"],profile),"Atomic profile save/read preserves the complete document");
rejected=false;try{store.SaveProfile("../outside",profile);}catch(InvalidDataException){rejected=true;}Check(rejected,"Profile keys cannot escape the profiles directory");
store.SaveDocument("appearance-v2.json",new JsonObject{["mode"]="dark",["radius"]=24d,["uiScale"]=1.35d,["fontScale"]=1.15d,["UnknownFutureAppearance"]="preserved"});
var preferences=store.Preferences();
Check(preferences["uiScale"]?.GetValue<double>()==1.35&&preferences["fontScale"]?.GetValue<double>()==1.15,"Appearance scale preferences persist through the real storage path");
Check(preferences.Count==5&&preferences["UnknownFutureAppearance"]?.GetValue<string>()=="preserved"&&preferences["mode"]?.GetValue<string>()=="dark","Appearance writes keep unknown fields and drop nothing");
store.SaveDocument("appearance-v2.json",new JsonObject{["mode"]="dark",["radius"]=24d,["LegacyAppearanceField"]="kept"});
var legacyPreferences=store.Preferences();
Check(legacyPreferences.Count==3&&legacyPreferences["LegacyAppearanceField"]?.GetValue<string>()=="kept"&&legacyPreferences["uiScale"] is null&&legacyPreferences["fontScale"] is null,"Legacy appearance documents stay readable and verbatim, so a missing scale yields the default of one");

const string secret="synthetic-secret-not-a-real-token";store.UpdateConnections(new JsonObject{["GoogleRefreshToken"]=secret,["UnknownFutureSetting"]="preserved"});
var cipher=File.ReadAllBytes(Path.Combine(root,"connections.dat"));
Check(!Encoding.UTF8.GetString(cipher).Contains(secret,StringComparison.Ordinal),"Connection secrets are absent from ciphertext");
var independent=JsonNode.Parse(ProtectedData.Unprotect(cipher,Encoding.UTF8.GetBytes("Setpiece.WidgetConnections.v1"),DataProtectionScope.CurrentUser));
Check(independent?["GoogleRefreshToken"]?.GetValue<string>()==secret,"DPAPI store matches the legacy entropy and raw UTF-8 JSON format");
await Task.WhenAll(Enumerable.Range(0,8).Select(i=>Task.Run(()=>store.UpdateConnections(new JsonObject{["Parallel"+i]=i}))));
var merged=store.Connections();Check(Enumerable.Range(0,8).All(i=>merged["Parallel"+i]?.GetValue<int>()==i)&&merged["UnknownFutureSetting"]?.GetValue<string>()=="preserved","Concurrent connection writers merge changes without losing unknown fields");
Check(!Directory.EnumerateFiles(root,"*.tmp",SearchOption.AllDirectories).Any(),"Successful atomic writes leave no temporary files");
var damagedRoot=Path.Combine(root,"damaged");Directory.CreateDirectory(damagedRoot);var damagedFile=Path.Combine(damagedRoot,"connections.dat");var damaged=RandomNumberGenerator.GetBytes(64);File.WriteAllBytes(damagedFile,damaged);var damagedStorage=new Storage(damagedRoot);
using(var damagedProviders=new Providers(damagedStorage))
{
    var localState=await damagedProviders.Read("clock");
    Check(localState["status"]?.GetValue<string>()=="ready","Unreadable connections do not prevent local widgets from refreshing");
    var connectedState=await damagedProviders.Read("weather");
    Check(connectedState["status"]?.GetValue<string>()=="disconnected"&&connectedState["detail"]?.GetValue<string>().Contains("could not be decrypted",StringComparison.Ordinal)==true,"Unreadable connections give connected widgets a recoverable reconnect state");
}
damagedStorage.UpdateConnections(new JsonObject{["WeatherLocation"]="Oslo"});
var damagedBackup=Directory.EnumerateFiles(damagedRoot,"connections.unreadable-*.dat").Single();
Check(File.ReadAllBytes(damagedBackup).SequenceEqual(damaged)&&damagedStorage.Connections()["WeatherLocation"]?.GetValue<string>()=="Oslo","Reconnect preserves unreadable encrypted data as a backup and creates a usable store");

using var providers=new Providers(new Storage(Path.Combine(root,"services")));
foreach(var service in new[]{"weather","ruter","google-calendar","discord","spotify","bambu-lab","email"})
{var state=await providers.Read(service);Check(state["status"]?.GetValue<string>()=="disconnected",service+" has an explicit disconnected state without invented live data");}
var settings=providers.PublicSettings();Check(!settings.ContainsKey("GoogleRefreshToken")&&!settings.ContainsKey("BambuAccessCode"),"Public connection settings exclude credentials");
Console.WriteLine($"{passed} native checks passed. Test files: {root}");

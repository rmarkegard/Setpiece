using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml;
using System.Xml.Linq;

namespace Setpiece.Rebuild;

internal sealed class Providers : IDisposable
{
    private readonly Storage storage;
    private readonly HttpClient http = new() { Timeout=TimeSpan.FromSeconds(20) };
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string,(DateTimeOffset Time,JsonObject Value)> cache=new();
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string,SemaphoreSlim> gates=new();
    private readonly DeviceServices devices=new();
    public Providers(Storage storage){this.storage=storage;http.DefaultRequestHeaders.UserAgent.ParseAdd("Setpiece/2.0 (Windows workspace widget)");}
    private static string Text(JsonObject obj,string key)=>obj[key]?.GetValue<string>()??"";
    public JsonObject PublicSettings()
    {
        try
        {
            var settings=storage.Connections();var result=new JsonObject();
            foreach(var key in new[]{"WeatherLocation","WeatherLatitude","WeatherLongitude","RuterStopId","RuterStopName","NewsSource","NewsCategories","CalendarExcludedTitles","ClockTimeZones","ClockLocationLabels","DiscordServerId","DiscordClientId","BambuHost","BambuSerial","RedditCommunity","RedditClientId","GoogleClientId","SpotifyClientId","InboxProvider","CodexExecutable"})result[key]=settings[key]?.DeepClone();
            foreach(var service in new[]{"Google","Spotify","Discord","Reddit"})result[service+"Connected"]=!string.IsNullOrEmpty(Text(settings,service=="Discord"?"DiscordServerId":service+"RefreshToken"));
            result["CalendarFeedConnected"]=!string.IsNullOrEmpty(Text(settings,"CalendarFeedUrl"));result["DiscordCallConnected"]=Text(settings,"DiscordCallToken").Length>0;return result;
        }
        catch(System.Security.Cryptography.CryptographicException){return new JsonObject{["error"]="Saved connections could not be decrypted for this Windows account. The file is preserved."};}
    }
    public async Task<JsonObject> Read(string service)
    {
        var lifetime=TimeSpan.FromSeconds(service switch{"system" or "battery" or "volume"=>2,"discord" or "spotify"=>5,"bambu-lab"=>10,"ruter"=>15,"weather" or "news"=>300,"clock"=>3600,_=>30});
        if(cache.TryGetValue(service,out var old)&&DateTimeOffset.UtcNow-old.Time<lifetime)return (JsonObject)old.Value.DeepClone();
        var gate=gates.GetOrAdd(service,_=>new SemaphoreSlim(1));await gate.WaitAsync();
        try
        {
            if(cache.TryGetValue(service,out var fresh)&&DateTimeOffset.UtcNow-fresh.Time<lifetime)return (JsonObject)fresh.Value.DeepClone();
            JsonObject settings;var connectionStoreUnavailable=false;
            try{settings=storage.Connections();}
            catch(System.Security.Cryptography.CryptographicException){settings=new JsonObject();connectionStoreUnavailable=true;}
            JsonObject result;
            try
            {
                result=service switch
                {
                    "weather"=>await Weather(settings),"ruter"=>await Departures(settings),"news"=>await News(settings),"reddit"=>await Reddit(settings),"discord"=>await Discord(settings),"calendar" or "google-calendar"=>await Calendar(settings),"spotify"=>await Spotify(settings),
                    "clock"=>State("ready",DateTime.Now.ToString("HH:mm"),DateTime.Now.ToString("dddd, d MMMM"),data:new JsonObject{["zones"]=settings["ClockTimeZones"]?.DeepClone()??new JsonArray("Europe/Oslo","America/New_York"),["labels"]=settings["ClockLocationLabels"]?.DeepClone()??new JsonArray("Oslo","New York")}),
                    "battery"=>Battery(),"system"=>await SystemData(),"volume"=>DeviceServices.Volume(),"codex"=>await AiUsage.Read(http,settings),"bambu-lab"=>await PrinterService.Read(settings),"email"=>await InboxService.Read(http,storage,settings),
                    _=>State("error","Widget data is not available","Select a supported live widget from the library.")
                };
            }
            catch(HttpRequestException error){result=State(System.Net.NetworkInformation.NetworkInterface.GetIsNetworkAvailable()?"error":"offline","Unable to refresh",error.StatusCode==HttpStatusCode.Unauthorized?"Reconnect this service to renew access.":"The service is unavailable. Try again shortly.");}
            catch(TaskCanceledException){result=State("offline","Connection timed out","Try again when the service is reachable.");}
            catch(InvalidDataException error){result=State("error","Check this connection",error.Message);}
            catch(Exception error) when(error is JsonException or XmlException or FormatException or InvalidOperationException){result=State("error","Unexpected service response","The response could not be read. Try again later.");}
            catch(Exception error) when(error is IOException or System.Net.Sockets.SocketException or System.Security.Authentication.AuthenticationException){result=State("offline","Device unavailable","Check that the device is on and connected to this network.");}
            if(connectionStoreUnavailable&&result["status"]?.GetValue<string>()=="disconnected")
                result["detail"]="Saved connections could not be decrypted for this Windows account. Reconnect this service in Settings; the existing file has been preserved.";
            result["updated"]=DateTimeOffset.UtcNow.ToString("O");cache[service]=(DateTimeOffset.UtcNow,(JsonObject)result.DeepClone());result["DiscordCallConnected"]=Text(settings,"DiscordCallToken").Length>0;return result;
        }
        finally{gate.Release();}
    }
    internal static JsonObject State(string status,string title,string detail,JsonArray? items=null,JsonObject? data=null)=>new(){["status"]=status,["title"]=title,["detail"]=detail,["items"]=items??new JsonArray(),["data"]=data??new JsonObject()};
    private async Task<JsonObject> Get(string url)
    {
        using var response=await http.GetAsync(url);response.EnsureSuccessStatusCode();return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    }
    public async Task<JsonObject> Connect(JsonObject request)
    {
        var service=Text(request,"service");var changes=new JsonObject();
        switch(service)
        {
            case "weather":
                var search=await Get("https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name="+Uri.EscapeDataString(Text(request,"location")));
                var location=search["results"]?.AsArray().FirstOrDefault()?.AsObject()??throw new InvalidDataException("No matching location. Try a nearby city.");
                changes["WeatherLocation"]=location["name"]!.DeepClone();changes["WeatherLatitude"]=location["latitude"]!.DeepClone();changes["WeatherLongitude"]=location["longitude"]!.DeepClone();break;
            case "ruter":
                if(!Text(request,"stopId").StartsWith("NSR:StopPlace:",StringComparison.Ordinal))throw new InvalidDataException("Choose a stop from search results.");
                changes["RuterStopId"]=Text(request,"stopId");changes["RuterStopName"]=Text(request,"stopName");break;
            case "calendar":
                if(Text(request,"feed").Length==0&&Text(storage.Connections(),"CalendarFeedUrl").Length>0){changes["CalendarExcludedTitles"]=new JsonArray(Text(request,"exclusions").Split('\n',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Select(s=>(JsonNode)JsonValue.Create(s)!).ToArray());break;}
                if(!Uri.TryCreate(Text(request,"feed"),UriKind.Absolute,out var feed)||feed.Scheme!="https")throw new InvalidDataException("Enter the HTTPS address of your calendar feed.");
                using(var response=await http.GetAsync(feed)){response.EnsureSuccessStatusCode();var body=await response.Content.ReadAsStringAsync();if(!body.Contains("BEGIN:VCALENDAR",StringComparison.Ordinal))throw new InvalidDataException("This address did not return an iCalendar feed.");}
                changes["CalendarFeedUrl"]=feed.AbsoluteUri;changes["CalendarExcludedTitles"]=new JsonArray(Text(request,"exclusions").Split('\n',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Select(s=>(JsonNode)JsonValue.Create(s)!).ToArray());break;
            case "discord":
                if(Text(request,"discordMode")=="call"){var result=await OAuth.Connect(http,storage,"Discord",Text(request,"clientId"),Text(request,"clientSecret"));cache.TryRemove("discord",out _);return result;}
                var server=Text(request,"serverId");if(server.Length<5||!server.All(char.IsAsciiDigit))throw new InvalidDataException("Enter your Discord server ID.");
                await Get("https://discord.com/api/guilds/"+server+"/widget.json");changes["DiscordServerId"]=server;changes["DiscordCallToken"]=null;break;
            case "news":changes["NewsSource"]="VG";changes["NewsCategories"]=request["categories"]?.DeepClone()??new JsonArray();break;
            case "clock":changes["ClockTimeZones"]=request["zones"]?.DeepClone()??new JsonArray("UTC");changes["ClockLocationLabels"]=request["zoneLabels"]?.DeepClone()??new JsonArray("UTC");break;
            case "reddit":var community=Text(request,"community");if(community.Length==0||!community.All(c=>char.IsAsciiLetterOrDigit(c)||c=='_'))throw new InvalidDataException("Enter a subreddit name using letters, numbers or underscores.");changes["RedditCommunity"]=community;if(Text(request,"clientId").Length>0){await OAuth.Connect(http,storage,"Reddit",Text(request,"clientId"),"");}break;
            case "bambu-lab":changes=await PrinterService.Connect(request);break;
            case "email":var provider=Text(request,"provider");if(provider is not ("google" or "outlook"))throw new InvalidDataException("Choose Google or Outlook.");changes["InboxProvider"]=provider;break;
            case "codex":var path=Text(request,"executable");if(path.Length>0&&(!File.Exists(path)||!Path.GetExtension(path).Equals(".exe",StringComparison.OrdinalIgnoreCase)))throw new InvalidDataException("Choose the installed codex.exe file.");changes["CodexExecutable"]=path;break;
            case "system":devices.StartSensors(true);cache.TryRemove("system",out _);return State("ready","Collector requested","Allow the Windows prompt to enable supported temperature sensors.");
            case "google":return await OAuth.Connect(http,storage,"Google",Text(request,"clientId"),Text(request,"clientSecret"));
            case "spotify":return await OAuth.Connect(http,storage,"Spotify",Text(request,"clientId"),"");
            default:throw new InvalidDataException("Choose a supported connection.");
        }
        storage.UpdateConnections(changes);cache.TryRemove(service,out _);return await Read(service);
    }
    private async Task<JsonObject> Weather(JsonObject settings)
    {
        if(settings["WeatherLatitude"] is null||settings["WeatherLongitude"] is null)return State("disconnected","Your local forecast","Choose your location in Connections.");
        var lat=settings["WeatherLatitude"]!.GetValue<double>().ToString(CultureInfo.InvariantCulture);var lon=settings["WeatherLongitude"]!.GetValue<double>().ToString(CultureInfo.InvariantCulture);
        var data=await Get($"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability&forecast_days=2&timezone=auto");
        var current=data["current"]!.AsObject();var temp=current["temperature_2m"]!.GetValue<double>();var items=new JsonArray();var hours=data["hourly"]!;var locationNow=DateTime.UtcNow.AddSeconds(data["utc_offset_seconds"]?.GetValue<int>()??0);
        for(var i=0;i<hours["time"]!.AsArray().Count;i++){var time=hours["time"]![i]!.GetValue<string>();if(DateTime.Parse(time)<locationNow.AddMinutes(-locationNow.Minute))continue;items.Add(new JsonObject{["title"]=DateTime.Parse(time).ToString("HH:mm"),["detail"]=hours["temperature_2m"]![i]+"° · "+hours["precipitation_probability"]![i]+"% rain"});if(items.Count==5)break;}
        return State("ready",$"{temp:0}°",Text(settings,"WeatherLocation"),items,new JsonObject{["feelsLike"]=current["apparent_temperature"]!.DeepClone(),["wind"]=current["wind_speed_10m"]!.DeepClone(),["code"]=current["weather_code"]!.DeepClone(),["source"]="Open-Meteo"});
    }
    public async Task<JsonArray> SearchStops(string query)
    {
        if(query.Trim().Length<2)return new JsonArray();
        using var request=new HttpRequestMessage(HttpMethod.Get,"https://api.entur.io/geocoder/v1/autocomplete?lang=no&size=10&text="+Uri.EscapeDataString(query));request.Headers.Add("ET-Client-Name","setpiece-workspace");using var response=await http.SendAsync(request);response.EnsureSuccessStatusCode();
        var root=JsonNode.Parse(await response.Content.ReadAsStringAsync())!;var result=new JsonArray();
        foreach(var feature in root["features"]!.AsArray()){var p=feature!["properties"]!;var id=p["id"]?.GetValue<string>()??"";if(id.StartsWith("NSR:StopPlace:",StringComparison.Ordinal))result.Add(new JsonObject{["id"]=id,["name"]=p["name"]?.DeepClone(),["label"]=p["label"]?.DeepClone()});}return result;
    }
    private async Task<JsonObject> Departures(JsonObject settings)
    {
        var stop=Text(settings,"RuterStopId");if(stop.Length==0)return State("disconnected","Where are you headed?","Find your stop in Connections.");
        const string query="query Departures($stop: String!) { stopPlace(id: $stop) { name estimatedCalls(numberOfDepartures: 8, timeRange: 7200) { expectedDepartureTime destinationDisplay { frontText } serviceJourney { line { publicCode } } } } }";
        using var request=new HttpRequestMessage(HttpMethod.Post,"https://api.entur.io/journey-planner/v3/graphql"){Content=new StringContent(new JsonObject{["query"]=query,["variables"]=new JsonObject{["stop"]=stop}}.ToJsonString(),Encoding.UTF8,"application/json")};request.Headers.Add("ET-Client-Name","setpiece-workspace");
        using var response=await http.SendAsync(request);response.EnsureSuccessStatusCode();var data=JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        var place=data["data"]?["stopPlace"]??throw new InvalidDataException("Stop not found.");var items=new JsonArray();
        foreach(var departure in place["estimatedCalls"]!.AsArray()){var minutes=Math.Max(0,(int)Math.Ceiling((DateTimeOffset.Parse(departure!["expectedDepartureTime"]!.GetValue<string>())-DateTimeOffset.Now).TotalMinutes));items.Add(new JsonObject{["title"]=departure["serviceJourney"]!["line"]!["publicCode"]+" · "+departure["destinationDisplay"]!["frontText"],["detail"]=minutes==0?"Now":minutes+" min"});}
        return State(items.Count==0?"empty":"ready",place["name"]!.GetValue<string>(),items.Count==0?"No departures in the next two hours.":"Live departures · Entur",items);
    }
    private async Task<JsonObject> News(JsonObject settings)
    {
        using var response=await http.GetAsync("https://www.vg.no/rss/feed/?format=rss");response.EnsureSuccessStatusCode();using var stream=await response.Content.ReadAsStreamAsync();using var reader=XmlReader.Create(stream,new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null});var document=XDocument.Load(reader);
        var filters=settings["NewsCategories"]?.AsArray().Select(n=>n!.GetValue<string>()).ToArray()??[];var items=new JsonArray();
        foreach(var item in document.Descendants("item").Where(i=>filters.Length==0||i.Elements("category").Any(c=>filters.Contains(c.Value,StringComparer.OrdinalIgnoreCase))).Take(8))items.Add(new JsonObject{["title"]=item.Element("title")?.Value??"VG",["detail"]=System.Text.RegularExpressions.Regex.Replace(WebUtility.HtmlDecode(item.Element("description")?.Value??""),"<[^>]+>",""),["url"]=item.Element("link")?.Value??"https://www.vg.no"});
        return State(items.Count==0?"empty":"ready","The latest from VG",items.Count==0?"No stories match your selected categories.":"Headlines from Norway",items);
    }
    private async Task<JsonObject> Reddit(JsonObject settings)
    {
        var community=Text(settings,"RedditCommunity");if(community.Length==0)community="technology";
        var authenticated=Text(settings,"RedditRefreshToken").Length>0;
        using var request=new HttpRequestMessage(HttpMethod.Get,(authenticated?"https://oauth.reddit.com":"https://www.reddit.com")+"/r/"+Uri.EscapeDataString(community)+"/hot"+(authenticated?"":".json")+"?limit=8");
        if(authenticated)request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",await OAuth.Token(http,storage,"Reddit",settings));
        using var response=await http.SendAsync(request);
        if(!authenticated&&response.StatusCode==HttpStatusCode.Forbidden)return State("disconnected","Connect Reddit","Reddit requires authorization on this network. Add your installed-app client ID in Connections.");
        response.EnsureSuccessStatusCode();var data=JsonNode.Parse(await response.Content.ReadAsStringAsync())!;var items=new JsonArray();
        foreach(var child in data["data"]!["children"]!.AsArray()){var post=child!["data"]!;items.Add(new JsonObject{["title"]=post["title"]!.DeepClone(),["detail"]=post["score"]+" points · "+post["num_comments"]+" comments",["url"]="https://www.reddit.com"+post["permalink"]});}return State("ready","r/"+community,"Hot conversations",items);
    }
    private async Task<JsonObject> Discord(JsonObject settings)
    {
        if(Text(settings,"DiscordCallToken").Length>0)return await ReadVoice(settings);
        var server=Text(settings,"DiscordServerId");if(server.Length==0)return State("disconnected","A place for your people","Connect a server with its widget enabled.");var data=await Get("https://discord.com/api/guilds/"+Uri.EscapeDataString(server)+"/widget.json");
        var items=new JsonArray();foreach(var member in data["members"]!.AsArray().Take(6))items.Add(new JsonObject{["title"]=member!["username"]!.DeepClone(),["detail"]=member["status"]?.DeepClone()});return State("ready",data["name"]!.GetValue<string>(),data["presence_count"]+" members online",items);
    }
    private async Task<JsonObject> Calendar(JsonObject settings)
    {
        var feed=Text(settings,"CalendarFeedUrl");var excluded=settings["CalendarExcludedTitles"]?.AsArray().Select(n=>n!.GetValue<string>()).ToArray()??[];var items=new JsonArray();
        if(feed.Length>0)
        {
            var calendar=Ical.Net.Calendar.Load(await http.GetStringAsync(feed))??throw new InvalidDataException("Empty calendar.");var now=DateTime.UtcNow;
            foreach(var occurrence in calendar.GetOccurrences(new Ical.Net.DataTypes.CalDateTime(now)).TakeWhile(o=>o.Period.StartTime.AsUtc<now.AddMonths(6)))
            {
                if(occurrence.Source is not Ical.Net.CalendarComponents.CalendarEvent entry||excluded.Any(t=>(entry.Summary??"").Contains(t,StringComparison.OrdinalIgnoreCase)))continue;
                items.Add(new JsonObject{["title"]=entry.Summary??"Untitled event",["detail"]=occurrence.Period.StartTime.AsUtc.ToLocalTime().ToString("ddd HH:mm")+" · "+entry.Location});if(items.Count>=50)break;
            }
        }
        else
        {
            if(Text(settings,"GoogleRefreshToken").Length==0)return State("disconnected","Make time for what matters","Connect Google or add a calendar feed.");
            var token=await OAuth.Token(http,storage,"Google",settings);
            var from=DateTimeOffset.UtcNow;var through=from.AddMonths(6);
            using var request=new HttpRequestMessage(HttpMethod.Get,"https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin="+Uri.EscapeDataString(from.ToString("O"))+"&timeMax="+Uri.EscapeDataString(through.ToString("O")));request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);using var response=await http.SendAsync(request);response.EnsureSuccessStatusCode();var data=JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
            foreach(var item in data["items"]!.AsArray()){var title=item!["summary"]?.GetValue<string>()??"Untitled event";if(excluded.Any(t=>title.Contains(t,StringComparison.OrdinalIgnoreCase)))continue;items.Add(new JsonObject{["title"]=title,["detail"]=item["start"]?["dateTime"]?.GetValue<string>()??item["start"]?["date"]?.GetValue<string>()??"All day"});if(items.Count>=50)break;}
        }
        return State(items.Count==0?"empty":"ready","Your next 6 months",items.Count==0?"Your calendar is clear.":"Upcoming events",items);
    }
    private async Task<JsonObject> Spotify(JsonObject settings)
    {
        if(Text(settings,"SpotifyRefreshToken").Length==0)return State("disconnected","Find your soundtrack","Connect Spotify to see what's playing.");var token=await OAuth.Token(http,storage,"Spotify",settings);
        using var request=new HttpRequestMessage(HttpMethod.Get,"https://api.spotify.com/v1/me/player");request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);using var response=await http.SendAsync(request);
        if(response.StatusCode==HttpStatusCode.NoContent)return State("empty","Nothing playing yet","Start something in Spotify.");response.EnsureSuccessStatusCode();var data=JsonNode.Parse(await response.Content.ReadAsStringAsync())!;var item=data["item"];
        if(item is null)return State("empty","Nothing playing yet","Start something in Spotify.");return State("ready",item["name"]!.GetValue<string>(),string.Join(", ",item["artists"]?.AsArray().Select(a=>a!["name"]!.GetValue<string>())??[]),data:new JsonObject{["playing"]=data["is_playing"]?.DeepClone(),["progress"]=data["progress_ms"]?.DeepClone(),["duration"]=item["duration_ms"]?.DeepClone(),["image"]=item["album"]?["images"]?.AsArray().FirstOrDefault()?["url"]?.DeepClone()});
    }
    [StructLayout(LayoutKind.Sequential)] private struct Memory {public uint Length,Load;public ulong Total,Available,PageTotal,PageAvailable,VirtualTotal,VirtualAvailable,Extended;}
    [DllImport("kernel32.dll")] private static extern bool GlobalMemoryStatusEx(ref Memory value);
    [DllImport("kernel32.dll")] private static extern bool GetSystemTimes(out long idle,out long kernel,out long user);
    private long priorIdle,priorTotal;
    private async Task<JsonObject> SystemData()
    {
        var memory=new Memory{Length=(uint)Marshal.SizeOf<Memory>()};GlobalMemoryStatusEx(ref memory);GetSystemTimes(out var idle,out var kernel,out var user);if(priorTotal==0){priorIdle=idle;priorTotal=kernel+user;await Task.Delay(200);GetSystemTimes(out idle,out kernel,out user);}var total=kernel+user;var delta=total-priorTotal;var cpu=priorTotal==0?0:100d*(1d-(idle-priorIdle)/(double)Math.Max(1,delta));priorIdle=idle;priorTotal=total;
        var data=new JsonObject{["cpu"]=Math.Clamp(cpu,0,100),["memory"]=memory.Load,["usedGb"]=(memory.Total-memory.Available)/1073741824d,["totalGb"]=memory.Total/1073741824d};
        foreach(var pair in devices.Network())data[pair.Key]=pair.Value?.DeepClone();foreach(var pair in await devices.Sensors())data[pair.Key]=pair.Value?.DeepClone();
        return State("ready",$"{cpu:0}% CPU",$"{data["usedGb"]!.GetValue<double>():0.0} / {data["totalGb"]!.GetValue<double>():0.0} GB memory",data:data);
    }
    private static JsonObject Battery()
    {
        var status=SystemInformation.PowerStatus;
        if(status.BatteryChargeStatus.HasFlag(BatteryChargeStatus.NoSystemBattery))return State("empty","Plugged into your workspace","No battery is installed on this device.");
        return State("ready",$"{status.BatteryLifePercent*100:0}%",status.PowerLineStatus==PowerLineStatus.Online?"Connected to power":status.BatteryLifeRemaining<0?"On battery · time estimate unavailable":$"{status.BatteryLifeRemaining/3600}h {status.BatteryLifeRemaining%3600/60}m remaining",data:new JsonObject{["level"]=status.BatteryLifePercent*100});
    }
    public JsonObject SetVolume(JsonObject request){cache.TryRemove("volume",out _);return DeviceServices.Volume(request["level"]?.GetValue<double>(),request["muted"]?.GetValue<bool>());}
    private async Task<JsonObject> ReadVoice(JsonObject settings,JsonObject? changes=null)
    {
        var token=Text(settings,"DiscordRefreshToken").Length>0?await OAuth.Token(http,storage,"Discord",settings):Text(settings,"DiscordCallToken");
        await using var session=await DiscordVoice.Session(Text(settings,"DiscordClientId"),token);return await session.Snapshot(changes);
    }
    public async Task<JsonArray> SearchTimezones(string query)
    {
        if(query.Trim().Length<2)return new JsonArray();
        var root=await Get("https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&name="+Uri.EscapeDataString(query));var result=new JsonArray();
        foreach(var place in root["results"]?.AsArray()??[])
        {
            var zone=place?["timezone"]?.GetValue<string>();var name=place?["name"]?.GetValue<string>();if(string.IsNullOrWhiteSpace(zone)||string.IsNullOrWhiteSpace(name))continue;
            var region=place?["admin1"]?.GetValue<string>();var country=place?["country"]?.GetValue<string>();
            result.Add(new JsonObject{["name"]=name,["timezone"]=zone,["label"]=string.Join(", ",new[]{name,region,country}.Where(s=>!string.IsNullOrWhiteSpace(s)).Distinct(StringComparer.OrdinalIgnoreCase))});
        }
        return result;
    }
    public async Task<JsonObject> VoiceControl(JsonObject request)
    {
        var changes=new JsonObject();if(request["muted"] is not null)changes["mute"]=request["muted"]!.DeepClone();if(request["deafened"] is not null)changes["deaf"]=request["deafened"]!.DeepClone();
        var result=await ReadVoice(storage.Connections(),changes);cache.TryRemove("discord",out _);return result;
    }
    public async Task<JsonObject> Playback(JsonObject request)
    {
        var action=Text(request,"action");if(action is not ("play" or "pause" or "next" or "previous"))throw new InvalidDataException("Choose a supported playback action.");
        var settings=storage.Connections();var token=await OAuth.Token(http,storage,"Spotify",settings);
        using var message=new HttpRequestMessage(action is "next" or "previous"?HttpMethod.Post:HttpMethod.Put,"https://api.spotify.com/v1/me/player/"+action);message.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
        using var response=await http.SendAsync(message);
        if(response.StatusCode==HttpStatusCode.Forbidden)throw new InvalidDataException("Playback control needs Spotify Premium and playback permission. Reconnect Spotify if permission has changed.");
        if(response.StatusCode==HttpStatusCode.NotFound)throw new InvalidDataException("Start Spotify on a device before controlling playback.");
        response.EnsureSuccessStatusCode();cache.TryRemove("spotify",out _);await Task.Delay(300);return await Read("spotify");
    }
    public void Disconnect(string service)
    {
        var fields=service switch{
            "google"=>new[]{"GoogleAccessToken","GoogleRefreshToken","GoogleExpiresAt"},
            "spotify"=>["SpotifyAccessToken","SpotifyRefreshToken","SpotifyExpiresAt"],
            "reddit"=>["RedditAccessToken","RedditRefreshToken","RedditExpiresAt"],
            "calendar"=>["CalendarFeedUrl"],"discord"=>["DiscordServerId","DiscordCallToken","DiscordAccessToken","DiscordRefreshToken","DiscordExpiresAt"],"weather"=>["WeatherLatitude","WeatherLongitude","WeatherLocation"],
            "ruter"=>["RuterStopId","RuterStopName"],"bambu-lab"=>["BambuHost","BambuAccessCode","BambuCertificateSha256","BambuCameraCertificateSha256"],"email"=>["InboxProvider"],
            _=>Array.Empty<string>()};
        var changes=new JsonObject();foreach(var field in fields)changes[field]=null;storage.UpdateConnections(changes);cache.Clear();
    }
    public void Dispose(){http.Dispose();devices.Dispose();foreach(var gate in gates.Values)gate.Dispose();}
}

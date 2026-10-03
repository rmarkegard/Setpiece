using System.Net.WebSockets;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

/// <summary>
/// Reads one Twitch channel's chat: anonymously, the way a logged-out viewer does, or signed in as you,
/// which also lets you send messages. The widget polls <see cref="Snapshot"/>, and <see cref="Changed"/> tells it the moment new lines
/// arrive; the connection closes itself once nobody asks. The channel's 7TV emotes (and 7TV's global set)
/// are shown alongside Twitch's own.
/// </summary>
internal sealed class TwitchChat : IDisposable
{
    private const int Keep=60;
    private static readonly TimeSpan Idle=TimeSpan.FromSeconds(45);
    private readonly object gate=new();
    private readonly List<JsonObject> messages=[];
    private CancellationTokenSource? run;
    private string channel="";
    private DateTimeOffset lastAsked=DateTimeOffset.UtcNow;
    private volatile bool connected;
    /** 7TV emote names and their image addresses: the global set, overlaid by the channel's own. */
    private volatile IReadOnlyDictionary<string,string> sevenTv=new Dictionary<string,string>();
    private string roomId="";
    private int pushPending;
    private static readonly HttpClient web=CreateClient();
    private static IReadOnlyDictionary<string,string>? sevenTvGlobal;
    /** The account chat is read as ("" when anonymous). Changing it reconnects. */
    private string identity="";
    private ClientWebSocket? socket;
    private readonly SemaphoreSlim sendGate=new(1);
    private volatile bool authenticated;
    private volatile bool authFailed;
    /** Your own name, colour and badges in this channel, as Twitch last told us (USERSTATE). */
    private Dictionary<string,string> self=[];

    public bool Connected=>connected;
    /** Signed in and joined: messages can be sent. */
    public bool CanSend=>connected&&authenticated;
    /** Twitch refused the saved sign-in, even after a refresh: chat fell back to reading anonymously. */
    public bool AuthFailed=>authFailed;
    /** Supplies the account to sign in with; refresh asks for a new token because the last one was refused. */
    public Func<bool,Task<(string Login,string Token)?>>? Credentials{get;set;}
    /** New lines arrived. Raised at most four times a second, so a busy chat redraws the desk in batches. */
    public event Action? Changed;

    /** Starts following a channel (or keeps following it) and marks the chat as wanted. */
    public void Follow(string name,string account="")
    {
        lastAsked=DateTimeOffset.UtcNow;
        lock(gate)
        {
            if(run is not null&&!run.IsCancellationRequested&&channel==name&&identity==account)return;
            var sameChannel=channel==name;
            run?.Cancel();if(!sameChannel){messages.Clear();roomId="";sevenTv=new Dictionary<string,string>();}
            connected=false;authenticated=false;authFailed=false;channel=name;identity=account;
            run=new CancellationTokenSource();var token=run.Token;
            _=Task.Run(()=>Loop(name,token));
        }
    }

    public JsonArray Snapshot(int limit)
    {
        lastAsked=DateTimeOffset.UtcNow;
        lock(gate)return new JsonArray(messages.Skip(Math.Max(0,messages.Count-limit)).Select(m=>(JsonNode)m.DeepClone()).ToArray());
    }

    public void Dispose(){lock(gate){run?.Cancel();run=null;}}

    private async Task Loop(string name,CancellationToken token)
    {
        var wait=TimeSpan.FromSeconds(2);
        while(!token.IsCancellationRequested&&DateTimeOffset.UtcNow-lastAsked<Idle)
        {
            try{await Session(name,token);wait=TimeSpan.FromSeconds(2);}
            catch(Exception error) when(error is WebSocketException or IOException or OperationCanceledException or ObjectDisposedException){}
            connected=false;
            try{await Task.Delay(wait,token);}catch(OperationCanceledException){break;}
            wait=TimeSpan.FromSeconds(Math.Min(30,wait.TotalSeconds*2));
        }
        lock(gate){if(run is not null&&run.Token==token){run.Dispose();run=null;channel="";}}
    }

    private async Task Session(string name,CancellationToken token)
    {
        // Signed in when an account is set and Twitch has not refused it; otherwise an anonymous reader.
        (string Login,string Token)? account=null;
        if(identity.Length>0&&Credentials is not null){try{account=await Credentials(authFailed);}catch(Exception error) when(error is HttpRequestException or InvalidDataException or TaskCanceledException){account=null;}}
        if(identity.Length>0&&account is null)authFailed=true;
        using var socket=new ClientWebSocket();
        await socket.ConnectAsync(new Uri("wss://irc-ws.chat.twitch.tv:443"),token);
        this.socket=socket;authenticated=false;
        var login=account is { } a?new[]{"PASS oauth:"+a.Token,"NICK "+a.Login}:new[]{"PASS SCHMOOPIIE","NICK justinfan"+Random.Shared.Next(10000,99999)};
        foreach(var line in new[]{"CAP REQ :twitch.tv/tags twitch.tv/commands"}.Concat(login).Append("JOIN #"+name))await Send(socket,line,token);
        var buffer=new byte[16384];var text=new StringBuilder();
        while(socket.State==WebSocketState.Open&&!token.IsCancellationRequested&&DateTimeOffset.UtcNow-lastAsked<Idle)
        {
            using var limit=CancellationTokenSource.CreateLinkedTokenSource(token);limit.CancelAfter(TimeSpan.FromSeconds(30));
            WebSocketReceiveResult result;
            try{result=await socket.ReceiveAsync(buffer,limit.Token);}
            catch(OperationCanceledException) when(!token.IsCancellationRequested){return;}
            if(result.MessageType==WebSocketMessageType.Close)return;
            text.Append(Encoding.UTF8.GetString(buffer,0,result.Count));
            if(!result.EndOfMessage)continue;
            foreach(var line in text.ToString().Split("\r\n",StringSplitOptions.RemoveEmptyEntries))await Handle(socket,line,token);
            text.Clear();
        }
    }

    private async Task Send(ClientWebSocket socket,string line,CancellationToken token)
    {
        // A WebSocket takes one send at a time: your message and a PONG must not collide.
        await sendGate.WaitAsync(token);
        try{await socket.SendAsync(Encoding.UTF8.GetBytes(line+"\r\n"),WebSocketMessageType.Text,true,token);}
        finally{sendGate.Release();}
    }

    /** Sends a message to the channel as you, and shows it right away (Twitch does not echo your own lines). */
    public async Task Say(string text)
    {
        text=text.Replace('\r',' ').Replace('\n',' ').Trim();
        if(text.Length==0)return;
        if(text.Length>500)throw new InvalidDataException("Twitch messages are at most 500 characters.");
        if(!CanSend||socket is not { State: WebSocketState.Open } open)throw new InvalidOperationException(identity.Length==0?"Sign in to Twitch in the widget settings to chat.":"Chat is reconnecting. Try again in a moment.");
        using var limit=new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await Send(open,"PRIVMSG #"+channel+" :"+text,limit.Token);
        var tags=new Dictionary<string,string>(self){["id"]=Guid.NewGuid().ToString("N")};
        if(Item(new Line(tags,identity,"PRIVMSG","#"+channel+" :"+text),sevenTv) is { } item){item["self"]=true;Add(item);}
    }

    private void Add(JsonObject item)
    {
        lock(gate){messages.Add(item);if(messages.Count>Keep)messages.RemoveRange(0,messages.Count-Keep);}
        Push();
    }

    private async Task Handle(ClientWebSocket socket,string line,CancellationToken token)
    {
        if(line.StartsWith("PING",StringComparison.Ordinal)){await Send(socket,"PONG"+line[4..],token);return;}
        var message=Parse(line);if(message is null)return;
        if(message.Value.Command=="001"||message.Value.Command=="JOIN"){connected=true;return;}
        // Signed in: Twitch confirms the account (GLOBALUSERSTATE) and says how you look in this channel (USERSTATE).
        if(message.Value.Command is "GLOBALUSERSTATE" or "USERSTATE"){if(identity.Length>0){authenticated=true;authFailed=false;self=message.Value.Tags;}return;}
        if(message.Value.Command=="NOTICE")
        {
            var notice=message.Value.Rest[(message.Value.Rest.IndexOf(" :",StringComparison.Ordinal) is var at and >=0?at+2:0)..];
            // A refused sign-in: read anonymously from now on, and ask for a fresh token on the next connection.
            if(notice.Contains("authentication failed",StringComparison.OrdinalIgnoreCase)||notice.Contains("Improperly formatted auth",StringComparison.OrdinalIgnoreCase)){authFailed=true;throw new IOException("Twitch refused the sign-in.");}
            Add(new JsonObject{["title"]="",["detail"]=notice,["id"]=Guid.NewGuid().ToString("N"),["system"]=true,["parts"]=new JsonArray(new JsonObject{["t"]=notice})});
            return;
        }
        // ROOMSTATE names the channel's Twitch ID, which is how 7TV finds its emotes.
        if(message.Value.Command=="ROOMSTATE"&&message.Value.Tags.GetValueOrDefault("room-id") is {Length:>0} room&&room!=roomId){roomId=room;_=LoadSevenTv(room,token);return;}
        if(message.Value.Command!="PRIVMSG")return;
        var item=Item(message.Value,sevenTv);if(item is null)return;
        Add(item);
    }

    private void Push()
    {
        if(Interlocked.Exchange(ref pushPending,1)==1)return;
        _=Task.Delay(250).ContinueWith(_=>{Volatile.Write(ref pushPending,0);Changed?.Invoke();},TaskScheduler.Default);
    }

    private static HttpClient CreateClient()
    {
        var client=new HttpClient{Timeout=TimeSpan.FromSeconds(10)};
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Setpiece","2.0"));
        return client;
    }

    /** Loads 7TV's global emotes (once) and this channel's set. Without 7TV, chat simply shows Twitch's own emotes. */
    private async Task LoadSevenTv(string room,CancellationToken token)
    {
        try
        {
            sevenTvGlobal??=SevenTvSet(JsonNode.Parse(await web.GetStringAsync("https://7tv.io/v3/emote-sets/global",token)));
            var merged=new Dictionary<string,string>(sevenTvGlobal,StringComparer.Ordinal);
            using var response=await web.GetAsync("https://7tv.io/v3/users/twitch/"+Uri.EscapeDataString(room),token);
            // A channel without a 7TV account answers 404: it still gets the global emotes.
            if(response.IsSuccessStatusCode)foreach(var (name,url) in SevenTvSet(JsonNode.Parse(await response.Content.ReadAsStringAsync(token))?["emote_set"]))merged[name]=url;
            if(roomId==room)sevenTv=merged;
        }
        catch(Exception error) when(error is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException or InvalidOperationException){}
    }

    /**
     * A 7TV emote set as name → image. Animated emotes are shown still (their first frame): an animated
     * image redraws the whole desk on every frame, which is what made browser video hitch.
     */
    internal static IReadOnlyDictionary<string,string> SevenTvSet(JsonNode? set)
    {
        var result=new Dictionary<string,string>(StringComparer.Ordinal);
        foreach(var emote in set?["emotes"]?.AsArray().OfType<JsonObject>()??[])
        {
            var name=emote["name"]?.GetValue<string>();var host=emote["data"]?["host"]?["url"]?.GetValue<string>();
            if(string.IsNullOrWhiteSpace(name)||string.IsNullOrWhiteSpace(host)||name.Any(char.IsWhiteSpace))continue;
            if(!Uri.TryCreate("https:"+host+"/2x_static.webp",UriKind.Absolute,out var image)||image.Host!="cdn.7tv.app")continue;
            result[name]=image.AbsoluteUri;
        }
        return result;
    }

    internal readonly record struct Line(Dictionary<string,string> Tags,string Nick,string Command,string Rest);

    /** One IRC line: optional @tags, optional :prefix, a command, then its parameters. */
    internal static Line? Parse(string line)
    {
        var tags=new Dictionary<string,string>();var rest=line;
        if(rest.StartsWith('@'))
        {
            var end=rest.IndexOf(' ');if(end<0)return null;
            foreach(var pair in rest[1..end].Split(';')){var eq=pair.IndexOf('=');if(eq>0)tags[pair[..eq]]=pair[(eq+1)..];}
            rest=rest[(end+1)..];
        }
        var nick="";
        if(rest.StartsWith(':'))
        {
            var end=rest.IndexOf(' ');if(end<0)return null;
            var prefix=rest[1..end];var bang=prefix.IndexOf('!');nick=bang>0?prefix[..bang]:prefix;rest=rest[(end+1)..];
        }
        var space=rest.IndexOf(' ');
        return space<0?new Line(tags,nick,rest,""):new Line(tags,nick,rest[..space],rest[(space+1)..]);
    }

    /** A chat line as a widget item: who, what, their name colour, and the text split around its emotes. */
    internal static JsonObject? Item(Line message,IReadOnlyDictionary<string,string>? extra=null)
    {
        var colon=message.Rest.IndexOf(" :",StringComparison.Ordinal);if(colon<0)return null;
        var body=message.Rest[(colon+2)..];var action=false;
        if(body.StartsWith("\u0001ACTION ",StringComparison.Ordinal)&&body.EndsWith('\u0001')){action=true;body=body[8..^1];}
        var name=message.Tags.GetValueOrDefault("display-name");if(string.IsNullOrWhiteSpace(name))name=message.Nick;
        var color=message.Tags.GetValueOrDefault("color")??"";if(color.Length!=7||color[0]!='#'||!color.Skip(1).All(Uri.IsHexDigit))color="";
        var badges=new JsonArray();
        foreach(var badge in (message.Tags.GetValueOrDefault("badges")??"").Split(',',StringSplitOptions.RemoveEmptyEntries))
        {
            var kind=badge.Split('/')[0];if(kind is "broadcaster" or "moderator" or "vip" or "subscriber" or "founder")badges.Add(kind);
        }
        return new JsonObject
        {
            ["title"]=name,["detail"]=body,["id"]=message.Tags.GetValueOrDefault("id")??Guid.NewGuid().ToString("N"),
            ["color"]=color,["action"]=action,["badges"]=badges,["parts"]=Parts(body,message.Tags.GetValueOrDefault("emotes")??"",extra)
        };
    }

    /** The message as text and emote pieces. Twitch counts positions in characters, not UTF-16 units. */
    internal static JsonArray Parts(string body,string emotes,IReadOnlyDictionary<string,string>? extra=null)
    {
        var runes=body.EnumerateRunes().Select(r=>r.ToString()).ToArray();var spans=new List<(int Start,int End,string Id)>();
        foreach(var emote in emotes.Split('/',StringSplitOptions.RemoveEmptyEntries))
        {
            var split=emote.Split(':');if(split.Length!=2||split[0].Length==0||!split[0].All(c=>char.IsAsciiLetterOrDigit(c)||c=='_'))continue;
            foreach(var range in split[1].Split(','))
            {
                var ends=range.Split('-');
                if(ends.Length==2&&int.TryParse(ends[0],out var start)&&int.TryParse(ends[1],out var end)&&start>=0&&end>=start&&end<runes.Length)spans.Add((start,end,split[0]));
            }
        }
        var parts=new JsonArray();var at=0;
        foreach(var span in spans.OrderBy(s=>s.Start))
        {
            if(span.Start<at)continue;
            if(span.Start>at)parts.Add(new JsonObject{["t"]=string.Concat(runes[at..span.Start])});
            parts.Add(new JsonObject{["e"]="https://static-cdn.jtvnw.net/emoticons/v2/"+span.Id+"/static/dark/1.0",["t"]=string.Concat(runes[span.Start..(span.End+1)])});
            at=span.End+1;
        }
        if(at<runes.Length)parts.Add(new JsonObject{["t"]=string.Concat(runes[at..])});
        return extra is {Count:>0}?WithWords(parts,extra):parts;
    }

    /** Splits the text pieces around whole words that name a 7TV emote. */
    private static JsonArray WithWords(JsonArray parts,IReadOnlyDictionary<string,string> extra)
    {
        var result=new JsonArray();var text=new StringBuilder();
        void Flush(){if(text.Length>0){result.Add(new JsonObject{["t"]=text.ToString()});text.Clear();}}
        foreach(var part in parts.OfType<JsonObject>())
        {
            if(part["e"] is not null){Flush();result.Add(part.DeepClone());continue;}
            foreach(var token in System.Text.RegularExpressions.Regex.Split(part["t"]!.GetValue<string>(),@"(\s+)"))
            {
                if(token.Length>0&&extra.TryGetValue(token,out var url)){Flush();result.Add(new JsonObject{["e"]=url,["t"]=token});}
                else text.Append(token);
            }
        }
        Flush();return result;
    }
}

/// <summary>
/// Signs in to Twitch with the device flow: Twitch shows a short code in the browser, you approve it, and
/// Setpiece receives a token for chat. It needs only the client ID of a "Public" application you register,
/// no secret and no redirect. Tokens are refreshed the same way, so the sign-in lasts.
/// </summary>
internal static class TwitchSignIn
{
    private const string Scopes="chat:read chat:edit";
    public static async Task<JsonObject> Connect(HttpClient http,string client,CancellationToken token)
    {
        if(string.IsNullOrWhiteSpace(client))throw new InvalidDataException("Enter the client ID of your Twitch application first.");
        using var start=await http.PostAsync("https://id.twitch.tv/oauth2/device",new FormUrlEncodedContent(new Dictionary<string,string>{["client_id"]=client,["scopes"]=Scopes}),token);
        var device=JsonNode.Parse(await start.Content.ReadAsStringAsync(token))?.AsObject()??new JsonObject();
        if(!start.IsSuccessStatusCode)throw new InvalidDataException("Twitch did not accept this client ID ("+(device["message"]?.GetValue<string>()??((int)start.StatusCode).ToString())+"). Check that the application's client type is Public.");
        var verify=device["verification_uri"]?.GetValue<string>();
        if(!Uri.TryCreate(verify,UriKind.Absolute,out var page)||page.Host is not ("www.twitch.tv" or "twitch.tv"))throw new InvalidDataException("Twitch sent an unexpected sign-in page.");
        Host.OpenExternal(page.AbsoluteUri);
        var wait=TimeSpan.FromSeconds(Math.Clamp(device["interval"]?.GetValue<int>()??5,1,10));
        var deadline=DateTimeOffset.UtcNow.AddSeconds(Math.Min(device["expires_in"]?.GetValue<int>()??600,600));
        while(DateTimeOffset.UtcNow<deadline)
        {
            await Task.Delay(wait,token);
            using var poll=await http.PostAsync("https://id.twitch.tv/oauth2/token",new FormUrlEncodedContent(new Dictionary<string,string>{["client_id"]=client,["scopes"]=Scopes,["device_code"]=device["device_code"]?.GetValue<string>()??"",["grant_type"]="urn:ietf:params:oauth:grant-type:device_code"}),token);
            var body=JsonNode.Parse(await poll.Content.ReadAsStringAsync(token))?.AsObject()??new JsonObject();
            if(poll.IsSuccessStatusCode)return await Fields(http,client,body,token);
            var message=body["message"]?.GetValue<string>()??"";
            if(message=="authorization_pending")continue;
            if(message=="slow_down"){wait+=TimeSpan.FromSeconds(5);continue;}
            throw new InvalidDataException(message is "access_denied"?"Twitch sign-in was declined. Your previous connection is kept.":"Twitch sign-in did not finish ("+message+"). Try again.");
        }
        throw new InvalidDataException("The Twitch code expired before it was approved. Try again.");
    }
    /** A fresh token from the saved refresh token, or null when Twitch no longer accepts it. */
    public static async Task<JsonObject?> Refresh(HttpClient http,string client,string refresh)
    {
        using var response=await http.PostAsync("https://id.twitch.tv/oauth2/token",new FormUrlEncodedContent(new Dictionary<string,string>{["client_id"]=client,["grant_type"]="refresh_token",["refresh_token"]=refresh}));
        if(!response.IsSuccessStatusCode)return null;
        return await Fields(http,client,JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject(),CancellationToken.None);
    }
    private static async Task<JsonObject> Fields(HttpClient http,string client,JsonObject body,CancellationToken token)
    {
        var access=body["access_token"]?.GetValue<string>()??throw new InvalidDataException("Twitch did not return a token.");
        using var validate=new HttpRequestMessage(HttpMethod.Get,"https://id.twitch.tv/oauth2/validate");validate.Headers.Authorization=new AuthenticationHeaderValue("OAuth",access);
        using var who=await http.SendAsync(validate,token);who.EnsureSuccessStatusCode();
        var login=JsonNode.Parse(await who.Content.ReadAsStringAsync(token))?["login"]?.GetValue<string>()??throw new InvalidDataException("Twitch did not say which account signed in.");
        return new JsonObject{["TwitchClientId"]=client,["TwitchAccessToken"]=access,["TwitchRefreshToken"]=body["refresh_token"]?.DeepClone(),["TwitchExpiresAt"]=DateTimeOffset.UtcNow.AddSeconds(body["expires_in"]?.GetValue<int>()??3600).ToString("O"),["TwitchLogin"]=login};
    }
}

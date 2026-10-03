using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal sealed class DiscordVoice : IAsyncDisposable
{
    private readonly NamedPipeClientStream channel;
    /** Each exchange gets its own time limit; the connection itself stays open between reads. */
    private static readonly TimeSpan Limit=TimeSpan.FromSeconds(8);
    private CancellationToken current;
    private DiscordVoice(NamedPipeClientStream channel){this.channel=channel;}
    /** The connection broke or Discord closed it: open a new one. */
    public bool Broken=>!channel.IsConnected;
    public static async Task<DiscordVoice> Session(string client,string access)
    {
        if(string.IsNullOrWhiteSpace(client)||string.IsNullOrWhiteSpace(access))throw new InvalidDataException("Connect a Discord application with voice access first.");
        NamedPipeClientStream? connected=null;
        for(var n=0;n<10;n++)
        {
            var candidate=new NamedPipeClientStream(".","discord-ipc-"+n,PipeDirection.InOut,PipeOptions.Asynchronous);
            try{await candidate.ConnectAsync(250);connected=candidate;break;}
            catch(Exception error) when(error is TimeoutException or IOException or UnauthorizedAccessException){await candidate.DisposeAsync();}
        }
        if(connected is null)throw new InvalidDataException("Open Discord desktop to read your call. Web Discord does not provide local voice access.");
        var session=new DiscordVoice(connected);
        try
        {
            using var limit=new CancellationTokenSource(Limit);session.current=limit.Token;
            await session.Write(0,JsonSerializer.SerializeToUtf8Bytes(new{v=1,client_id=client}));
            var welcome=await session.Read();if(welcome?["evt"]?.GetValue<string>()!="READY")throw new InvalidDataException("Discord did not accept this application. Check RPC access in its developer settings.");
            await session.Request("AUTHENTICATE",new JsonObject{["access_token"]=access});return session;
        }
        catch{await session.DisposeAsync();throw;}
    }
    private async Task Write(int opcode,byte[] payload)
    {
        var frame=new byte[8+payload.Length];BinaryPrimitives.WriteInt32LittleEndian(frame,opcode);BinaryPrimitives.WriteInt32LittleEndian(frame.AsSpan(4),payload.Length);payload.CopyTo(frame,8);await channel.WriteAsync(frame,current);
    }
    private async Task<JsonObject?> Read()
    {
        while(true)
        {
            var prefix=new byte[8];await channel.ReadExactlyAsync(prefix,current);var operation=BinaryPrimitives.ReadInt32LittleEndian(prefix);var size=BinaryPrimitives.ReadInt32LittleEndian(prefix.AsSpan(4));
            if(size is <0 or >1048576)throw new InvalidDataException("Discord sent an invalid frame.");
            var body=new byte[size];await channel.ReadExactlyAsync(body,current);
            if(operation==3){await Write(4,body);continue;}
            if(operation==2)throw new InvalidDataException("Discord closed the session. Reconnect voice access.");
            if(operation!=1)continue;
            return JsonNode.Parse(body)?.AsObject();
        }
    }
    private async Task<JsonNode?> Request(string command,JsonObject args)
    {
        var nonce=Guid.NewGuid().ToString("N");var packet=new JsonObject{["cmd"]=command,["args"]=args,["nonce"]=nonce};await Write(1,JsonSerializer.SerializeToUtf8Bytes(packet));
        while(true)
        {
            var response=await Read();if(response?["nonce"]?.GetValue<string>()!=nonce)continue;
            if(response["evt"]?.GetValue<string>()=="ERROR")throw new InvalidDataException("Discord refused "+command+". Reconnect with RPC voice read/write permission and an authorized tester account.");
            return response["data"]?.DeepClone();
        }
    }
    public async Task<JsonObject> Snapshot(JsonObject? changes=null)
    {
        using var limit=new CancellationTokenSource(Limit);current=limit.Token;
        if(changes is not null)await Request("SET_VOICE_SETTINGS",changes);
        var voice=await Request("GET_VOICE_SETTINGS",new JsonObject());
        var call=await Request("GET_SELECTED_VOICE_CHANNEL",new JsonObject());var participants=new JsonArray();
        if(call?["voice_states"] is JsonArray members)foreach(var member in members.OfType<JsonObject>())
        {
            var flags=member["voice_state"];bool Flag(string name)=>flags?[name]?.GetValue<bool>()??false;
            var user=member["user"];var id=user?["id"]?.GetValue<string>()??"";var hash=user?["avatar"]?.GetValue<string>();
            var name=member["nick"]?.GetValue<string>() is {Length:>0} nick?nick:user?["global_name"]?.GetValue<string>() is {Length:>0} shown?shown:user?["username"]?.GetValue<string>()??"Participant";
            participants.Add(new JsonObject{["id"]=id,["title"]=name,["avatar"]=Avatar(id,hash),["detail"]=Flag("self_deaf")||Flag("deaf")?"Deafened":Flag("self_mute")||Flag("mute")?"Muted":"In call"});
        }
        // The card's header names the server the call is in.
        string? server=null,icon=null;
        if(call?["guild_id"]?.GetValue<string>() is {Length:>0} guild){try{var found=await Request("GET_GUILD",new JsonObject{["guild_id"]=guild});server=found?["name"]?.GetValue<string>();icon=found?["icon_url"]?.GetValue<string>();}catch(InvalidDataException){}}
        // A direct or group call has no server, and a direct call often has no channel name either.
        var channelName=call?["name"]?.GetValue<string>() is {Length:>0} named?named:call is null?"Not in a call":call["guild_id"] is null?(participants.Count>2?"Group call":"Direct call"):"Voice channel";
        return Providers.State(call is null?"empty":"ready",channelName,call is null?"Join a voice channel in Discord.":participants.Count+" participants · Discord desktop",participants,new JsonObject{["voice"]=true,["server"]=server,["icon"]=Https(icon),["muted"]=voice?["mute"]?.DeepClone(),["deafened"]=voice?["deaf"]?.DeepClone()});
    }
    /** A Discord avatar image, or nothing when the user has none (the card then shows their initial). */
    private static string? Avatar(string id,string? hash)=>id.Length>0&&id.All(char.IsAsciiDigit)&&hash is {Length:>0}&&hash.All(c=>char.IsAsciiLetterOrDigit(c)||c=='_')?"https://cdn.discordapp.com/avatars/"+id+"/"+hash+".png?size=64":null;
    /** Only HTTPS images from Discord's CDN reach the card. */
    internal static string? Https(string? url)=>Uri.TryCreate(url,UriKind.Absolute,out var uri)&&uri.Scheme=="https"&&(uri.Host=="cdn.discordapp.com"||uri.Host.EndsWith(".discordapp.com",StringComparison.Ordinal))?uri.AbsoluteUri:null;
    public async ValueTask DisposeAsync()=>await channel.DisposeAsync();
}

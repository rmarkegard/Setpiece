using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal sealed class DiscordVoice : IAsyncDisposable
{
    private readonly NamedPipeClientStream channel;
    private readonly CancellationTokenSource deadline=new(TimeSpan.FromSeconds(12));
    private DiscordVoice(NamedPipeClientStream channel){this.channel=channel;}
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
            await session.Write(0,JsonSerializer.SerializeToUtf8Bytes(new{v=1,client_id=client}));
            var welcome=await session.Read();if(welcome?["evt"]?.GetValue<string>()!="READY")throw new InvalidDataException("Discord did not accept this application. Check RPC access in its developer settings.");
            await session.Request("AUTHENTICATE",new JsonObject{["access_token"]=access});return session;
        }
        catch{await session.DisposeAsync();throw;}
    }
    private async Task Write(int opcode,byte[] payload)
    {
        var frame=new byte[8+payload.Length];BinaryPrimitives.WriteInt32LittleEndian(frame,opcode);BinaryPrimitives.WriteInt32LittleEndian(frame.AsSpan(4),payload.Length);payload.CopyTo(frame,8);await channel.WriteAsync(frame,deadline.Token);
    }
    private async Task<JsonObject?> Read()
    {
        while(true)
        {
            var prefix=new byte[8];await channel.ReadExactlyAsync(prefix,deadline.Token);var operation=BinaryPrimitives.ReadInt32LittleEndian(prefix);var size=BinaryPrimitives.ReadInt32LittleEndian(prefix.AsSpan(4));
            if(size is <0 or >1048576)throw new InvalidDataException("Discord sent an invalid frame.");
            var body=new byte[size];await channel.ReadExactlyAsync(body,deadline.Token);
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
        if(changes is not null)await Request("SET_VOICE_SETTINGS",changes);
        var voice=await Request("GET_VOICE_SETTINGS",new JsonObject());
        var call=await Request("GET_SELECTED_VOICE_CHANNEL",new JsonObject());var participants=new JsonArray();
        if(call?["voice_states"] is JsonArray members)foreach(var member in members.OfType<JsonObject>())
        {
            var flags=member["voice_state"];bool Flag(string name)=>flags?[name]?.GetValue<bool>()??false;
            participants.Add(new JsonObject{["title"]=member["nick"]?.GetValue<string>()??member["user"]?["username"]?.GetValue<string>()??"Participant",["detail"]=Flag("self_deaf")||Flag("deaf")?"Deafened":Flag("self_mute")||Flag("mute")?"Muted":"In call"});
        }
        return Providers.State(call is null?"empty":"ready",call?["name"]?.GetValue<string>()??"Not in a call",call is null?"Join a voice channel in Discord.":participants.Count+" participants · Discord desktop",participants,new JsonObject{["voice"]=true,["muted"]=voice?["mute"]?.DeepClone(),["deafened"]=voice?["deaf"]?.DeepClone()});
    }
    public async ValueTask DisposeAsync(){deadline.Cancel();deadline.Dispose();await channel.DisposeAsync();}
}

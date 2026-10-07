using MQTTnet;
using MQTTnet.Formatter;
using System.Buffers;
using System.Buffers.Binary;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal static class PrinterService
{
    private static string Field(JsonObject settings,string key)=>settings[key]?.GetValue<string>()??"";
    private static string Fingerprint(System.Security.Cryptography.X509Certificates.X509Certificate certificate)=>Convert.ToHexString(SHA256.HashData(certificate.GetRawCertData()));
    public static async Task<JsonObject> Connect(JsonObject input)
    {
        var host=Field(input,"host").Trim();var serial=Field(input,"serial").Trim();var code=Field(input,"accessCode");
        if(!IPAddress.TryParse(host,out var address)||address.AddressFamily!=AddressFamily.InterNetwork)throw new InvalidDataException("Enter the printer's local IPv4 address.");
        var bytes=address.GetAddressBytes();if(!(bytes[0]==10||(bytes[0]==192&&bytes[1]==168)||(bytes[0]==172&&bytes[1] is >=16 and <=31)||(bytes[0]==169&&bytes[1]==254)))throw new InvalidDataException("Use a printer on your local network.");
        if(serial.Length<4||!serial.All(char.IsAsciiLetterOrDigit)||Encoding.UTF8.GetByteCount(code) is <1 or >32)throw new InvalidDataException("Check the serial number and LAN access code shown on the printer.");
        using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(8));
        var fingerprint=await InspectCertificate(host,8883,timeout.Token);
        var settings=new JsonObject{["BambuHost"]=host,["BambuSerial"]=serial,["BambuAccessCode"]=code,["BambuCertificateSha256"]=fingerprint};
        await Status(settings,timeout.Token);
        try{settings["BambuCameraCertificateSha256"]=await InspectCertificate(host,6000,timeout.Token);}catch(Exception error) when(error is IOException or SocketException or OperationCanceledException){}
        return settings;
    }
    // Trust is established only during the explicit connect flow and scoped to this LAN printer.
    private static async Task<string> InspectCertificate(string host,int port,CancellationToken token)
    {
        string? fingerprint=null;using var tcp=new TcpClient();await tcp.ConnectAsync(host,port,token);
        using var tls=new SslStream(tcp.GetStream(),false,(_,certificate,_,_)=>{if(certificate is null)return false;fingerprint=Fingerprint(certificate);return true;});
        await tls.AuthenticateAsClientAsync(new SslClientAuthenticationOptions{TargetHost=host},token);
        return fingerprint??throw new InvalidDataException("The printer did not provide a certificate.");
    }
    public static async Task<JsonObject> Read(JsonObject settings)
    {
        if(Field(settings,"BambuHost").Length==0||Field(settings,"BambuAccessCode").Length==0)return Providers.State("disconnected","Meet your next creation","Add the printer IP, serial and LAN access code in the widget settings.");
        if(Field(settings,"BambuCertificateSha256").Length==0)return Providers.State("disconnected","Verify your printer connection","Reconnect once to save this printer's certificate. Existing credentials are preserved.");
        using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(10));var print=await LiveStatus(settings,timeout.Token);
        var stage=Field(print,"gcode_state");var title=stage switch{"RUNNING"=>"Making something good","PAUSE"=>"Print paused","FINISH"=>"Ready to collect","FAILED"=>"The print needs attention","IDLE"=>"Ready when you are",_=>"Printer connected"};
        var data=new JsonObject();foreach(var pair in new Dictionary<string,string>{{"progress","mc_percent"},{"minutes","mc_remaining_time"},{"layer","layer_num"},{"layers","total_layer_num"},{"nozzle","nozzle_temper"},{"bed","bed_temper"}})data[pair.Key]=print[pair.Value]?.DeepClone();
        data["stage"]=stage;data["cameraStatus"]="Enable LAN Liveview on the printer for a camera preview.";
        data["job"]=Field(print,"subtask_name");data["filament"]=Filament(print);
        if(Field(settings,"BambuCameraCertificateSha256").Length>0)
        {try{var jpeg=await Camera(settings,timeout.Token);data["image"]="data:image/jpeg;base64,"+Convert.ToBase64String(jpeg);data["cameraStatus"]="LAN camera · refreshed with telemetry";}catch(Exception error) when(error is IOException or SocketException or OperationCanceledException or System.Security.Authentication.AuthenticationException){data["cameraStatus"]="Camera unavailable. Printer telemetry is connected.";}}
        return Providers.State("ready",title,"Bambu Lab A1 Mini",data:data);
    }
    /// <summary>The loaded filament, as the AMS names it ("PLA Matte"), or the external spool's type.</summary>
    internal static string Filament(JsonObject print)
    {
        var ams=print["ams"];var now=ams?["tray_now"]?.GetValue<string>();
        foreach(var unit in ams?["ams"]?.AsArray()??[])foreach(var tray in unit?["tray"]?.AsArray()??[])
        {
            var id=tray?["id"]?.GetValue<string>();var slot=int.TryParse(unit?["id"]?.GetValue<string>(),out var u)&&int.TryParse(id,out var t)?(u*4+t).ToString():null;
            if(slot is not null&&slot==now)return tray?["tray_sub_brands"]?.GetValue<string>() is {Length:>0} brand?brand:tray?["tray_type"]?.GetValue<string>()??"";
        }
        return print["vt_tray"]?["tray_type"]?.GetValue<string>()??"";
    }
    /** One status report over its own connection: checking a printer while connecting it. */
    private static async Task<JsonObject> Status(JsonObject settings,CancellationToken token)
    {
        var report=new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var client=await Subscribe(settings,print=>{if(print["gcode_state"] is not null)report.TrySetResult(print);},token);
        return await report.Task.WaitAsync(token);
    }
    /** Logs in to the printer's MQTT broker, hands each status report to <paramref name="report"/> and asks for a full one. */
    private static async Task<IMqttClient> Subscribe(JsonObject settings,Action<JsonObject> report,CancellationToken token)
    {
        var client=new MqttClientFactory().CreateMqttClient();var topic="device/"+Field(settings,"BambuSerial")+"/report";
        client.ApplicationMessageReceivedAsync+=message=>
        {
            if(message.ApplicationMessage.Topic==topic)
            {try{var data=JsonNode.Parse(message.ApplicationMessage.Payload.ToArray());if(data?["print"] is JsonObject print)report(print);}catch(System.Text.Json.JsonException){}}
            return Task.CompletedTask;
        };
        try
        {
            var fingerprint=Field(settings,"BambuCertificateSha256");
            var options=new MqttClientOptionsBuilder().WithTcpServer(Field(settings,"BambuHost"),8883).WithProtocolVersion(MqttProtocolVersion.V311).WithClientId("sp2-"+Guid.NewGuid().ToString("N")).WithCredentials("bblp",Field(settings,"BambuAccessCode"))
                .WithKeepAlivePeriod(TimeSpan.FromSeconds(10)).WithTlsOptions(tls=>tls.UseTls().WithCertificateValidationHandler(context=>context.Certificate is not null&&Fingerprint(context.Certificate)==fingerprint)).Build();
            var connected=await client.ConnectAsync(options,token);if(connected.ResultCode!=MqttClientConnectResultCode.Success)throw new InvalidDataException("The printer rejected the LAN access code.");
            await client.SubscribeAsync(new MqttClientSubscribeOptionsBuilder().WithTopicFilter(topic).Build(),token);
            var query=new JsonObject{["pushing"]=new JsonObject{["sequence_id"]="0",["command"]="pushall"}};
            await client.PublishAsync(new MqttApplicationMessageBuilder().WithTopic("device/"+Field(settings,"BambuSerial")+"/request").WithPayload(query.ToJsonString()).Build(),token);
            return client;
        }
        catch{client.Dispose();throw;}
    }
    /**
     * The widget's telemetry comes over one connection that stays open while the widget reads it. Reconnecting
     * for every reading cost a TCP and TLS handshake, a login and a full status report every ten seconds; open,
     * the printer sends only what changed, which is merged into the last full report. Nobody asking for a minute
     * (the widget removed or out of sight) closes it.
     */
    private sealed class Link(string identity)
    {
        public readonly string Identity=identity;
        public IMqttClient? Client;
        public JsonObject? Print;
        public readonly TaskCompletionSource Ready=new(TaskCreationOptions.RunContinuationsAsynchronously);
        public void Receive(JsonObject report)
        {
            lock(this)
            {
                if(Print is not null)Merge(Print,report);
                else if(report["gcode_state"] is not null){Print=(JsonObject)report.DeepClone();Ready.TrySetResult();}
            }
        }
        public JsonObject Snapshot(){lock(this)return (JsonObject)Print!.DeepClone();}
    }
    private static Link? link;
    private static readonly SemaphoreSlim linkGate=new(1);
    private static long linkAsked;
    private static System.Threading.Timer? linkIdle;
    private const long LinkIdleAfter=60_000;
    /** A change report into the full one: objects merge key by key, anything else (lists included) is replaced. */
    internal static void Merge(JsonObject into,JsonObject change)
    {
        foreach(var (key,value) in change)
            if(into[key] is JsonObject inner&&value is JsonObject update)Merge(inner,update);
            else into[key]=value?.DeepClone();
    }
    private static async Task<JsonObject> LiveStatus(JsonObject settings,CancellationToken token)
    {
        await linkGate.WaitAsync(token);
        try
        {
            Interlocked.Exchange(ref linkAsked,Environment.TickCount64);
            var identity=string.Join("|",Field(settings,"BambuHost"),Field(settings,"BambuSerial"),Field(settings,"BambuAccessCode"),Field(settings,"BambuCertificateSha256"));
            if(link?.Client is not {IsConnected:true}||link.Identity!=identity)
            {
                CloseLink();var opening=new Link(identity);
                opening.Client=await Subscribe(settings,opening.Receive,token);link=opening;
                linkIdle??=new System.Threading.Timer(_=>RestLink(),null,TimeSpan.FromSeconds(30),TimeSpan.FromSeconds(30));
            }
            await link.Ready.Task.WaitAsync(token);
            return link.Snapshot();
        }
        catch{CloseLink();throw;}
        finally{linkGate.Release();}
    }
    private static void RestLink()
    {
        if(!linkGate.Wait(0))return;
        try{if(Environment.TickCount64-Interlocked.Read(ref linkAsked)>LinkIdleAfter)CloseLink();}
        finally{linkGate.Release();}
    }
    private static void CloseLink()
    {
        if(link is null)return;
        if(link.Client is { } client)client.Dispose();
        link=null;linkIdle?.Dispose();linkIdle=null;
    }
    /** Setpiece is closing: the printer connection closes with it. */
    internal static void Shutdown(){if(!linkGate.Wait(TimeSpan.FromSeconds(2)))return;try{CloseLink();}finally{linkGate.Release();}}
    private static async Task<byte[]> Camera(JsonObject settings,CancellationToken token)
    {
        var host=Field(settings,"BambuHost");var fingerprint=Field(settings,"BambuCameraCertificateSha256");
        using var tcp=new TcpClient();await tcp.ConnectAsync(host,6000,token);using var tls=new SslStream(tcp.GetStream(),false,(_,certificate,_,_)=>certificate is not null&&Fingerprint(certificate)==fingerprint);
        await tls.AuthenticateAsClientAsync(new SslClientAuthenticationOptions{TargetHost=host},token);
        var login=new byte[80];BinaryPrimitives.WriteUInt32LittleEndian(login,64);BinaryPrimitives.WriteUInt32LittleEndian(login.AsSpan(4),0x3000);Encoding.UTF8.GetBytes("bblp",login.AsSpan(16,32));Encoding.UTF8.GetBytes(Field(settings,"BambuAccessCode"),login.AsSpan(48,32));await tls.WriteAsync(login,token);
        var chunk=new byte[8192];var frame=new ArrayBufferWriter<byte>();var started=false;byte previous=0;int received=0;
        while(received<4_000_000)
        {
            var count=await tls.ReadAsync(chunk,token);if(count==0)break;received+=count;
            for(var i=0;i<count;i++)
            {
                var current=chunk[i];if(!started&&previous==255&&current==216){started=true;frame.Write(new byte[]{255});}
                if(started){frame.GetSpan(1)[0]=current;frame.Advance(1);if(previous==255&&current==217)return frame.WrittenSpan.ToArray();}
                previous=current;
            }
        }
        throw new IOException("No complete camera frame arrived.");
    }
}

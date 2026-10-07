using NAudio.CoreAudioApi;
using System.Diagnostics;
using System.IO.Pipes;
using System.Net.NetworkInformation;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal sealed class DeviceServices : IDisposable
{
    private Process? sensorProcess;
    private readonly string pipeName="Setpiece.Telemetry."+Guid.NewGuid().ToString("N");
    private long previousReceived,previousSent;
    private DateTimeOffset previousNetwork;
    private readonly SemaphoreSlim sensorGate=new(1);
    /**
     * The adapters whose traffic the System widget adds up. Listing them takes Windows about 10 ms, on the UI
     * thread, every two seconds; reading their counters takes a fraction of that. The list is kept until Windows
     * reports a network change (an adapter connecting, dropping or getting a new address).
     */
    private NetworkInterface[]? adapters;
    public DeviceServices(){NetworkChange.NetworkAddressChanged+=ForgetAdapters;NetworkChange.NetworkAvailabilityChanged+=ForgetAdapters;}
    private void ForgetAdapters(object? sender,EventArgs e)=>Volatile.Write(ref adapters,null);
    public static JsonObject Volume(double? level=null,bool? muted=null)
    {
        try
        {
            using var enumerator=new MMDeviceEnumerator();using var device=enumerator.GetDefaultAudioEndpoint(DataFlow.Render,Role.Multimedia);
            if(level.HasValue)device.AudioEndpointVolume.MasterVolumeLevelScalar=(float)Math.Clamp(level.Value/100,0,1);
            if(muted.HasValue)device.AudioEndpointVolume.Mute=muted.Value;
            var volume=device.AudioEndpointVolume.MasterVolumeLevelScalar*100;
            return Providers.State("ready",$"{volume:0}%",device.FriendlyName,data:new JsonObject{["level"]=volume,["muted"]=device.AudioEndpointVolume.Mute,["peak"]=device.AudioMeterInformation.MasterPeakValue*100});
        }
        catch(System.Runtime.InteropServices.COMException){return Providers.State("empty","No audio output","Connect speakers or headphones, then refresh.");}
    }
    public JsonObject Network()
    {
        long received=0,sent=0;
        var up=Volatile.Read(ref adapters)??(adapters=NetworkInterface.GetAllNetworkInterfaces().Where(a=>a.OperationalStatus==OperationalStatus.Up&&a.NetworkInterfaceType is not (NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)).ToArray());
        foreach(var adapter in up)
        {try{var stats=adapter.GetIPStatistics();received+=stats.BytesReceived;sent+=stats.BytesSent;}catch(NetworkInformationException){}}
        var now=DateTimeOffset.UtcNow;var seconds=(now-previousNetwork).TotalSeconds;
        var result=new JsonObject{["download"]=previousNetwork==default?null:Math.Max(0,(received-previousReceived)/seconds),["upload"]=previousNetwork==default?null:Math.Max(0,(sent-previousSent)/seconds)};
        previousReceived=received;previousSent=sent;previousNetwork=now;return result;
    }
    public void StartSensors(bool elevated=false)
    {
        if(sensorProcess is not null)
        {
            if(!sensorProcess.HasExited){if(!elevated)return;try{sensorProcess.Kill();}catch(Exception error) when(error is InvalidOperationException or System.ComponentModel.Win32Exception){}}
            sensorProcess.Dispose();sensorProcess=null;
        }
        var start=new ProcessStartInfo(Path.Combine(AppContext.BaseDirectory,"Sensors","Setpiece.Sensors.exe")){UseShellExecute=elevated,CreateNoWindow=!elevated,WindowStyle=ProcessWindowStyle.Hidden};
        if(elevated)start.Verb="runas";
        foreach(var arg in new[]{"--sensor-worker","--sensor-pipe",pipeName,"--sensor-parent",Environment.ProcessId.ToString()})start.ArgumentList.Add(arg);
        sensorProcess=Process.Start(start);
    }
    public async Task<JsonObject> Sensors()
    {
        if(!await sensorGate.WaitAsync(0))return new JsonObject{["sensorStatus"]="Refreshing sensors"};
        try
        {
            StartSensors();using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(2));
            using var pipe=new NamedPipeClientStream(".",pipeName,PipeDirection.In,PipeOptions.Asynchronous);
            await pipe.ConnectAsync(timeout.Token);using var reader=new StreamReader(pipe);
            var line=await reader.ReadLineAsync(timeout.Token);return JsonNode.Parse(line??"{}")!.AsObject();
        }
        catch(Exception error) when(error is IOException or OperationCanceledException or System.ComponentModel.Win32Exception or JsonException)
        {return new JsonObject{["sensorStatus"]="Hardware readings unavailable. Enable the collector in widget settings for supported temperature sensors."};}
        finally{sensorGate.Release();}
    }
    public void Dispose(){NetworkChange.NetworkAddressChanged-=ForgetAdapters;NetworkChange.NetworkAvailabilityChanged-=ForgetAdapters;if(sensorProcess is not null){try{if(!sensorProcess.HasExited)sensorProcess.Kill();}catch(System.ComponentModel.Win32Exception){}sensorProcess.Dispose();}sensorGate.Dispose();}
}


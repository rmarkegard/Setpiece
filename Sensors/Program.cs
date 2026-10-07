using LibreHardwareMonitor.Hardware;
using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
namespace Setpiece.Telemetry;
internal static class Program{private static void Main(string[] args){try{SensorWorker.Run(args);}catch(ArgumentException){}}}
internal static class SensorWorker
{
    /** How long the collector keeps reading after Setpiece last asked; the System widget asks every two seconds. */
    private const long IdleAfter=15_000;
    [DllImport("kernel32.dll")] private static extern bool SetProcessWorkingSetSize(nint process,nint minimum,nint maximum);
    public static void Run(string[] args)
    {
        var pipeIndex=Array.IndexOf(args,"--sensor-pipe");var parentIndex=Array.IndexOf(args,"--sensor-parent");
        if(pipeIndex<0||parentIndex<0||pipeIndex+1>=args.Length||parentIndex+1>=args.Length)return;
        var pipeName=args[pipeIndex+1];if(!pipeName.StartsWith("Setpiece.Telemetry.",StringComparison.Ordinal)||!int.TryParse(args[parentIndex+1],out var pid))return;
        using var parent=Process.GetProcessById(pid);using var cancellation=new CancellationTokenSource();
        parent.EnableRaisingEvents=true;parent.Exited+=(_,_)=>cancellation.Cancel();
        var computer=new Computer{IsCpuEnabled=true,IsGpuEnabled=true};
        JsonObject latest=new(){["sensorStatus"]="Starting hardware collector"};
        // Sensors are read only while Setpiece asks for them: with no System widget on screen (or Studio minimized)
        // the collector rests instead of querying the CPU and graphics drivers every two seconds.
        // (Interlocked writes: each side writes its own flag, then reads the other's, so neither misses the other.)
        var asked=Environment.TickCount64;var resting=0;using var wake=new SemaphoreSlim(0,1);
        var reading=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var update=Task.Run(async()=>
        {
            try
            {
                computer.Open();
                while(!cancellation.IsCancellationRequested)
                {
                    if(Environment.TickCount64-Interlocked.Read(ref asked)>IdleAfter)
                    {
                        Interlocked.Exchange(ref resting,1);
                        // Asked again between the check and the flag: no need to wait for a wake that has passed.
                        if(Environment.TickCount64-Interlocked.Read(ref asked)>IdleAfter)
                        {
                            // Resting, it gives its memory back: what it read is garbage now, and Windows can have the pages.
                            GC.Collect(GC.MaxGeneration,GCCollectionMode.Aggressive,true,true);SetProcessWorkingSetSize(Process.GetCurrentProcess().Handle,-1,-1);
                            await wake.WaitAsync(cancellation.Token);
                        }
                        Interlocked.Exchange(ref resting,0);
                    }
                    var result=new JsonObject();
                    foreach(var hardware in computer.Hardware)
                    {
                        hardware.Update();foreach(var child in hardware.SubHardware)child.Update();
                        var sensors=hardware.Sensors.Concat(hardware.SubHardware.SelectMany(c=>c.Sensors)).Where(s=>s.Value.HasValue).ToArray();
                        if(hardware.HardwareType==HardwareType.Cpu)
                        {
                            var temperatures=sensors.Where(s=>s.SensorType==SensorType.Temperature).Select(s=>s.Value!.Value).Where(t=>float.IsFinite(t)&&t is >0 and <150).ToArray();if(temperatures.Length>0)result["temperature"]=temperatures.Max();
                        }
                        if(hardware.HardwareType is HardwareType.GpuAmd or HardwareType.GpuNvidia or HardwareType.GpuIntel)
                        {
                            result["gpuName"]=hardware.Name;var load=sensors.FirstOrDefault(s=>s.SensorType==SensorType.Load&&s.Name.Contains("Core",StringComparison.OrdinalIgnoreCase))??sensors.FirstOrDefault(s=>s.SensorType==SensorType.Load);
                            if(load?.Value is float value&&float.IsFinite(value)&&value is >=0 and <=100)result["gpu"]=value;var temperature=sensors.FirstOrDefault(s=>s.SensorType==SensorType.Temperature);if(temperature?.Value is float degrees&&float.IsFinite(degrees)&&degrees is >0 and <150)result["gpuTemperature"]=degrees;
                        }
                    }
                    result["sensorStatus"]=result["temperature"] is null?"CPU temperature needs a supported sensor and collector permission.":"Hardware collector connected";
                    Volatile.Write(ref latest,result);Interlocked.Exchange(ref reading,new(TaskCreationOptions.RunContinuationsAsynchronously)).TrySetResult();
                    await Task.Delay(2000,cancellation.Token);
                }
            }
            catch(OperationCanceledException){}
            catch(Exception error){Volatile.Write(ref latest,new JsonObject{["sensorStatus"]="Collector unavailable ("+error.GetType().Name+")."});}
            finally{computer.Close();}
        });
        try
        {
            while(!cancellation.IsCancellationRequested&&!parent.HasExited)
            {
                using var pipe=new NamedPipeServerStream(pipeName,PipeDirection.Out,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous|PipeOptions.CurrentUserOnly);
                pipe.WaitForConnectionAsync(cancellation.Token).GetAwaiter().GetResult();
                Interlocked.Exchange(ref asked,Environment.TickCount64);
                // A resting collector reads once now, so Setpiece never gets a reading from minutes ago.
                if(Volatile.Read(ref resting)==1){var next=Volatile.Read(ref reading).Task;if(wake.CurrentCount==0)wake.Release();next.Wait(1500,cancellation.Token);}
                using var writer=new StreamWriter(pipe){AutoFlush=true};writer.WriteLine(Volatile.Read(ref latest).ToJsonString());
            }
        }
        catch(OperationCanceledException){}
        catch(IOException){}
        finally{cancellation.Cancel();}
    }
}

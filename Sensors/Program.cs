using LibreHardwareMonitor.Hardware;
using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json.Nodes;
namespace Setpiece.Telemetry;
internal static class Program{private static void Main(string[] args){try{SensorWorker.Run(args);}catch(ArgumentException){}}}
internal static class SensorWorker
{
    public static void Run(string[] args)
    {
        var pipeIndex=Array.IndexOf(args,"--sensor-pipe");var parentIndex=Array.IndexOf(args,"--sensor-parent");
        if(pipeIndex<0||parentIndex<0||pipeIndex+1>=args.Length||parentIndex+1>=args.Length)return;
        var pipeName=args[pipeIndex+1];if(!pipeName.StartsWith("Setpiece.Telemetry.",StringComparison.Ordinal)||!int.TryParse(args[parentIndex+1],out var pid))return;
        using var parent=Process.GetProcessById(pid);using var cancellation=new CancellationTokenSource();
        parent.EnableRaisingEvents=true;parent.Exited+=(_,_)=>cancellation.Cancel();
        var computer=new Computer{IsCpuEnabled=true,IsGpuEnabled=true};
        JsonObject latest=new(){["sensorStatus"]="Starting hardware collector"};
        var update=Task.Run(async()=>
        {
            try
            {
                computer.Open();
                while(!cancellation.IsCancellationRequested)
                {
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
                    Volatile.Write(ref latest,result);await Task.Delay(2000,cancellation.Token);
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
                using var writer=new StreamWriter(pipe){AutoFlush=true};writer.WriteLine(Volatile.Read(ref latest).ToJsonString());
            }
        }
        catch(OperationCanceledException){}
        catch(IOException){}
        finally{cancellation.Cancel();}
    }
}

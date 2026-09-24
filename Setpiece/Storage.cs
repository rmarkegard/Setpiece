using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal sealed class Storage
{
    public string Root { get; }
    public string ProfileFolder => Path.Combine(Root, "Profiles");
    private readonly JsonSerializerOptions formatting = new() { WriteIndented = true };
    private static readonly byte[] entropy = Encoding.UTF8.GetBytes("Setpiece.WidgetConnections.v1");
    private static readonly object logGate = new();
    public Storage(string? dataRoot = null) => Root = Path.GetFullPath(dataRoot ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Setpiece"));
    public void Log(string message)
    {
        lock (logGate)
        {
            Directory.CreateDirectory(Root);
            var path = Path.Combine(Root, "rebuild.log");
            File.AppendAllText(path, $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
            const int limit = 256 * 1024;
            if (new FileInfo(path).Length <= limit) return;
            var bytes = File.ReadAllBytes(path);
            var start = bytes.Length - limit;
            while (start < bytes.Length && bytes[start++] != (byte)'\n') { }
            File.WriteAllBytes(path, bytes[start..]);
        }
    }
    public void Log(string message, Exception error) => Log(message + ": " + error);
    public JsonArray Profiles()
    {
        var list = new JsonArray();
        if (!Directory.Exists(ProfileFolder)) return list;
        foreach (var file in Directory.EnumerateFiles(ProfileFolder, "*.json"))
        {
            try { list.Add(new JsonObject { ["key"] = Path.GetFileNameWithoutExtension(file), ["profile"] = Normalize(ReadObject(file)) }); }
            catch (Exception error) when (error is IOException or JsonException or InvalidDataException)
            { list.Add(new JsonObject { ["key"] = Path.GetFileNameWithoutExtension(file), ["error"] = "This profile could not be read. Its original file is preserved." }); Log("Profile read failed", error); }
        }
        return list;
    }
    public static JsonObject Normalize(JsonObject profile,bool repair=true)=>ProfileRules.Normalize(profile,repair);
    public string SaveProfile(string? key, JsonObject profile)
    {
        Normalize(profile,false);
        if (string.IsNullOrWhiteSpace(profile["Name"]?.GetValue<string>())) throw new InvalidDataException("Give this profile a name.");
        key = string.IsNullOrEmpty(key) ? Guid.NewGuid().ToString("N") : ValidateKey(key);
        Atomic(Path.Combine(ProfileFolder, key + ".json"), Encoding.UTF8.GetBytes(profile.ToJsonString(formatting)));
        return key;
    }
    public void DeleteProfile(string key) => File.Delete(Path.Combine(ProfileFolder, ValidateKey(key) + ".json"));
    private static string ValidateKey(string key)
    {
        if (key != Path.GetFileName(key) || key.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || key is "." or "..") throw new InvalidDataException("Invalid profile name.");
        return key;
    }
    public JsonObject Connections()
    {
        var file = Path.Combine(Root, "connections.dat");
        if (!File.Exists(file)) return new JsonObject();
        return JsonNode.Parse(ProtectedData.Unprotect(File.ReadAllBytes(file), entropy, DataProtectionScope.CurrentUser))?.AsObject() ?? throw new InvalidDataException("Empty connection data.");
    }
    public void UpdateConnections(JsonObject changes)
    {
        var file = Path.GetFullPath(Path.Combine(Root, "connections.dat"));
        using var gate = new Mutex(false, "Local\\Setpiece.Connections." + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(file.ToUpperInvariant()))));
        var acquired = false;
        try
        {
            try { acquired = gate.WaitOne(TimeSpan.FromSeconds(10)); } catch (AbandonedMutexException) { acquired = true; }
            if (!acquired) throw new IOException("Another connection save is in progress. Try again.");
            JsonObject current;
            try { current = Connections(); }
            catch (Exception error) when (error is CryptographicException or JsonException or InvalidDataException)
            {
                Log("Connection data could not be read; preserving a backup", error);
                var backup = Path.Combine(Root, "connections.unreadable-" + DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmssfff") + ".dat");
                File.Move(file, backup);
                current = new JsonObject();
            }
            foreach (var field in changes) current[field.Key] = field.Value?.DeepClone();
            Atomic(file, ProtectedData.Protect(Encoding.UTF8.GetBytes(current.ToJsonString()), entropy, DataProtectionScope.CurrentUser));
        }
        finally { if (acquired) gate.ReleaseMutex(); }
    }
    public JsonObject Preferences() => ReadOptional("appearance-v2.json");
    public JsonObject ReadOptional(string filename) => File.Exists(Path.Combine(Root, filename)) ? ReadObject(Path.Combine(Root, filename)) : new JsonObject();
    public void SaveDocument(string filename, JsonObject document) => Atomic(Path.Combine(Root, filename), Encoding.UTF8.GetBytes(document.ToJsonString(formatting)));
    private static JsonObject ReadObject(string path) => JsonNode.Parse(File.ReadAllText(path))?.AsObject() ?? throw new InvalidDataException("Empty document.");
    public static void Atomic(string path, byte[] bytes)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) { stream.Write(bytes); stream.Flush(true); }
            File.Move(temporary, path, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}

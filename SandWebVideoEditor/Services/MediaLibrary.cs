using System.Collections.Concurrent;
using System.Security.Cryptography.X509Certificates;
using FFMpegCore;
using Microsoft.AspNetCore.Components.Web;
using SandWebVideoEditor.Models;

namespace SandWebVideoEditor.Services;

public interface IMediaLibrary
{
    IReadOnlyList<MediaAsset> List(string sessionId);
    MediaAsset? Get(string sessionId, string? id);
    string PathOf(MediaAsset asset);
    Task<MediaAsset> AddAsync(string sessionId, IFormFile file, string? restoreId = null, CancellationToken ct = default);
    bool Delete(string sessionId, string id);
    int Ping(string sessionId);
    void EndSession(string sessionId);
    int PurgeIdle(TimeSpan idle);
}

public sealed class MediaLibrary : IMediaLibrary
{
    private static readonly HashSet<string> VideoExt = new(StringComparer.OrdinalIgnoreCase) { ".mp4", ".mov", ".mkv", ".webm", ".avi" };
    private static readonly HashSet<string> AudioExt = new(StringComparer.OrdinalIgnoreCase) { ".mp3", ".wav", ".m4a", ".aac", ".ogg" };
    private static readonly HashSet<string> ImageExt = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".jpeg", ".webp", ".bmp" };
    private const long MaxImagePixels = 100_000_000;
    private sealed class Session
    {
        public readonly object Lock = new();
        public readonly List<MediaAsset> Assets = new();
        public readonly HashSet<string> Pending = new();
        public long LastSeenTicks = DateTime.UtcNow.Ticks;
        public bool Ended;
    }

    private readonly string _root;
    private readonly ConcurrentDictionary<string, Session> _sessions = new();


    public MediaLibrary(IWebHostEnvironment env)
    {
        _root = Path.Combine(env.WebRootPath, "uploads");
        Directory.CreateDirectory(_root);

        foreach (var dir in Directory.GetDirectories(_root))
        {
            DeleteFolder(dir);
        }

        foreach (var file in Directory.GetFiles(_root))
        {
            if (!Path.GetFileName(file).StartsWith('.'))
            {
                TryDelete(file);
            }
        }
        TryDelete(Path.Combine(env.ContentRootPath, "App_Data", "media.json"));
    }

    public static bool IsValidId(string? s)
        => s is { Length: 32 } && s.All(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'));
    
    public IReadOnlyList<MediaAsset> List(string sessionId)
    {
        var s = Find(sessionId, touch: true);
        if (s == null) return Array.Empty<MediaAsset>();
        lock (s.Lock) return s.Assets.ToList();
    }

    public MediaAsset? Get(string sessionId, string? id)
    {
        if (string.IsNullOrEmpty(id)) return null;
        var s = Find(sessionId, touch: false);
        if (s == null)
        {
            return null;
        }
        lock (s.Lock) return s.Assets.FirstOrDefault(a => a.Id == id);
    }

    public string PathOf(MediaAsset asset) => Path.Combine(FolderOf(asset.SessionId), asset.StoredName);

    private string ThumbPathOf(MediaAsset asset) => Path.Combine(FolderOf(asset.SessionId), $"{asset.Id}_thumb.jpg");

    public int Ping(string sessionId)
    {
        var s = GetOrCreate(sessionId);
        lock (s.Lock) return s.Assets.Count;
    }

    public async Task<MediaAsset> AddAsync(string sessionId, IFormFile file, string? restoreId = null, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var isImageExt = ImageExt.Contains(ext);
        if (!isImageExt && !VideoExt.Contains(ext) && !AudioExt.Contains(ext))
            throw new InvalidOperationException("Formato não suportado.");
        if (restoreId != null && !IsValidId(restoreId))
            throw new InvalidOperationException("ID de mídia inválido.");

        var s = GetOrCreate(sessionId);
        var asset = new MediaAsset { SessionId = sessionId, OriginalName = Path.GetFileName(file.FileName) };
        if (restoreId != null) asset.Id = restoreId;
        asset.StoredName = asset.Id + ext;
        
        lock (s.Lock)
        {
            if (s.Ended || s.Assets.Any(a => a.Id == asset.Id) || !s.Pending.Add(asset.Id))
                throw new InvalidOperationException("Essa mídia já está na coleção.");
        }

        try
        {
            Directory.CreateDirectory(FolderOf(sessionId));
            var path = PathOf(asset);

            await using (var fs = File.Create(path))
                await file.CopyToAsync(fs, ct);

            var info = await FFProbe.AnalyseAsync(path);
            var video = info.PrimaryVideoStream;
            asset.Width = video?.Width ?? 0;
            asset.Height = video?.Height ?? 0;

            if (isImageExt)
            {
                var fmt = info.Format.FormatName ?? "";
                if (video == null || info.PrimaryAudioStream != null || !(fmt == "image2" || fmt.EndsWith("_pipe", StringComparison.Ordinal)))
                    throw new InvalidOperationException("Esse arquivo não é uma imagem válida.");
                if ((long)video.Width * video.Height > MaxImagePixels)
                    throw new InvalidOperationException("Imagem grande demais (máximo 100 megapixels).");
                asset.IsImage = true;
                asset.HasAudio = false;
                asset.IsAudioOnly = false;
                asset.Duration = 0;
            }
            else
            {
                asset.Duration = Math.Round(info.Duration.TotalSeconds, 2);
                asset.HasAudio = info.PrimaryAudioStream != null;
                asset.IsAudioOnly = video == null;
            }

            if (!asset.IsAudioOnly)
                await MakeThumbAsync(path, ThumbPathOf(asset), asset.IsImage ? 0 : Math.Min(1, asset.Duration / 2));
            
            lock (s.Lock)
            {
                if (s.Ended) throw new InvalidOperationException("A sessão foi encerrada.");
                s.Assets.Add(asset);
            }
            return asset;
        }
        catch (InvalidOperationException)
        {
            DeleteFiles(asset);
            throw;
        }
        catch (OperationCanceledException)
        {
            DeleteFiles(asset);
            throw;
        }
        catch
        {
            DeleteFiles(asset);
            throw new InvalidOperationException("Não foi possível ler esse arquivo de mídia.");
        }
        finally
        {
            lock (s.Lock) s.Pending.Remove(asset.Id);
        }
    }

    public bool Delete(string sessionId, string id)
    {
        var s = Find(sessionId, touch: true);
        if (s == null) return false;
        lock (s.Lock)
        {
            var a = s.Assets.FirstOrDefault(x => x.Id == id);
            if (a == null) return false;
            s.Assets.Remove(a);
            DeleteFiles(a);
            return true;
        }
    }

    public void EndSession(string sessionId)
    {
        if (!IsValidId(sessionId)) return;
        if (_sessions.TryRemove(sessionId, out var s))
        {
            lock (s.Lock) { s.Ended = true; s.Assets.Clear(); }
        }
        DeleteFolder(FolderOf(sessionId));
    }

    public int PurgeIdle(TimeSpan idle)
    {
        var cutoff = DateTime.UtcNow - idle;
        var removed = 0;

        foreach (var (sid, s) in _sessions)
        {
            if (new DateTime(Interlocked.Read(ref s.LastSeenTicks), DateTimeKind.Utc) >= cutoff) continue;
            EndSession(sid);
            removed++;
        }

        foreach (var dir in Directory.GetDirectories(_root))
        {
            var name = Path.GetFileName(dir);
            if (!IsValidId(name) || _sessions.ContainsKey(name)) continue;
            if (Directory.GetLastWriteTimeUtc(dir) >= cutoff) continue;
            DeleteFolder(dir);
            removed++;
        }
        return removed;
    }

    private string FolderOf(string sessionId) => Path.Combine(_root, sessionId);

    private Session? Find(string sessionId, bool touch)
    {
        if (!IsValidId(sessionId) || !_sessions.TryGetValue(sessionId, out var s)) return null;
        if (touch) Interlocked.Exchange(ref s.LastSeenTicks, DateTime.UtcNow.Ticks);
        return s;
    }

    private Session GetOrCreate(string sessionId)
    {
        if (!IsValidId(sessionId)) throw new InvalidOperationException("Sessão inválida.");
        var s = _sessions.GetOrAdd(sessionId, _ => new Session());
        Interlocked.Exchange(ref s.LastSeenTicks, DateTime.UtcNow.Ticks);
        return s;
    }


    private static Task MakeThumbAsync(string input, string thumb, double seekSeconds)
        => FFMpegArguments
            .FromFileInput(input, true, o => { if (seekSeconds > 0) o.Seek(TimeSpan.FromSeconds(seekSeconds)); })
            .OutputToFile(thumb, true, o => o.WithCustomArgument(
                "-frames:v 1 -q:v 4 -vf scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2:color=black"))
            .ProcessAsynchronously();

    private void DeleteFiles(MediaAsset a)
    {
        TryDelete(PathOf(a));
        TryDelete(ThumbPathOf(a));
    }

    private static void DeleteFolder(string p) { try { if (Directory.Exists(p)) Directory.Delete(p, true); } catch { } }

    private static void TryDelete(string p) { try { if (File.Exists(p)) File.Delete(p); } catch { } }
}

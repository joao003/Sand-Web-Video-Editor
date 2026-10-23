using System.Text.Json;
using FFMpegCore;
using SandWebVideoEditor.Models;

namespace SandWebVideoEditor.Services;

public interface IMediaLibrary
{
    IReadOnlyList<MediaAsset> List();
    MediaAsset? Get(string? id);
    string PathOf(MediaAsset asset);
    Task<MediaAsset> AddAsync(IFormFile file, CancellationToken ct = default);
    bool Delete(string id);
}

public sealed class MediaLibrary : IMediaLibrary
{
    private static readonly HashSet<string> VideoExt = new(StringComparer.OrdinalIgnoreCase) { ".mp4", ".mov", ".mkv", ".webm", ".avi" };
    private static readonly HashSet<string> AudioExt = new(StringComparer.OrdinalIgnoreCase) { ".mp3", ".wav", ".m4a", ".aac", ".ogg" };
    private static readonly HashSet<string> ImageExt = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".jpeg", ".webp", ".bmp" };
    private const long MaxImagePixels = 100_000_000;
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    private readonly string _folder;
    private readonly string _indexFile;
    private readonly object _lock = new();
    private readonly List<MediaAsset> _assets;

    public MediaLibrary(IWebHostEnvironment env)
    {
        _folder = Path.Combine(env.WebRootPath, "uploads");
        Directory.CreateDirectory(_folder);
        var appData = Path.Combine(env.ContentRootPath, "App_Data");
        Directory.CreateDirectory(appData);
        _indexFile = Path.Combine(appData, "media.json");

        _assets = File.Exists(_indexFile)
            ? JsonSerializer.Deserialize<List<MediaAsset>>(File.ReadAllText(_indexFile)) ?? new()
            : new();
        _assets.RemoveAll(a => !File.Exists(Path.Combine(_folder, a.StoredName)));   // arquivo sumiu do disco
    }

    public IReadOnlyList<MediaAsset> List() { lock (_lock) return _assets.ToList(); }

    public MediaAsset? Get(string? id)
    {
        if (string.IsNullOrEmpty(id)) return null;
        lock (_lock) return _assets.FirstOrDefault(a => a.Id == id);
    }

    public string PathOf(MediaAsset asset) => Path.Combine(_folder, asset.StoredName);

    public async Task<MediaAsset> AddAsync(IFormFile file, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var isImageExt = ImageExt.Contains(ext);
        if (!isImageExt && !VideoExt.Contains(ext) && !AudioExt.Contains(ext))
            throw new InvalidOperationException("Formato não suportado.");

        var asset = new MediaAsset { OriginalName = Path.GetFileName(file.FileName) };
        asset.StoredName = asset.Id + ext;
        var path = PathOf(asset);

        await using (var fs = File.Create(path))
            await file.CopyToAsync(fs, ct);

        try
        {
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
                await MakeThumbAsync(path, Path.Combine(_folder, $"{asset.Id}_thumb.jpg"), asset.IsImage ? 0 : Math.Min(1, asset.Duration / 2));
        }
        catch (InvalidOperationException)
        {
            TryDelete(path);
            throw;
        }
        catch
        {
            TryDelete(path);
            throw new InvalidOperationException("Não foi possível ler esse arquivo de mídia.");
        }

        lock (_lock) { _assets.Add(asset); Save(); }
        return asset;
    }

    public bool Delete(string id)
    {
        lock (_lock)
        {
            var a = _assets.FirstOrDefault(x => x.Id == id);
            if (a == null) return false;
            _assets.Remove(a);
            Save();
            TryDelete(PathOf(a));
            TryDelete(Path.Combine(_folder, $"{a.Id}_thumb.jpg"));
            return true;
        }
    }

    private static Task MakeThumbAsync(string input, string thumb, double seekSeconds)
        => FFMpegArguments
            .FromFileInput(input, true, o => { if (seekSeconds > 0) o.Seek(TimeSpan.FromSeconds(seekSeconds)); })
            .OutputToFile(thumb, true, o => o.WithCustomArgument(
                "-frames:v 1 -q:v 4 -vf scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2:color=black"))
            .ProcessAsynchronously();

    private void Save() => File.WriteAllText(_indexFile, JsonSerializer.Serialize(_assets, Json));
    private static void TryDelete(string p) { try { if (File.Exists(p)) File.Delete(p); } catch { /* arquivo em uso: ignora */ } }
}

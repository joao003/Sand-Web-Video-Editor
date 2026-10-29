using System.Collections.Concurrent;
using System.Globalization;
using System.Text;
using FFMpegCore;
using FFMpegCore.Enums;
using SandWebVideoEditor.Models;

namespace SandWebVideoEditor.Services;

public sealed class TimelineRenderer
{
    private readonly IMediaLibrary _library;
    private readonly string _fontPath;
    private readonly bool _lowMemory;

    public TimelineRenderer(IMediaLibrary library, IConfiguration config, IWebHostEnvironment env)
    {
        _library = library;

        _lowMemory = config.GetValue("Editor:LowMemoryEncode", true);

        var configured = config["Editor:FontPath"] ?? "Fonts/editor.ttf";
        _fontPath = Path.IsPathRooted(configured) ? configured : Path.Combine(env.ContentRootPath, configured);
    }

    public async Task RenderAsync(RenderTimelineRequest req, string outputPath, string workDir,
                                  Action<double> onProgress, CancellationToken ct)
    {
        var (w, h) = req.Height switch { 480 => (854, 480), 1080 => (1920, 1080), 1440 => (2560, 1440), 2160 => (3840, 2160), _ => (1280, 720) };
        const int fps = 30;

        var items = Resolve(req.Items, req.SessionId);
        var hasText = items.Any(i => i.Item.Type == TrackType.Text && !string.IsNullOrWhiteSpace(i.Item.Text));
        if (hasText && !File.Exists(_fontPath))
            throw new InvalidOperationException($"Fonte dos títulos não encontrada: {_fontPath}");

        Directory.CreateDirectory(workDir);
        var plan = FilterGraphBuilder.Build(items, w, h, fps, workDir, hasText ? _fontPath : null);

        foreach (var (name, content) in plan.TextFiles)
            await File.WriteAllTextAsync(Path.Combine(workDir, name), content, new UTF8Encoding(false), ct);

        FFMpegArguments? args = null;
        foreach (var inp in plan.Inputs)
        {
            Action<FFMpegArgumentOptions> opts;
            if (inp.Lavfi)
            {
                opts = o => o.WithCustomArgument("-f lavfi");
            } else if (inp.Still)
                opts = o => o.UsingThreads(1);
            else
            {
                var seek = TimeSpan.FromMilliseconds(Math.Floor(inp.Seek * 1000 + 1e-6));
                var dur = TimeSpan.FromMilliseconds(Math.Ceiling(inp.Duration * 1000 - 1e-6) + 250);
                opts = o => o.UsingThreads(1).Seek(seek).WithDuration(dur);
            }
            var verifyExists = !inp.Lavfi;
            args = args == null
                ? FFMpegArguments.FromFileInput(inp.Path, verifyExists, opts)
                : args.AddFileInput(inp.Path, verifyExists, opts);
        }

        var total = TimeSpan.FromSeconds(plan.TotalDuration);
        var stderr = new ConcurrentQueue<string>();
        var inv = CultureInfo.InvariantCulture;
        var x264Extra = _lowMemory ? " -x264-params rc-lookahead=0:sync-lookahead=0:bframes=0" : "";

        try
        {
            await args!
                .OutputToFile(outputPath, true, o => o
                    .WithCustomArgument("-filter_complex_threads 1")
                    .WithCustomArgument($"-filter_complex \"{plan.FilterGraph}\"")
                    .WithCustomArgument($"-map \"[{plan.VideoLabel}]\" -map \"[{plan.AudioLabel}]\"")
                    .WithVideoCodec(VideoCodec.LibX264)
                    .WithConstantRateFactor(23)
                    .WithSpeedPreset(Speed.VeryFast)
                    .UsingThreads(1)
                    .WithAudioCodec(AudioCodec.Aac)
                    .WithFastStart()
                    .WithCustomArgument(string.Format(inv, "-pix_fmt yuv420p -r {0} -b:a 192k -t {1:0.###}{2}", fps, plan.TotalDuration, x264Extra)))
                .NotifyOnProgress(p => onProgress(Math.Clamp(p, 0, 100)), total)   // p = 0..100
                .NotifyOnError(line => { stderr.Enqueue(line); while (stderr.Count > 12) stderr.TryDequeue(out _); })
                .CancellableThrough(ct)
                .ProcessAsynchronously();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new InvalidOperationException("Falha no ffmpeg: " + string.Join(" | ", stderr.TakeLast(6)), ex);
        }
    }

    private List<ResolvedItem> Resolve(IEnumerable<TrackItemModel> items, string sessionId)
    {
        var list = new List<ResolvedItem>();
        foreach (var it in items)
        {
            it.Volume = Math.Clamp(double.IsFinite(it.Volume) ? it.Volume : 1, 0, 2);
            it.StartTime = Math.Max(0, double.IsFinite(it.StartTime) ? it.StartTime : 0);
            it.Duration = double.IsFinite(it.Duration) ? it.Duration : 5;
            it.TimelineStartTime = Math.Max(0, double.IsFinite(it.TimelineStartTime) ? it.TimelineStartTime : 0);
            it.TransitionDuration = double.IsFinite(it.TransitionDuration) ? it.TransitionDuration : 1;

            if (it.Type == TrackType.Text) { list.Add(new ResolvedItem(it, null, false)); continue; }

            var asset = _library.Get(sessionId, it.AssetId)
                ?? throw new InvalidOperationException("Uma mídia da timeline não existe mais na coleção. Remova o clipe ou envie o arquivo novamente.");
            if (it.Type == TrackType.Video && asset.IsAudioOnly)
                throw new InvalidOperationException($"\"{asset.OriginalName}\" é só áudio e não pode ir na trilha de vídeo.");

            if (asset.IsImage && it.Type != TrackType.Video)
                throw new InvalidOperationException($"\"{asset.OriginalName}\" é uma imagem e só pode ir na trilha de vídeo.");
            if (it.Type == TrackType.Audio && !asset.HasAudio)
                throw new InvalidOperationException($"\"{asset.OriginalName}\" não tem faixa de áudio.");

            if (!asset.IsImage)
            {
                var room = asset.Duration - it.StartTime;
                if (room > 0.2) it.Duration = Math.Min(it.Duration, room);
            }
            else it.Duration = Math.Clamp(it.Duration, 0.2, 3600);

            list.Add(new ResolvedItem(it, _library.PathOf(asset), asset.HasAudio && !asset.IsImage, asset.IsImage));
        }
        return list;
    }
}

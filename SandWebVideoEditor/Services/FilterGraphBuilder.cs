using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using SandWebVideoEditor.Models;

namespace SandWebVideoEditor.Services
{
    public sealed record FfInput(string Path, double Seek, double Duration, bool Still = false, bool Lavfi = false);

    public sealed record ResolvedItem(TrackItemModel Item, string? Path, bool HasAudio, bool IsImage = false);

    public sealed class FilterGraphPlan
    {
        public List<FfInput> Inputs { get; } = new();
        public Dictionary<string, string> TextFiles { get; } = new();
        public string FilterGraph { get; set; } = "";
        public string VideoLabel { get; set; } = "vout";
        public string AudioLabel { get; set; } = "aout";
        public double TotalDuration { get; set; }
    }

    public static class EditorCatalog
    {
        public static readonly IReadOnlyDictionary<string, string> Effects = new Dictionary<string, string>
        {
            ["grayscale"] = "hue=s=0",
            ["sepia"]     = "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
            ["bright"]    = "eq=brightness=0.15:contrast=1.1",
            ["blur"]      = "gblur=sigma=6",
            ["negate"]    = "negate",
        };

        public static readonly IReadOnlySet<string> Transitions = new HashSet<string>
        {
            "fade", "fadeblack", "dissolve", "wipeleft", "wiperight", "slideleft", "slideright", "circleopen", "pixelize",
        };

        private static readonly HashSet<string> NamedColors = new() { "white", "yellow", "red", "cyan", "black", "lime", "orange" };
        private static readonly Regex Hex = new("^#?([0-9a-fA-F]{6})$", RegexOptions.Compiled);

        public static string ColorOrWhite(string? c)
        {
            if (string.IsNullOrWhiteSpace(c)) return "white";
            c = c.Trim();
            if (NamedColors.Contains(c.ToLowerInvariant())) return c.ToLowerInvariant();
            var m = Hex.Match(c);
            return m.Success ? "0x" + m.Groups[1].Value : "white";
        }
    }

    public static class FilterGraphBuilder
    {
        private const double MinClip = 0.2;
        private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        private static string F(double v) => v.ToString("0.###", Inv);

        public static string FilterPath(string path)
            => "'" + path.Replace('\\', '/').Replace(":", "\\:").Replace("'", "'\\''") + "'";

        private sealed class Slot
        {
            public required ResolvedItem R;
            public double Start, Dur, TrIn, TrOut;
            public string Tr = "";
            public int Input;
        }

        private sealed class AudioSrc
        {
            public required ResolvedItem R;
            public double Dur;
            public int Input;
        }

        public static FilterGraphPlan Build(IReadOnlyList<ResolvedItem> items, int w, int h, int fps, string workDir, string? fontPath)
        {
            var plan = new FilterGraphPlan();
            var g = new StringBuilder();

            var slots = new List<Slot>();
            Slot? prev = null;
            double cursor = 0;

            foreach (var r in items.Where(i => i.Item.Type == TrackType.Video && i.Path != null)
                                .OrderBy(i => i.Item.TimelineStartTime))
            {
                var s = new Slot { R = r, Dur = Math.Max(MinClip, r.Item.Duration) };

                if (prev != null && r.Item.Transition is { Length: > 0 } t && EditorCatalog.Transitions.Contains(t))
                {
                    var room = Math.Min(s.Dur, prev.Dur - prev.TrIn) - 0.05;
                    var tr = Math.Clamp(r.Item.TransitionDuration, 0, Math.Max(0, room));
                    if (tr >= 0.05) { s.Tr = t; s.TrIn = tr; prev.TrOut = tr; }
                }

                s.Start = prev == null ? 0 : cursor - s.TrIn;
                cursor = s.Start + s.Dur;

                plan.Inputs.Add(r.IsImage
                    ? new FfInput(r.Path!, 0, s.Dur, Still: true)
                    : new FfInput(r.Path!, Math.Max(0, r.Item.StartTime), s.Dur));
                s.Input = plan.Inputs.Count - 1;
                slots.Add(s);
                prev = s;
            }
            double videoEnd = cursor;

            var audios = new List<AudioSrc>();
            foreach (var r in items.Where(i => i.Item.Type == TrackType.Audio && i.Path != null && !i.Item.IsMuted && i.Item.Volume > 0.001))
            {
                var a = new AudioSrc { R = r, Dur = Math.Max(MinClip, r.Item.Duration) };
                plan.Inputs.Add(new FfInput(r.Path!, Math.Max(0, r.Item.StartTime), a.Dur));
                a.Input = plan.Inputs.Count - 1;
                audios.Add(a);
            }

            var texts = items.Where(i => i.Item.Type == TrackType.Text && !string.IsNullOrWhiteSpace(i.Item.Text))
                            .OrderBy(i => i.Item.TimelineStartTime).ToList();

            double audioEnd = audios.Count == 0 ? 0 : audios.Max(a => a.R.Item.TimelineStartTime + a.Dur);
            double textEnd = texts.Count == 0 ? 0 : texts.Max(t => t.Item.TimelineStartTime + Math.Max(MinClip, t.Item.Duration));
            double total = Math.Max(videoEnd, Math.Max(audioEnd, textEnd));

            if (total <= 0.001)
                throw new InvalidOperationException("Não há nada para exportar: adicione um clipe ou um título com texto à timeline.");

            plan.TotalDuration = total;

            for (int k = 0; k < slots.Count; k++)
            {
                var s = slots[k];
                var n = Math.Max(1, (int)Math.Round(s.Dur * fps));
                if (s.R.IsImage)
                {
                    g.Append($"color=c=black:s={w}x{h}:r={fps}:d={F(s.Dur + 1)}[bg{k}];")
                    .Append($"[{s.Input}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,format=rgba,loop=loop=-1:size=1:start=0,")
                    .Append($"setpts=N/({fps}*TB),fps={fps},trim=end_frame={n}[im{k}];")
                    .Append($"[bg{k}][im{k}]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1,setsar=1");
                }
                else
                {
                    g.Append($"[{s.Input}:v]setpts='PTS-STARTPTS+max(0,min(STARTPTS,0.1/TB))',fps={fps}:start_time=0,")
                    .Append($"tpad=stop_mode=clone:stop_duration={F(s.Dur)},trim=end_frame={n},")
                    .Append($"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1");
                }
                if (EditorCatalog.Effects.TryGetValue(s.R.Item.Effect ?? "", out var fx)) g.Append(',').Append(fx);
                g.Append($",format=yuv420p[v{k}];");
            }

            string acc;
            if (slots.Count == 0)
            {
                if (plan.Inputs.Count == 0)
                {
                    plan.Inputs.Add(new FfInput($"color=c=black:s={w}x{h}:r={fps}:d={F(total)}", 0, total, Lavfi: true));
                    g.Append("[0:v]format=yuv420p[v0];");
                }
                else
                {
                    g.Append($"color=c=black:s={w}x{h}:r={fps}:d={F(total)},format=yuv420p[v0];");
                }
                acc = "v0";
            }
            else
            {
                acc = "v0";
                for (int k = 1; k < slots.Count; k++)
                {
                    var s = slots[k];
                    var next = $"x{k}";
                    if (s.Tr != "")
                        g.Append($"[{acc}][v{k}]xfade=transition={s.Tr}:duration={F(s.TrIn)}:offset={F(s.Start)}[{next}];");
                    else
                        g.Append($"[{acc}][v{k}]concat=n=2:v=1:a=0,settb=1/{fps}[{next}];");
                    acc = next;
                }
                if (total - videoEnd > 0.02)
                {
                    g.Append($"[{acc}]tpad=stop_mode=add:stop_duration={F(total - videoEnd)}:color=black[vpad];");
                    acc = "vpad";
                }
            }

            if (texts.Count > 0 && string.IsNullOrEmpty(fontPath))
                throw new InvalidOperationException("Nenhuma fonte .ttf configurada para os títulos (Editor:FontPath).");

            for (int j = 0; j < texts.Count; j++)
            {
                var t = texts[j].Item;
                var file = $"t{j}.txt";
                plan.TextFiles[file] = (t.Text ?? "").Replace("\r\n", "\n");

                var y = t.TextPosition switch { "top" => "h*0.08", "bottom" => "h-text_h-h*0.08", _ => "(h-text_h)/2" };
                var start = Math.Max(0, t.TimelineStartTime);
                var end = start + Math.Max(MinClip, t.Duration);
                var size = Math.Clamp(t.FontSize, 10, 200);

                g.Append($"[{acc}]drawtext=fontfile={FilterPath(fontPath!)}:textfile={FilterPath(System.IO.Path.Combine(workDir, file))}:expansion=none")
                .Append($":fontsize={size}:fontcolor={EditorCatalog.ColorOrWhite(t.FontColor)}:borderw=2:bordercolor=black@0.8")
                .Append($":x=(w-text_w)/2:y={y}:enable='between(t,{F(start)},{F(end)})'[tx{j}];");
                acc = $"tx{j}";
            }
            plan.VideoLabel = acc;

            var labels = new List<string>();

            string AudioChain(int input, double volume, double delaySeconds, double fadeIn, double fadeOut, double dur)
            {
                var sb = new StringBuilder($"[{input}:a]atrim=duration={F(dur)},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS");
                if (Math.Abs(volume - 1.0) > 0.001) sb.Append($",volume={F(volume)}");
                if (fadeIn > 0)  sb.Append($",afade=t=in:st=0:d={F(fadeIn)}");
                if (fadeOut > 0) sb.Append($",afade=t=out:st={F(dur - fadeOut)}:d={F(fadeOut)}");
                var ms = (int)Math.Round(Math.Max(0, delaySeconds) * 1000);
                sb.Append($",adelay={ms}|{ms},apad=whole_dur={F(total)}");
                return sb.ToString();
            }

            foreach (var s in slots)
            {
                var it = s.R.Item;
                if (s.R.IsImage || !s.R.HasAudio || it.IsMuted || it.Volume <= 0.001) continue;
                var label = $"a{labels.Count}";
                g.Append(AudioChain(s.Input, Math.Clamp(it.Volume, 0, 2), s.Start, s.TrIn, s.TrOut, s.Dur)).Append($"[{label}];");
                labels.Add(label);
            }
            foreach (var a in audios)
            {
                var label = $"a{labels.Count}";
                g.Append(AudioChain(a.Input, Math.Clamp(a.R.Item.Volume, 0, 2), a.R.Item.TimelineStartTime, 0, 0, a.Dur)).Append($"[{label}];");
                labels.Add(label);
            }

            if (labels.Count == 0)
                g.Append($"anullsrc=r=48000:cl=stereo:d={F(total)}[aout]");
            else if (labels.Count == 1)
                g.Append($"[{labels[0]}]alimiter=limit=0.97:level=0[aout]");
            else
                g.Append(string.Concat(labels.Select(l => $"[{l}]")))
                .Append($"amix=inputs={labels.Count}:duration=longest:dropout_transition=0,volume={labels.Count},alimiter=limit=0.97:level=0[aout]");

            plan.FilterGraph = g.ToString();
            return plan;
        }
    }
}

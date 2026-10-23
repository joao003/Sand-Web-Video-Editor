namespace SandWebVideoEditor.Models
{
    public enum TrackType
    {
        Video = 0,
        Audio = 1,
        Text = 2
    }

    public class TrackItemModel
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public TrackType Type { get; set; } = TrackType.Video;

        public string? AssetId { get; set; }
        public string MediaUrl { get; set; } = string.Empty;
        public bool IsImage { get; set; }

        public double TimelineStartTime { get; set; } = 0;
        public double StartTime { get; set; } = 0;
        public double Duration { get; set; } = 5;

        public double Volume { get; set; } = 1.0;
        public bool IsMuted { get; set; } = false;

        public string? Effect { get; set; }
        public string? Transition { get; set; }
        public double TransitionDuration { get; set; } = 1.0;

        public string? Text { get; set; }
        public int FontSize { get; set; } = 36;
        public string FontColor { get; set; } = "white";
        public string TextPosition { get; set; } = "center";
    }

    public class ProjectModel
    {
        public string ProjectName { get; set; } = "Novo Projeto";
        public List<TrackItemModel> Items { get; set; } = new();
    }

    public class RenderTimelineRequest
    {
        public List<TrackItemModel> Items { get; set; } = new();
        public int Height { get; set; } = 720;
    }

    public class MediaAsset
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string OriginalName { get; set; } = string.Empty;
        public string StoredName { get; set; } = string.Empty;
        public bool IsAudioOnly { get; set; }
        public bool IsImage { get; set; }
        public bool HasAudio { get; set; }
        public double Duration { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }

        public string Url => $"/uploads/{StoredName}";
        public string? ThumbUrl => IsAudioOnly ? null : $"/uploads/{Id}_thumb.jpg";
    }
}

using System.Text;
using System.Text.RegularExpressions;

namespace SandWebVideoEditor.Services;

public static class ExportFileName
{
    public const string Default = "video-editado";
    private const int MaxLength = 100;
    private const string Forbidden = "\\/:*?\"<>|";

    private static string Clean(string name)
    {
        name = Regex.Replace(name, @"\s+", " ");
        name = Regex.Replace(name, "-{2,}", "-");
        return name.Trim(' ', '.', '-');
    }

    private static string Finish(string name)
    {
        while (true)
        {
            var before = name;
            while (name.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase)) name = name[..^4];
            name = Clean(name);
            if (name == before) return name;
        }
    }

    public static string Sanitize(string? raw)
    {
        var sb = new StringBuilder();
        foreach (var ch in raw ?? string.Empty)
            sb.Append(char.IsControl(ch) || Forbidden.Contains(ch) ? '-' : ch);

        var name = Finish(sb.ToString());

        if (name.Length > MaxLength)
        {
            name = name[..MaxLength];
            if (char.IsHighSurrogate(name[^1])) name = name[..^1];
            name = Finish(name);
        }

        return (name.Length == 0 ? Default : name) + ".mp4";
    }
}

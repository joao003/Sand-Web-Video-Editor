namespace SandWebVideoEditor.Services;

public sealed class MediaCleanupService : BackgroundService
{
    private readonly IMediaLibrary _library;
    private readonly ILogger<MediaCleanupService> _log;
    private readonly TimeSpan _idle;

    public MediaCleanupService(IMediaLibrary library, IConfiguration config, ILogger<MediaCleanupService> log)
    {
        _library = library;
        _log = log;
        _idle = TimeSpan.FromMinutes(Math.Max(1, config.GetValue<int>("Media:IdleMinutes", 30)));
    }

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stop))
            {
                try
                {
                    var removed = _library.PurgeIdle(_idle);
                    if (removed > 0) _log.LogInformation("Coleções temporárias apagadas por inatividade: {Count}", removed);
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Falha ao limpar as coleções temporárias");
                }
            }
        }
        catch (OperationCanceledException) { }
    }
}

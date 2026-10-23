using System.Collections.Concurrent;
using System.Threading.Channels;
using SandWebVideoEditor.Models;

namespace SandWebVideoEditor.Services;

public enum JobState { Queued, Running, Done, Failed }

public sealed class RenderJob
{
    public string Id { get; } = Guid.NewGuid().ToString("N");
    public JobState State { get; set; } = JobState.Queued;
    public double Progress { get; set; }
    public string? Error { get; set; }
    public string OutputPath { get; set; } = "";
    public DateTime CreatedUtc { get; } = DateTime.UtcNow;
    public required RenderTimelineRequest Request { get; init; }
}

public sealed class RenderJobService : BackgroundService
{
    private readonly Channel<RenderJob> _queue = Channel.CreateUnbounded<RenderJob>();
    private readonly ConcurrentDictionary<string, RenderJob> _jobs = new();
    private readonly TimelineRenderer _renderer;
    private readonly ILogger<RenderJobService> _log;
    private readonly string _rendersDir;
    private readonly string _jobsDir;

    public RenderJobService(TimelineRenderer renderer, IWebHostEnvironment env, ILogger<RenderJobService> log)
    {
        _renderer = renderer;
        _log = log;

        _rendersDir = Path.Combine(env.ContentRootPath, "App_Data", "renders");
        _jobsDir = Path.Combine(env.ContentRootPath, "App_Data", "jobs");
        Directory.CreateDirectory(_rendersDir);
        Directory.CreateDirectory(_jobsDir);
    }

    public RenderJob Enqueue(RenderTimelineRequest request)
    {
        CleanupOld();
        var job = new RenderJob { Request = request };
        job.OutputPath = Path.Combine(_rendersDir, job.Id + ".mp4");
        _jobs[job.Id] = job;
        _queue.Writer.TryWrite(job);
        return job;
    }

    public RenderJob? Get(string id) => _jobs.TryGetValue(id, out var j) ? j : null;

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        await foreach (var job in _queue.Reader.ReadAllAsync(stop))
        {
            var work = Path.Combine(_jobsDir, job.Id);
            try
            {
                job.State = JobState.Running;
                await _renderer.RenderAsync(job.Request, job.OutputPath, work, p => job.Progress = p, stop);
                job.Progress = 100;
                job.State = JobState.Done;
            }
            catch (OperationCanceledException) { job.State = JobState.Failed; job.Error = "Cancelado."; }
            catch (Exception ex)
            {
                _log.LogError(ex, "Render {Id} falhou", job.Id);
                job.State = JobState.Failed;
                job.Error = ex.Message;
            }
            finally
            {
                try { if (Directory.Exists(work)) Directory.Delete(work, true); } catch { }
            }
        }
    }

    private void CleanupOld()
    {
        var old = _jobs.Values
            .Where(j => (j.State == JobState.Done || j.State == JobState.Failed) && DateTime.UtcNow - j.CreatedUtc > TimeSpan.FromHours(2))
            .ToList();
        foreach (var j in old)
        {
            try { if (File.Exists(j.OutputPath)) File.Delete(j.OutputPath); } catch { }
            _jobs.TryRemove(j.Id, out _);
        }
    }
}

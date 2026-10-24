using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using SandWebVideoEditor.Models;
using SandWebVideoEditor.Services;

namespace SandWebVideoEditor.Controllers;

public class HomeController : Controller
{
    private readonly IMediaLibrary _library;
    private readonly RenderJobService _jobs;

    public HomeController(IMediaLibrary library, RenderJobService jobs)
    {
        _library = library;
        _jobs = jobs;
    }

    public IActionResult Index() {
        return View();
    }

    private string? SessionId()
    {
        var sid = Request.Headers["X-Sand-Session"].FirstOrDefault() ?? Request.Query["sid"].FirstOrDefault();
        return MediaLibrary.IsValidId(sid) ? sid : null;
    }

    [HttpGet]
    public IActionResult Media() {
        var sid = SessionId();
        if (sid == null) return BadRequest("Sessão inválida.");
        return Json(_library.List(sid));
    }

    [HttpPost]
    [RequestSizeLimit(2_000_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 2_000_000_000)]
    public async Task<IActionResult> UploadMedia(IFormFile file, string? restoreId, CancellationToken ct)
    {
        var sid = SessionId();
        if (sid == null) return BadRequest("Sessão inválida.");
        if (file == null || file.Length == 0) return BadRequest("Arquivo inválido.");
        try { return Json(await _library.AddAsync(sid, file, restoreId, ct)); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [HttpPost]
    public IActionResult DeleteMedia(string id) {
        var sid = SessionId();
        if (sid == null) return BadRequest("Sessão inválida.");
        return _library.Delete(sid, id) ? Ok() : NotFound();
    }

    [HttpPost]
    public IActionResult Ping()
    {
        var sid = SessionId();
        if (sid == null) return BadRequest("Sessão inválida.");
        return Json(new { count = _library.Ping(sid) });
    }

    [HttpPost]
    public IActionResult EndSession()
    {
        var sid = SessionId();
        if (sid != null) _library.EndSession(sid);
        return NoContent();
    }

    [HttpPost]
    public IActionResult RenderVideo([FromBody] RenderTimelineRequest request)
    {
        var sid = SessionId();
        if (sid == null) return BadRequest("Sessão inválida.");
        if (request.Items == null || request.Items.Count == 0) return BadRequest("A timeline está vazia.");
        if (request.Items.Count > 200) return BadRequest("Itens demais na timeline.");

        request.SessionId = sid;
        _library.Ping(sid);
        
        var job = _jobs.Enqueue(request);
        return Accepted(new { jobId = job.Id });
    }

    [HttpGet]
    public IActionResult RenderStatus(string id)
    {
        var job = _jobs.Get(id);
        if (job == null) return NotFound();
        return Json(new
        {
            state = job.State.ToString(),
            progress = Math.Round(job.Progress, 1),
            error = job.Error,
            url = job.State == JobState.Done ? Url.Action(nameof(Download), new { id = job.Id }) : null
        });
    }

    [HttpGet]
    public IActionResult Download(string id, bool attachment = false)
    {
        var job = _jobs.Get(id);
        if (job is not { State: JobState.Done } || !System.IO.File.Exists(job.OutputPath)) return NotFound();
        return PhysicalFile(job.OutputPath, "video/mp4", attachment ? "video-editado.mp4" : null, enableRangeProcessing: true);
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}

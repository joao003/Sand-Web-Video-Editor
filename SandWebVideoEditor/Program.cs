using FFMpegCore;
using Microsoft.AspNetCore.Http.Features;
using SandWebVideoEditor.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

GlobalFFOptions.Configure(o => o.BinaryFolder = builder.Configuration["FFmpeg:BinaryFolder"] ?? "");

builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 2_000_000_000L);
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 2_000_000_000L);

builder.Services.AddSingleton<IMediaLibrary, MediaLibrary>();
builder.Services.AddSingleton<TimelineRenderer>();
builder.Services.AddSingleton<RenderJobService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<RenderJobService>());

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseBlazorFrameworkFiles();

app.UseStaticFiles();

app.UseHttpsRedirection();

app.UseRouting();

app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();

namespace InvAgent.Api;

using System.Runtime.InteropServices;
using InvAgent.Collectors;
using InvAgent.Config;
using InvAgent.Http;
using InvAgent.Queue;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

/// <summary>
/// Local diagnostic web UI served at 127.0.0.1:8787.
/// Provides status, hardware info, config, logs, queue info, and network test.
/// </summary>
public static class LocalWebApi
{
    public static async Task StartAsync(
        AgentConfig config,
        IServiceProvider services,
        LocalQueue queue,
        ICollector collector,
        MeridianApiClient api)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls($"http://127.0.0.1:{config.LocalWebUiPort}");

        // Use static files from wwwroot embedded next to the binary
        var webRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (!Directory.Exists(webRootPath))
            webRootPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");

        builder.WebHost.UseWebRoot(webRootPath);

        var app = builder.Build();
        app.UseDefaultFiles();
        app.UseStaticFiles();

        app.MapLocalApi(config, queue, collector, api);

        await app.RunAsync();
    }

    public static void MapLocalApi(
        this WebApplication app,
        AgentConfig config,
        LocalQueue queue,
        ICollector collector,
        MeridianApiClient api)
    {
        // GET /api/status — enrollment state + connectivity
        app.MapGet("/api/status", async () =>
        {
            var latency = await api.TestConnectivityAsync();
            return new
            {
                enrolled = !string.IsNullOrEmpty(config.AgentKey),
                serverUrl = config.ServerUrl,
                privacyTier = config.PrivacyTier,
                connected = latency >= 0,
                latencyMs = latency,
                platform = RuntimeInformation.OSDescription,
                agentVersion = typeof(LocalWebApi).Assembly.GetName().Version?.ToString() ?? "1.0.0",
            };
        });

        // GET /api/hardware — current hardware snapshot
        app.MapGet("/api/hardware", async () =>
        {
            try
            {
                var payload = await collector.CollectAsync();
                return Results.Ok(payload.Hardware);
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        // GET /api/config — current agent configuration (safe subset)
        app.MapGet("/api/config", () => new
        {
            serverUrl = config.ServerUrl,
            privacyTier = config.PrivacyTier,
            heartbeatIntervalSeconds = config.HeartbeatIntervalSeconds,
            inventoryIntervalSeconds = config.InventoryIntervalSeconds,
            localWebUiPort = config.LocalWebUiPort,
            localQueueMaxSizeMb = config.LocalQueueMaxSizeMb,
            logLevel = config.LogLevel,
            enrolled = !string.IsNullOrEmpty(config.AgentKey),
            hasProxy = !string.IsNullOrEmpty(config.HttpProxy),
        });

        // GET /api/queue — queue depth and items
        app.MapGet("/api/queue", () => new
        {
            count = queue.Count,
            sizeBytes = queue.SizeBytes,
            items = queue.PeekAll(),
        });

        // GET /api/logs — last 100 lines from log file (platform-specific path)
        app.MapGet("/api/logs", () =>
        {
            try
            {
                var logPath = GetLogPath();
                if (!File.Exists(logPath))
                    return Results.Ok(new { lines = Array.Empty<string>(), path = logPath });

                var lines = File.ReadAllLines(logPath);
                var last100 = lines.Length > 100 ? lines[^100..] : lines;
                return Results.Ok(new { lines = last100, path = logPath });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { lines = new[] { $"Error reading logs: {ex.Message}" }, path = "" });
            }
        });

        // POST /api/collect — trigger a manual inventory collection (fire-and-forget)
        app.MapPost("/api/collect", async () =>
        {
            try
            {
                var payload = await collector.CollectAsync();
                return Results.Ok(new
                {
                    success = true,
                    hostname = payload.Hostname,
                    softwareCount = payload.Software.Count,
                    collectedAt = payload.CollectedAt,
                });
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        // POST /api/network-test — HEAD request to server, return latency
        app.MapPost("/api/network-test", async () =>
        {
            var latency = await api.TestConnectivityAsync();
            return new
            {
                connected = latency >= 0,
                latencyMs = latency,
                serverUrl = config.ServerUrl,
            };
        });
    }

    private static string GetLogPath()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Meridian", "logs", "agent.log");
        return "/var/log/meridian-agent/agent.log";
    }
}

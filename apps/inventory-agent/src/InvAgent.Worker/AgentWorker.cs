namespace InvAgent.Worker;

using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.Json;
using InvAgent.Collectors;
using InvAgent.Config;
using InvAgent.Http;
using InvAgent.Models;
using InvAgent.Privacy;
using InvAgent.Queue;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

/// <summary>
/// Background worker that drives the heartbeat loop and inventory collection loop.
/// Both loops are server-driven: the server returns <c>nextHeartbeatAt</c> /
/// <c>nextInventoryAt</c> timestamps and the agent schedules accordingly.
/// Falls back to local configured intervals when the server field is absent or
/// unparseable (e.g. during an offline period or against an older server).
///
/// A random startup jitter (0–60 s) is applied before the first inventory run to
/// prevent thundering-herd when many agents restart simultaneously.
/// </summary>
public class AgentWorker : BackgroundService
{
    private readonly ICollector _collector;
    private readonly MeridianApiClient _api;
    private readonly LocalQueue _queue;
    private readonly AgentConfig _config;
    private readonly ILogger<AgentWorker> _logger;
    private readonly UpdateChecker _updateChecker;
    private readonly UpdateInstaller _updateInstaller;
    private readonly EventReporter _eventReporter;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public AgentWorker(
        ICollector collector,
        MeridianApiClient api,
        LocalQueue queue,
        IOptions<AgentConfig> config,
        ILogger<AgentWorker> logger,
        UpdateChecker updateChecker,
        UpdateInstaller updateInstaller,
        EventReporter eventReporter)
    {
        _collector = collector;
        _api = api;
        _queue = queue;
        _config = config.Value;
        _logger = logger;
        _updateChecker = updateChecker;
        _updateInstaller = updateInstaller;
        _eventReporter = eventReporter;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation("AgentWorker starting. HeartbeatInterval={Heartbeat}s, InventoryInterval={Inventory}s",
            _config.HeartbeatIntervalSeconds, _config.InventoryIntervalSeconds);

        // Step 1: Enroll if needed
        if (string.IsNullOrEmpty(_config.AgentKey) && !string.IsNullOrEmpty(_config.EnrollmentToken))
        {
            await TryEnrollAsync(ct);
        }

        // Step 2: Flush any offline queue from previous session
        try
        {
            await _queue.FlushAsync(_api, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to flush offline queue on startup — server may be unreachable.");
        }

        // Step 3: Startup jitter — stagger first inventory across the agent fleet
        var startupJitterMs = (int)(Random.Shared.NextDouble() * 60_000);
        _logger.LogInformation("Startup jitter: delaying first inventory by {Ms}ms ({Seconds:F1}s).",
            startupJitterMs, startupJitterMs / 1000.0);
        await Task.Delay(startupJitterMs, ct);

        // Step 4: Run initial inventory immediately; use the server-advised delay
        //         as the first inter-cycle wait for the inventory loop.
        var initialInventoryDelay = await RunInventoryCycleAsync(ct);

        // Step 5: Start both loops concurrently (no PeriodicTimer — loops are Task.Delay-driven)
        var heartbeatTask = RunHeartbeatLoopAsync(ct);
        var inventoryTask = RunInventoryLoopAsync(initialInventoryDelay, ct);

        await Task.WhenAll(heartbeatTask, inventoryTask);
    }

    // -------------------------------------------------------------------------
    // Heartbeat loop
    // -------------------------------------------------------------------------

    private async Task RunHeartbeatLoopAsync(CancellationToken ct)
    {
        _logger.LogInformation("Heartbeat loop started (interval={Seconds}s).", _config.HeartbeatIntervalSeconds);
        var nextDelay = TimeSpan.FromSeconds(_config.HeartbeatIntervalSeconds);
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(nextDelay, ct);
                nextDelay = await SendHeartbeatAsync(ct);
            }
            _logger.LogInformation("Heartbeat loop stopping (cancellation requested).");
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Heartbeat loop stopping (cancellation requested).");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Heartbeat loop terminated by unhandled exception.");
        }
    }

    // -------------------------------------------------------------------------
    // Inventory loop
    // -------------------------------------------------------------------------

    private async Task RunInventoryLoopAsync(TimeSpan initialDelay, CancellationToken ct)
    {
        _logger.LogInformation("Inventory loop started (interval={Seconds}s).", _config.InventoryIntervalSeconds);
        var nextDelay = initialDelay;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(nextDelay, ct);
                nextDelay = await RunInventoryCycleAsync(ct);
            }
            _logger.LogInformation("Inventory loop stopping (cancellation requested).");
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Inventory loop stopping (cancellation requested).");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Inventory loop terminated by unhandled exception.");
        }
    }

    // -------------------------------------------------------------------------
    // Heartbeat — returns the delay to use before the next heartbeat
    // -------------------------------------------------------------------------

    /// <summary>
    /// Sends a heartbeat and returns the delay to use before the next one.
    /// Uses the server-advised <c>nextHeartbeatAt</c> when present; otherwise
    /// falls back to <see cref="AgentConfig.HeartbeatIntervalSeconds"/>.
    /// Exceptions are caught and logged — the worker never crashes.
    /// </summary>
    private async Task<TimeSpan> SendHeartbeatAsync(CancellationToken ct)
    {
        var defaultDelay = TimeSpan.FromSeconds(_config.HeartbeatIntervalSeconds);
        try
        {
            _logger.LogInformation("Sending heartbeat...");
            var payload = new HeartbeatPayload
            {
                AgentVersion = GetAgentVersion(),
                Metrics = new Dictionary<string, object>
                {
                    ["queueCount"] = _queue.Count,
                    ["queueSizeBytes"] = _queue.SizeBytes,
                    ["platform"] = RuntimeInformation.OSDescription,
                }
            };
            var response = await _api.SendHeartbeatAsync(payload, ct);
            _logger.LogDebug("Heartbeat sent successfully.");

            // Flush any buffered events alongside the heartbeat.
            try { await _eventReporter.FlushAsync(ct); }
            catch (Exception flushEx) { _logger.LogWarning(flushEx, "Event flush failed — will retry next heartbeat."); }

            // Consume the update included in the heartbeat response directly.
            var updateInfo = response?.Update;
            if (updateInfo != null)
            {
                _logger.LogInformation("Applying update to {Version}...", updateInfo.LatestVersion);
                await _updateInstaller.InstallUpdateAsync(updateInfo, ct);
            }

            // Parse server-advised next heartbeat time
            if (response?.NextHeartbeatAt is string nextHbAt
                && DateTime.TryParse(nextHbAt, null, DateTimeStyles.RoundtripKind, out var nextHbTime))
            {
                var now = DateTime.UtcNow;
                if (nextHbTime > now)
                {
                    var delay = nextHbTime - now;
                    if (delay >= TimeSpan.FromSeconds(30))
                    {
                        _logger.LogDebug("Server advised next heartbeat in {Seconds:F0}s.", delay.TotalSeconds);
                        return delay;
                    }
                }
            }

            return defaultDelay;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Heartbeat failed — will retry after default interval.");
            return defaultDelay;
        }
    }

    // -------------------------------------------------------------------------
    // Inventory cycle — returns the delay to use before the next cycle
    // -------------------------------------------------------------------------

    /// <summary>
    /// Runs a full inventory collection cycle: collect → privacy filter → submit → CMDB sync → flush queue.
    /// Returns the server-advised delay until the next run, or the local default on any failure.
    /// </summary>
    private async Task<TimeSpan> RunInventoryCycleAsync(CancellationToken ct)
    {
        var defaultDelay = TimeSpan.FromSeconds(_config.InventoryIntervalSeconds);
        try
        {
            _logger.LogInformation("Running inventory collection...");

            var payload = await _collector.CollectAsync(ct);
            var filtered = PrivacyFilter.Apply(payload, _config.PrivacyTier);

            InventorySubmitResponse? submitResult = null;
            bool submitted = false;
            try
            {
                submitResult = await _api.SubmitInventoryAsync(filtered, ct);
                if (submitResult != null)
                {
                    _logger.LogInformation("Inventory submitted. SnapshotId={SnapshotId}", submitResult.SnapshotId);
                    submitted = true;
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Inventory submission failed — queuing for retry.");
            }

            if (!submitted)
            {
                var json = JsonSerializer.Serialize(filtered, JsonOptions);
                _queue.Enqueue("inventory", json);
                _logger.LogInformation("Inventory queued. Queue depth: {Count}", _queue.Count);
                return defaultDelay;
            }

            // Submission succeeded — run CMDB sync
            try
            {
                await _api.SubmitCmdbSyncAsync(filtered, ct);
                _logger.LogDebug("CMDB sync submitted.");
            }
            catch (Exception cmdbEx)
            {
                _logger.LogWarning(cmdbEx, "CMDB sync failed — inventory was still stored.");
            }

            // Drain any previously queued items
            try
            {
                await _queue.FlushAsync(_api, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to flush offline queue after successful inventory.");
            }

            // Parse server-advised next inventory time
            if (submitResult?.NextInventoryAt is string nextAt
                && DateTime.TryParse(nextAt, null, DateTimeStyles.RoundtripKind, out var nextTime))
            {
                var now = DateTime.UtcNow;
                if (nextTime > now)
                {
                    var delay = nextTime - now;
                    if (delay >= TimeSpan.FromSeconds(30))
                    {
                        _logger.LogInformation("Server advised next inventory in {Minutes:F1}min.", delay.TotalMinutes);
                        return delay;
                    }
                }
            }

            return defaultDelay;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during inventory cycle.");
            return defaultDelay;
        }
    }

    // -------------------------------------------------------------------------
    // Enrollment
    // -------------------------------------------------------------------------

    private async Task TryEnrollAsync(CancellationToken ct)
    {
        try
        {
            _logger.LogInformation("Enrolling agent with token...");
            var hostname = System.Net.Dns.GetHostName();
            var platform = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "WINDOWS"
                : RuntimeInformation.IsOSPlatform(OSPlatform.Linux) ? "LINUX"
                : "MACOS";

            var result = await _api.EnrollAsync(
                _config.EnrollmentToken!,
                hostname,
                platform,
                GetAgentVersion(),
                ct);

            if (result != null && !string.IsNullOrEmpty(result.AgentKey))
            {
                _config.AgentKey = result.AgentKey;
                _api.SetAgentKey(result.AgentKey);
                _logger.LogInformation("Enrollment successful. AgentKey stored.");
                await PersistAgentKeyAsync(result.AgentKey, ct);
            }
            else
            {
                _logger.LogWarning("Enrollment failed — server did not return an agent key.");
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Enrollment error.");
        }
    }

    private static async Task PersistAgentKeyAsync(string agentKey, CancellationToken ct)
    {
        var configPath = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Meridian", "config.json")
            : "/etc/meridian-agent/config.json";

        try
        {
            var dir = Path.GetDirectoryName(configPath);
            if (dir != null) Directory.CreateDirectory(dir);

            Dictionary<string, object> configData;
            if (File.Exists(configPath))
            {
                var existing = await File.ReadAllTextAsync(configPath, ct);
                configData = JsonSerializer.Deserialize<Dictionary<string, object>>(existing)
                    ?? new Dictionary<string, object>();
            }
            else
            {
                configData = new Dictionary<string, object>();
            }

            if (!configData.ContainsKey("AgentConfig"))
                configData["AgentConfig"] = new Dictionary<string, object>();

            var agentConfigSection = JsonSerializer.Deserialize<Dictionary<string, object>>(
                JsonSerializer.Serialize(configData["AgentConfig"]))
                ?? new Dictionary<string, object>();

            agentConfigSection["AgentKey"] = agentKey;
            configData["AgentConfig"] = agentConfigSection;

            var json = JsonSerializer.Serialize(configData, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(configPath, json, ct);
        }
        catch (Exception ex)
        {
            // Non-fatal — agent key is already set in memory
            Console.Error.WriteLine($"Warning: Could not persist agent key to config file: {ex.Message}");
        }
    }

    private static string GetAgentVersion()
    {
        return typeof(AgentWorker).Assembly.GetName().Version?.ToString() ?? "1.0.0";
    }
}

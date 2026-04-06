namespace InvAgent.Worker;

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
/// Background worker that drives the heartbeat timer (every 5 min) and inventory
/// collection timer (every 4 hr). On startup it flushes any offline-queued items
/// and handles initial enrollment if an EnrollmentToken is set.
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
        UpdateInstaller updateInstaller)
    {
        _collector = collector;
        _api = api;
        _queue = queue;
        _config = config.Value;
        _logger = logger;
        _updateChecker = updateChecker;
        _updateInstaller = updateInstaller;
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

        var heartbeatInterval = TimeSpan.FromSeconds(_config.HeartbeatIntervalSeconds);
        var inventoryInterval = TimeSpan.FromSeconds(_config.InventoryIntervalSeconds);

        // Run initial inventory immediately on first start
        await RunInventoryCycleAsync(ct);

        var lastHeartbeat = DateTime.UtcNow;
        var lastInventory = DateTime.UtcNow;

        using var heartbeatTimer = new PeriodicTimer(heartbeatInterval);
        using var inventoryTimer = new PeriodicTimer(inventoryInterval);

        // Run both timers concurrently via tasks
        var heartbeatTask = RunHeartbeatLoopAsync(heartbeatTimer, ct);
        var inventoryTask = RunInventoryLoopAsync(inventoryTimer, ct);

        await Task.WhenAll(heartbeatTask, inventoryTask);
    }

    private async Task RunHeartbeatLoopAsync(PeriodicTimer timer, CancellationToken ct)
    {
        while (await timer.WaitForNextTickAsync(ct).ConfigureAwait(false))
        {
            await SendHeartbeatAsync(ct);
        }
    }

    private async Task RunInventoryLoopAsync(PeriodicTimer timer, CancellationToken ct)
    {
        while (await timer.WaitForNextTickAsync(ct).ConfigureAwait(false))
        {
            await RunInventoryCycleAsync(ct);
        }
    }

    /// <summary>
    /// Sends a heartbeat to the server. Exceptions are caught and logged — never crash the worker.
    /// </summary>
    private async Task SendHeartbeatAsync(CancellationToken ct)
    {
        try
        {
            _logger.LogDebug("Sending heartbeat...");
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

            // Check for updates after successful heartbeat
            var updateInfo = await _updateChecker.CheckForUpdateAsync(ct);
            if (updateInfo != null)
            {
                _logger.LogInformation("Applying update to {Version}...", updateInfo.LatestVersion);
                await _updateInstaller.InstallUpdateAsync(updateInfo, ct);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Heartbeat failed — will retry next interval.");
        }
    }

    /// <summary>
    /// Runs a full inventory collection cycle: collect, apply privacy filter,
    /// try to submit to server; queue on failure. On success, flush any queued items.
    /// </summary>
    private async Task RunInventoryCycleAsync(CancellationToken ct)
    {
        try
        {
            _logger.LogInformation("Running inventory collection...");

            var payload = await _collector.CollectAsync(ct);
            var filtered = PrivacyFilter.Apply(payload, _config.PrivacyTier);

            bool submitted = false;
            try
            {
                var snapshotId = await _api.SubmitInventoryAsync(filtered, ct);
                _logger.LogInformation("Inventory submitted. SnapshotId={SnapshotId}", snapshotId);

                try
                {
                    await _api.SubmitCmdbSyncAsync(filtered, ct);
                    _logger.LogDebug("CMDB sync submitted.");
                }
                catch (Exception cmdbEx)
                {
                    _logger.LogWarning(cmdbEx, "CMDB sync failed — inventory was still stored.");
                }

                submitted = true;
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
            }
            else
            {
                // Submission succeeded — try to drain any previously queued items
                try
                {
                    await _queue.FlushAsync(_api, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to flush offline queue after successful inventory.");
                }
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during inventory cycle.");
        }
    }

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
                // Persist to platform config path
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

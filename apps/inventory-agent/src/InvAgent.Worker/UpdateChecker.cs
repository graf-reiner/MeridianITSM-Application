namespace InvAgent.Worker;

using InvAgent.Config;
using InvAgent.Models;
using Microsoft.Extensions.Logging;

public class UpdateChecker
{
    private readonly AgentConfig _config;
    private readonly ILogger<UpdateChecker> _logger;

    public UpdateChecker(AgentConfig config, ILogger<UpdateChecker> logger)
    {
        _config = config;
        _logger = logger;
    }

    public UpdateInfo? CheckForUpdate(HeartbeatResponse? response)
    {
        if (response?.Update == null)
            return null;

        if (!_config.AutoUpdateEnabled)
        {
            _logger.LogInformation("Update available ({Version}) but AutoUpdateEnabled is false — skipping.",
                response.Update.LatestVersion);
            return null;
        }

        var currentVersion = GetCurrentVersion();
        var latestVersion = response.Update.LatestVersion;

        if (string.Compare(latestVersion, currentVersion, StringComparison.OrdinalIgnoreCase) <= 0)
        {
            _logger.LogDebug("Agent is up to date ({Current}).", currentVersion);
            return null;
        }

        if (IsUpdateInProgress())
        {
            _logger.LogInformation("Update already in progress — skipping.");
            return null;
        }

        _logger.LogInformation("Update available: {Current} → {Latest}", currentVersion, latestVersion);
        return response.Update;
    }

    public static string GetCurrentVersion()
    {
        return typeof(UpdateChecker).Assembly.GetName().Version?.ToString(3) ?? "1.0.0";
    }

    private static bool IsUpdateInProgress()
    {
        var checkpointPath = GetCheckpointPath();
        if (!File.Exists(checkpointPath)) return false;

        var age = DateTime.UtcNow - File.GetLastWriteTimeUtc(checkpointPath);
        if (age.TotalMinutes > 15)
        {
            try { File.Delete(checkpointPath); } catch { }
            return false;
        }
        return true;
    }

    public static string GetCheckpointPath()
    {
        var configDir = System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(
            System.Runtime.InteropServices.OSPlatform.Windows)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Meridian")
            : "/etc/meridian-agent";
        return Path.Combine(configDir, "update-checkpoint.json");
    }
}

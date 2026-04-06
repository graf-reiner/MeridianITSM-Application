namespace InvAgent.Worker;

using System.Runtime.InteropServices;
using InvAgent.Config;
using InvAgent.Http;
using InvAgent.Models;
using Microsoft.Extensions.Logging;

/// <summary>
/// Periodically checks the Meridian server for available agent updates
/// by comparing the current running version against the server's latest version.
/// </summary>
public class UpdateChecker
{
    private readonly MeridianApiClient _api;
    private readonly AgentConfig _config;
    private readonly ILogger<UpdateChecker> _logger;

    public UpdateChecker(MeridianApiClient api, AgentConfig config, ILogger<UpdateChecker> logger)
    {
        _api = api;
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Checks the server for an available update. Returns the UpdateInfo if a newer
    /// version is available, or null if the agent is already up to date.
    /// </summary>
    public async Task<UpdateInfo?> CheckForUpdateAsync(CancellationToken ct)
    {
        try
        {
            if (!_config.AutoUpdateEnabled)
            {
                _logger.LogDebug("Auto-update is disabled.");
                return null;
            }

            _logger.LogDebug("Checking for updates...");
            var updateInfo = await _api.CheckForUpdateAsync(GetCurrentVersion(), ct);

            if (updateInfo == null || string.IsNullOrEmpty(updateInfo.LatestVersion))
            {
                _logger.LogDebug("No update information available.");
                return null;
            }

            if (!IsNewerVersion(updateInfo.LatestVersion, GetCurrentVersion()))
            {
                _logger.LogDebug("Agent is up to date (v{Version}).", GetCurrentVersion());
                return null;
            }

            _logger.LogInformation("Update available: v{Current} -> v{Latest}",
                GetCurrentVersion(), updateInfo.LatestVersion);
            return updateInfo;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to check for updates.");
            return null;
        }
    }

    /// <summary>
    /// Returns the currently running agent version from the assembly metadata.
    /// </summary>
    public static string GetCurrentVersion()
    {
        return typeof(AgentWorker).Assembly.GetName().Version?.ToString() ?? "1.0.0";
    }

    /// <summary>
    /// Returns the path to the update checkpoint file, used to track in-progress updates.
    /// </summary>
    public static string GetCheckpointPath()
    {
        var baseDir = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Meridian")
            : "/etc/meridian-agent";

        return Path.Combine(baseDir, "update-checkpoint.json");
    }

    /// <summary>
    /// Compares two version strings and returns true if <paramref name="latest"/>
    /// is newer than <paramref name="current"/>.
    /// </summary>
    private static bool IsNewerVersion(string latest, string current)
    {
        if (Version.TryParse(latest, out var latestVer) && Version.TryParse(current, out var currentVer))
        {
            return latestVer > currentVer;
        }

        // Fallback: simple string comparison if parsing fails
        return !string.Equals(latest, current, StringComparison.OrdinalIgnoreCase);
    }
}

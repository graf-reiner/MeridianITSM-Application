namespace InvAgent.Worker;

using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using InvAgent.Config;
using InvAgent.Http;
using InvAgent.Models;
using Microsoft.Extensions.Logging;

public class UpdateInstaller
{
    private readonly MeridianApiClient _api;
    private readonly AgentConfig _config;
    private readonly ILogger<UpdateInstaller> _logger;

    public UpdateInstaller(MeridianApiClient api, AgentConfig config, ILogger<UpdateInstaller> logger)
    {
        _api = api;
        _config = config;
        _logger = logger;
    }

    public async Task<bool> InstallUpdateAsync(UpdateInfo update, CancellationToken ct)
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "MeridianUpdate");
        Directory.CreateDirectory(tempDir);

        var fileName = update.UpdateUrl.Contains(".msi") ? "MeridianAgent.msi" : "MeridianAgentSetup.exe";
        var downloadPath = Path.Combine(tempDir, fileName);

        try
        {
            _logger.LogInformation("Downloading update {Version} from {Url}...", update.LatestVersion, update.UpdateUrl);
            await _api.DownloadFileAsync(update.UpdateUrl, downloadPath, ct);

            if (!string.IsNullOrEmpty(update.Checksum))
            {
                _logger.LogInformation("Verifying checksum...");
                var actualChecksum = await ComputeChecksumAsync(downloadPath, ct);
                var expectedChecksum = update.Checksum.StartsWith("sha256:")
                    ? update.Checksum["sha256:".Length..]
                    : update.Checksum;

                if (!string.Equals(actualChecksum, expectedChecksum, StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogError("Checksum mismatch! Expected {Expected}, got {Actual}. Aborting update.",
                        expectedChecksum, actualChecksum);
                    try { File.Delete(downloadPath); } catch { }
                    return false;
                }
                _logger.LogInformation("Checksum verified.");
            }

            var checkpoint = new
            {
                previousVersion = UpdateChecker.GetCurrentVersion(),
                updateVersion = update.LatestVersion,
                timestamp = DateTime.UtcNow.ToString("O"),
                installerPath = downloadPath,
            };
            var checkpointPath = UpdateChecker.GetCheckpointPath();
            await File.WriteAllTextAsync(checkpointPath,
                JsonSerializer.Serialize(checkpoint, new JsonSerializerOptions { WriteIndented = true }), ct);

            _logger.LogInformation("Launching installer: {Path}", downloadPath);

            if (fileName.EndsWith(".msi"))
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "msiexec.exe",
                    Arguments = $"/i \"{downloadPath}\" /quiet /norestart",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                Process.Start(psi);
            }
            else
            {
                var psi = new ProcessStartInfo
                {
                    FileName = downloadPath,
                    Arguments = $"--server-url \"{_config.ServerUrl}\" --agent-key \"{_config.AgentKey}\" --privacy-tier \"{_config.PrivacyTier}\" --quiet",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                Process.Start(psi);
            }

            _logger.LogInformation("Installer launched. The service will be restarted by the installer.");
            return true;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to install update {Version}.", update.LatestVersion);
            return false;
        }
    }

    private static async Task<string> ComputeChecksumAsync(string filePath, CancellationToken ct)
    {
        using var sha256 = SHA256.Create();
        await using var stream = File.OpenRead(filePath);
        var hashBytes = await sha256.ComputeHashAsync(stream, ct);
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}

namespace InvAgent.Worker;

using System.Diagnostics;
using System.Runtime.InteropServices;
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
    private readonly EventReporter _events;

    public UpdateInstaller(MeridianApiClient api, AgentConfig config, ILogger<UpdateInstaller> logger, EventReporter events)
    {
        _api = api;
        _config = config;
        _logger = logger;
        _events = events;
    }

    public async Task<bool> InstallUpdateAsync(UpdateInfo update, CancellationToken ct)
    {
        // Linux self-update needs a download path that survives systemctl
        // restart — PrivateTmp=yes makes /tmp disappear when the service is
        // killed, so the detached helper would never find the package. Use
        // /var/lib/meridian-agent on Linux (FHS-standard, already in the
        // unit's ReadWritePaths and writable by the service user).
        string tempDir;
        string fileName;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            tempDir = "/var/lib/meridian-agent/updates";
            fileName = update.UpdateUrl.Contains(".rpm") ? "agent-update.rpm" : "agent-update.deb";
        }
        else
        {
            tempDir = Path.Combine(Path.GetTempPath(), "MeridianUpdate");
            fileName = update.UpdateUrl.Contains(".msi") ? "MeridianAgent.msi" : "MeridianAgentSetup.exe";
        }
        Directory.CreateDirectory(tempDir);

        var downloadPath = Path.Combine(tempDir, fileName);
        var fromVersion = UpdateChecker.GetCurrentVersion();

        _events.ReportInfo("update", $"Update detected: {fromVersion} -> {update.LatestVersion}", new()
        {
            ["kind"] = "update-detected",
            ["fromVersion"] = fromVersion,
            ["toVersion"] = update.LatestVersion,
        });

        try
        {
            _logger.LogInformation("Downloading update {Version} from {Url}...", update.LatestVersion, update.UpdateUrl);
            _events.ReportInfo("update", $"Downloading v{update.LatestVersion}", new()
            {
                ["kind"] = "update-downloading",
                ["toVersion"] = update.LatestVersion,
                ["url"] = update.UpdateUrl,
            });
            await _api.DownloadFileAsync(update.UpdateUrl, downloadPath, ct);
            _events.ReportInfo("update", "Installer downloaded", new()
            {
                ["kind"] = "update-downloaded",
                ["toVersion"] = update.LatestVersion,
                ["sizeBytes"] = new FileInfo(downloadPath).Length,
            });

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
                    _events.ReportError("update", "Checksum mismatch — aborting update", new()
                    {
                        ["kind"] = "update-error",
                        ["expected"] = expectedChecksum,
                        ["actual"] = actualChecksum,
                    });
                    try { File.Delete(downloadPath); } catch { }
                    return false;
                }
                _logger.LogInformation("Checksum verified.");
                _events.ReportInfo("update", "Checksum verified", new() { ["kind"] = "update-checksum-ok" });
            }

            var checkpoint = new
            {
                previousVersion = fromVersion,
                updateVersion = update.LatestVersion,
                timestamp = DateTime.UtcNow.ToString("O"),
                installerPath = downloadPath,
            };
            var checkpointPath = UpdateChecker.GetCheckpointPath();
            await File.WriteAllTextAsync(checkpointPath,
                JsonSerializer.Serialize(checkpoint, new JsonSerializerOptions { WriteIndented = true }), ct);

            _logger.LogInformation("Launching installer: {Path}", downloadPath);
            _events.ReportInfo("update", $"Launching installer for v{update.LatestVersion}", new()
            {
                ["kind"] = "update-installing",
                ["toVersion"] = update.LatestVersion,
                ["installerPath"] = downloadPath,
            });

            // Flush events BEFORE launching the installer — the installer will
            // stop this service and our in-memory queue otherwise disappears.
            try { await _events.FlushAsync(ct); } catch { /* non-fatal */ }

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                LaunchLinuxInstaller(downloadPath, update.LatestVersion);
            }
            else if (fileName.EndsWith(".msi"))
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
            _events.ReportError("update", $"Update failed: {ex.Message}", new()
            {
                ["kind"] = "update-error",
                ["toVersion"] = update.LatestVersion,
                ["exceptionType"] = ex.GetType().FullName,
            });
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

    /// <summary>
    /// Linux self-update has two compounding problems:
    ///   1. dpkg/rpm postinst triggers `systemctl restart meridian-agent`,
    ///      which kills *this* process mid-install.
    ///   2. The agent runs under a hardened systemd unit (ProtectSystem=strict,
    ///      ReadOnlyPaths covering /var/lib/dpkg etc.). Even with sudo the
    ///      child still inherits the agent's mount namespace, so dpkg can't
    ///      write to its own database.
    ///
    /// Both are solved by spawning the package manager as a *transient*
    /// systemd unit via `systemd-run`. The transient unit lives in a fresh
    /// cgroup outside the agent's hierarchy — restrictions don't apply, and
    /// it survives systemctl killing the agent. systemctl restart from the
    /// package's postinst is what actually restarts our service.
    ///
    /// Privilege boundary: NOPASSWD sudo for the *exact* `systemd-run …
    /// dpkg|rpm …` invocation, granted by /etc/sudoers.d/meridian-agent.
    /// </summary>
    private void LaunchLinuxInstaller(string packagePath, string toVersion)
    {
        // Unit names can't contain dots, so transcribe the version. The
        // unit will appear in `systemctl list-units --all` until --collect
        // garbage-collects it after exit.
        var unitName = $"meridian-update-{toVersion.Replace('.', '-')}";

        // The args after `systemd-run` form the command line of the
        // transient unit's ExecStart. systemd-run returns immediately once
        // the unit starts, so we don't block the agent.
        string installArgs;
        if (packagePath.EndsWith(".rpm", StringComparison.OrdinalIgnoreCase))
            installArgs = $"/usr/bin/rpm -U --force {packagePath}";
        else
            installArgs = $"/usr/bin/dpkg -i {packagePath}";

        var psi = new ProcessStartInfo
        {
            FileName = "/usr/bin/sudo",
            Arguments = $"/usr/bin/systemd-run --collect --unit={unitName} {installArgs}",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        Process.Start(psi);

        _logger.LogInformation(
            "Linux update queued as transient unit {Unit} (journalctl -u {Unit} for output)",
            unitName, unitName);
    }
}

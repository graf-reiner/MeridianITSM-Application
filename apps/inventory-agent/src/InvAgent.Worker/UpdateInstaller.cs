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
    /// Linux self-update is a chicken-and-egg problem: dpkg/rpm postinst
    /// triggers `systemctl restart meridian-agent`, which kills *this*
    /// process mid-install. We side-step it by writing a detached helper
    /// script and launching it via setsid so the helper outlives the agent.
    /// The package's own postinst handles the service restart — our helper
    /// just invokes the package manager (with NOPASSWD sudo rights granted
    /// by /etc/sudoers.d/meridian-agent shipped in the .deb / .rpm).
    /// </summary>
    private void LaunchLinuxInstaller(string packagePath, string toVersion)
    {
        const string updatesDir = "/var/lib/meridian-agent/updates";
        const string logPath = "/var/log/meridian-agent/update.log";
        var helperPath = Path.Combine(updatesDir, $"install-{toVersion}.sh");

        // Detect package manager from the file extension we just downloaded.
        // The sudoers fragment whitelists exact command + path patterns, so
        // these strings must match what's in /etc/sudoers.d/meridian-agent.
        string installCmd;
        if (packagePath.EndsWith(".rpm", StringComparison.OrdinalIgnoreCase))
            installCmd = $"sudo /usr/bin/rpm -U --force {packagePath}";
        else
            installCmd = $"sudo /usr/bin/dpkg -i {packagePath}";

        var script = $"""
            #!/bin/bash
            # Generated by UpdateInstaller — applies the agent self-update
            # after the parent service hands off. The dpkg/rpm postinst
            # restarts the service, so we don't restart it ourselves.
            set -u
            sleep 3
            echo "[$(date -Is)] Applying meridian-agent update v{toVersion}" >> {logPath}
            {installCmd} >> {logPath} 2>&1
            rc=$?
            echo "[$(date -Is)] Install rc=$rc" >> {logPath}
            exit $rc
            """;

        Directory.CreateDirectory(updatesDir);
        File.WriteAllText(helperPath, script);
        // 0755 — owner rwx, group + other rx. setsid bash will execute it.
        File.SetUnixFileMode(helperPath,
            UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute |
            UnixFileMode.GroupRead | UnixFileMode.GroupExecute |
            UnixFileMode.OtherRead | UnixFileMode.OtherExecute);

        // setsid detaches from the agent's session; combined with the leading
        // sleep this guarantees the helper survives systemctl killing the
        // agent. stdout/stderr go to update.log via the script itself.
        var psi = new ProcessStartInfo
        {
            FileName = "/usr/bin/setsid",
            Arguments = $"bash {helperPath}",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        Process.Start(psi);

        _logger.LogInformation("Linux update helper detached: {Path}", helperPath);
    }
}

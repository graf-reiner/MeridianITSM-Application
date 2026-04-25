namespace InvAgent.Config;

public class AgentConfig
{
    public string ServerUrl { get; set; } = "https://localhost:3000";
    public string? AgentKey { get; set; }
    public string? EnrollmentToken { get; set; }
    public string PrivacyTier { get; set; } = "full";  // full, restricted, anonymized
    public int HeartbeatIntervalSeconds { get; set; } = 300;    // 5 minutes
    public int InventoryIntervalSeconds { get; set; } = 14400;  // 4 hours
    public int LocalWebUiPort { get; set; } = 8787;
    public string? HttpProxy { get; set; }
    public int LocalQueueMaxSizeMb { get; set; } = 100;
    public string LogLevel { get; set; } = "Information";
    public bool AutoUpdateEnabled { get; set; } = true;

    /// <summary>
    /// Package format this agent was installed from: MSI / EXE on Windows,
    /// DEB / RPM on Linux, PKG on macOS. Reported on enrollment and used by
    /// the server to serve a matching artifact on update, and by
    /// UpdateInstaller to pick the right install command (msiexec / dpkg / rpm).
    /// Set by the installer (MSI postinst, bash installer) and persisted here.
    /// </summary>
    public string? InstallFormat { get; set; }
}

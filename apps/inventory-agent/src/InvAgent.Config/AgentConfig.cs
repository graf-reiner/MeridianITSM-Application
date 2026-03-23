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
}

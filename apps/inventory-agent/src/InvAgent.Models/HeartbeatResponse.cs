namespace InvAgent.Models;

public class HeartbeatResponse
{
    public bool Ok { get; set; }
    public UpdateInfo? Update { get; set; }

    /// <summary>
    /// ISO 8601 UTC timestamp at which the agent should send its next heartbeat.
    /// If absent or unparseable the agent falls back to its local HeartbeatIntervalSeconds.
    /// </summary>
    public string? NextHeartbeatAt { get; set; }
}

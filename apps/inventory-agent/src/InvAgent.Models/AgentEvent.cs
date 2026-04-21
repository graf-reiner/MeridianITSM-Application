namespace InvAgent.Models;

/// <summary>
/// A single event the agent wants the server to record for troubleshooting /
/// update-deployment tracking. Serialized as camelCase JSON by
/// MeridianApiClient.SendEventsAsync.
/// </summary>
public class AgentEvent
{
    public string Level { get; set; } = "INFO";
    public string? Category { get; set; }
    public string Message { get; set; } = "";
    public Dictionary<string, object?>? Context { get; set; }
    public DateTime EventAt { get; set; } = DateTime.UtcNow;
}

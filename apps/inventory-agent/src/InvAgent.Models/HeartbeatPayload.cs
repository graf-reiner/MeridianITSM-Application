namespace InvAgent.Models;

public class HeartbeatPayload
{
    public string AgentVersion { get; set; } = "";
    public Dictionary<string, object>? Metrics { get; set; }
}

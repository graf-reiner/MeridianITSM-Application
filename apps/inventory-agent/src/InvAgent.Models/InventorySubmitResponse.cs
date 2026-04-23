namespace InvAgent.Models;

/// <summary>
/// Response from the server after submitting an inventory snapshot.
/// </summary>
public class InventorySubmitResponse
{
    public string? SnapshotId { get; set; }
    public string? CiId { get; set; }
    public bool Created { get; set; }

    /// <summary>
    /// ISO 8601 UTC timestamp at which the agent should schedule its next inventory run.
    /// If absent or unparseable the agent falls back to its local InventoryIntervalSeconds.
    /// </summary>
    public string? NextInventoryAt { get; set; }
}

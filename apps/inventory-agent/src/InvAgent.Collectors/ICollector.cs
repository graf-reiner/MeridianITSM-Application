namespace InvAgent.Collectors;

using InvAgent.Models;

public interface ICollector
{
    Task<InventoryPayload> CollectAsync(CancellationToken ct = default);
}

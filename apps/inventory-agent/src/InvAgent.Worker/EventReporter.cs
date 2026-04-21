namespace InvAgent.Worker;

using System.Collections.Concurrent;
using InvAgent.Http;
using InvAgent.Models;
using Microsoft.Extensions.Logging;

/// <summary>
/// Bounded, thread-safe queue of events that are synced to the server on each
/// heartbeat. Drops oldest entries when the queue is full. Survives transient
/// send failures by re-queuing its batch (bounded to avoid runaway growth).
/// </summary>
public class EventReporter
{
    private const int MaxQueueSize = 500;
    private const int MaxBatchSize = 200;

    private readonly ConcurrentQueue<AgentEvent> _queue = new();
    private readonly MeridianApiClient _api;
    private readonly ILogger<EventReporter> _logger;

    public EventReporter(MeridianApiClient api, ILogger<EventReporter> logger)
    {
        _api = api;
        _logger = logger;
    }

    public void Report(string level, string? category, string message, Dictionary<string, object?>? context = null)
    {
        var evt = new AgentEvent
        {
            Level = level,
            Category = category,
            Message = message,
            Context = context,
            EventAt = DateTime.UtcNow,
        };

        // Drop oldest if over capacity.
        while (_queue.Count >= MaxQueueSize)
        {
            _queue.TryDequeue(out _);
        }

        _queue.Enqueue(evt);
    }

    public void ReportInfo(string category, string message, Dictionary<string, object?>? context = null)
        => Report("INFO", category, message, context);

    public void ReportWarn(string category, string message, Dictionary<string, object?>? context = null)
        => Report("WARN", category, message, context);

    public void ReportError(string category, string message, Dictionary<string, object?>? context = null)
        => Report("ERROR", category, message, context);

    /// <summary>
    /// Drains up to MaxBatchSize events and posts them. On failure, re-queues
    /// the batch (bounded by MaxQueueSize) and propagates no exception.
    /// </summary>
    public async Task FlushAsync(CancellationToken ct)
    {
        if (_queue.IsEmpty) return;

        var batch = new List<AgentEvent>(MaxBatchSize);
        while (batch.Count < MaxBatchSize && _queue.TryDequeue(out var evt))
        {
            batch.Add(evt);
        }

        if (batch.Count == 0) return;

        try
        {
            await _api.SendEventsAsync(batch, ct);
        }
        catch (OperationCanceledException)
        {
            // Restore batch so a future flush can try again.
            foreach (var evt in batch) _queue.Enqueue(evt);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send {Count} events — re-queuing.", batch.Count);
            // Re-queue bounded: if the queue is near cap, drop the oldest first.
            foreach (var evt in batch)
            {
                while (_queue.Count >= MaxQueueSize) _queue.TryDequeue(out _);
                _queue.Enqueue(evt);
            }
        }
    }
}

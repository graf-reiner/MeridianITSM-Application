namespace InvAgent.Queue;

using System.Text.Json;
using InvAgent.Config;
using InvAgent.Http;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

/// <summary>
/// SQLite-backed local queue for offline buffering of inventory payloads.
/// Items are persisted to disk so they survive agent restarts.
/// </summary>
public class LocalQueue : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ILogger<LocalQueue> _logger;
    private readonly AgentConfig _config;
    private bool _disposed;

    public LocalQueue(IOptions<AgentConfig> config, ILogger<LocalQueue> logger)
    {
        _config = config.Value;
        _logger = logger;

        var dir = ResolveQueueDir();
        Directory.CreateDirectory(dir);

        var dbPath = Path.Combine(dir, "queue.db");
        _connection = new SqliteConnection($"Data Source={dbPath}");
        _connection.Open();
        InitSchema();
    }

    /// <summary>
    /// Where to persist the offline queue. On Linux the agent runs as a
    /// systemd service with ProtectHome=yes (no HOME) and ProtectSystem=strict
    /// (read-only /opt), so the .NET default LocalApplicationData lookup falls
    /// back to the working dir and fails. Use the FHS-standard
    /// /var/lib/meridian-agent path that the .deb / .rpm postinst owns.
    /// </summary>
    private static string ResolveQueueDir()
    {
        if (OperatingSystem.IsLinux())
        {
            return "/var/lib/meridian-agent";
        }

        if (OperatingSystem.IsMacOS())
        {
            return "/var/lib/meridian-agent";
        }

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "meridian-agent");
    }

    private void InitSchema()
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                retry_count INTEGER NOT NULL DEFAULT 0
            )
            """;
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Returns the number of items currently in the queue.
    /// </summary>
    public int Count
    {
        get
        {
            using var cmd = _connection.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM queue";
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
    }

    /// <summary>
    /// Returns the approximate total size of the queue database file in bytes.
    /// </summary>
    public long SizeBytes
    {
        get
        {
            try
            {
                using var cmd = _connection.CreateCommand();
                cmd.CommandText = "PRAGMA page_count";
                var pages = Convert.ToInt64(cmd.ExecuteScalar());
                cmd.CommandText = "PRAGMA page_size";
                var pageSize = Convert.ToInt64(cmd.ExecuteScalar());
                return pages * pageSize;
            }
            catch
            {
                return 0;
            }
        }
    }

    /// <summary>
    /// Enqueues a new item. Refuses if queue size exceeds LocalQueueMaxSizeMb.
    /// </summary>
    public void Enqueue(string type, string jsonPayload)
    {
        long maxBytes = (long)_config.LocalQueueMaxSizeMb * 1024 * 1024;
        if (SizeBytes >= maxBytes)
        {
            _logger.LogWarning("Local queue is full ({SizeBytes} bytes). Dropping {Type} item.", SizeBytes, type);
            return;
        }

        using var cmd = _connection.CreateCommand();
        cmd.CommandText = "INSERT INTO queue (type, payload) VALUES ($type, $payload)";
        cmd.Parameters.AddWithValue("$type", type);
        cmd.Parameters.AddWithValue("$payload", jsonPayload);
        cmd.ExecuteNonQuery();

        _logger.LogDebug("Queued {Type} item. Queue count: {Count}", type, Count);
    }

    /// <summary>
    /// Returns all queued items without removing them.
    /// </summary>
    public List<QueueItem> PeekAll()
    {
        var items = new List<QueueItem>();
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = "SELECT id, type, payload, created_at, retry_count FROM queue ORDER BY id ASC";
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            items.Add(new QueueItem
            {
                Id = reader.GetInt64(0),
                Type = reader.GetString(1),
                Payload = reader.GetString(2),
                CreatedAt = reader.GetString(3),
                RetryCount = reader.GetInt32(4),
            });
        }
        return items;
    }

    /// <summary>
    /// Removes an item from the queue by ID.
    /// </summary>
    public void Dequeue(long id)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = "DELETE FROM queue WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Increments the retry count for an item.
    /// </summary>
    public void IncrementRetry(long id)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = "UPDATE queue SET retry_count = retry_count + 1 WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Drains the queue by submitting each item to the server.
    /// Successfully submitted items are removed; failed items remain for next retry.
    /// </summary>
    public async Task FlushAsync(MeridianApiClient client, CancellationToken ct = default)
    {
        var items = PeekAll();
        if (items.Count == 0) return;

        _logger.LogInformation("Flushing {Count} queued items...", items.Count);

        foreach (var item in items)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                if (item.Type == "inventory")
                {
                    var payload = JsonSerializer.Deserialize<InvAgent.Models.InventoryPayload>(item.Payload,
                        new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

                    if (payload != null)
                    {
                        await client.SubmitInventoryAsync(payload, ct);
                        Dequeue(item.Id);
                        _logger.LogDebug("Flushed queued inventory item id={Id}", item.Id);
                    }
                }
                else
                {
                    // Unknown type — remove to avoid permanent backlog
                    Dequeue(item.Id);
                }
            }
            catch (Exception ex)
            {
                IncrementRetry(item.Id);
                _logger.LogWarning(ex, "Failed to flush queued item id={Id} (retry {RetryCount})", item.Id, item.RetryCount + 1);
                // Stop flushing on first failure — server may still be unreachable
                break;
            }
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _connection.Close();
            _connection.Dispose();
            _disposed = true;
        }
        GC.SuppressFinalize(this);
    }
}

/// <summary>
/// Represents a single item in the local queue.
/// </summary>
public class QueueItem
{
    public long Id { get; set; }
    public string Type { get; set; } = "";
    public string Payload { get; set; } = "";
    public string CreatedAt { get; set; } = "";
    public int RetryCount { get; set; }
}

namespace InvAgent.Http;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using InvAgent.Config;
using InvAgent.Models;

/// <summary>
/// HTTP client for communicating with the Meridian server.
/// Uses Polly resilience (retry + circuit breaker) configured in DI.
/// </summary>
public class MeridianApiClient
{
    private readonly HttpClient _http;
    private readonly AgentConfig _config;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    public MeridianApiClient(HttpClient http, AgentConfig config)
    {
        _http = http;
        _config = config;
        _http.BaseAddress = new Uri(config.ServerUrl.TrimEnd('/') + "/");
        if (!string.IsNullOrEmpty(config.AgentKey))
            _http.DefaultRequestHeaders.Add("Authorization", $"AgentKey {config.AgentKey}");
    }

    /// <summary>Sets the agent key on the Authorization header after enrollment.</summary>
    public void SetAgentKey(string agentKey)
    {
        _http.DefaultRequestHeaders.Remove("Authorization");
        _http.DefaultRequestHeaders.Add("Authorization", $"AgentKey {agentKey}");
    }

    /// <summary>Enrolls the agent and returns an AgentKey. Returns null on failure.</summary>
    public async Task<EnrollmentResult?> EnrollAsync(
        string token,
        string hostname,
        string platform,
        string agentVersion,
        string? installFormat,
        CancellationToken ct = default)
    {
        var body = new
        {
            token,
            hostname,
            platform,
            agentVersion,
            installFormat,
        };

        var response = await _http.PostAsJsonAsync("api/v1/agents/enroll", body, JsonOptions, ct);
        if (!response.IsSuccessStatusCode)
            return null;

        return await response.Content.ReadFromJsonAsync<EnrollmentResult>(JsonOptions, ct);
    }

    /// <summary>Sends a heartbeat to the server. Returns update info if available. Throws on HTTP error (Polly will retry).</summary>
    public async Task<HeartbeatResponse?> SendHeartbeatAsync(HeartbeatPayload payload, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("api/v1/agents/heartbeat", payload, JsonOptions, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<HeartbeatResponse>(JsonOptions, ct);
    }

    /// <summary>
    /// Submits an inventory payload. Returns the server response (snapshotId + nextInventoryAt),
    /// or null on any non-success HTTP status.
    /// </summary>
    public async Task<InventorySubmitResponse?> SubmitInventoryAsync(InventoryPayload payload, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("api/v1/agents/inventory", payload, JsonOptions, ct);
        if (!response.IsSuccessStatusCode)
            return null;

        return await response.Content.ReadFromJsonAsync<InventorySubmitResponse>(JsonOptions, ct);
    }

    /// <summary>Pushes inventory to the CMDB sync endpoint. Throws on HTTP error (Polly will retry).</summary>
    public async Task SubmitCmdbSyncAsync(InventoryPayload payload, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("api/v1/agents/cmdb-sync", payload, JsonOptions, ct);
        response.EnsureSuccessStatusCode();
    }

    /// <summary>
    /// Pushes a batch of agent events to the server. Throws on HTTP error so
    /// the caller can re-queue the batch for a retry on the next heartbeat.
    /// </summary>
    public async Task SendEventsAsync(IReadOnlyList<AgentEvent> events, CancellationToken ct = default)
    {
        if (events.Count == 0) return;
        var response = await _http.PostAsJsonAsync("api/v1/agents/events", new { events }, JsonOptions, ct);
        response.EnsureSuccessStatusCode();
    }

    /// <summary>
    /// Sends a HEAD request to the server to test connectivity.
    /// Returns latency in milliseconds on success, or -1 on failure.
    /// </summary>
    public async Task<long> TestConnectivityAsync(CancellationToken ct = default)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            var response = await _http.SendAsync(
                new HttpRequestMessage(HttpMethod.Head, "api/v1/agents/health"),
                ct);
            sw.Stop();
            return response.IsSuccessStatusCode ? sw.ElapsedMilliseconds : -1;
        }
        catch
        {
            return -1;
        }
    }

    /// <summary>
    /// Checks the server for an available agent update.
    /// Returns UpdateInfo if an update is available, or null if up to date.
    /// </summary>
    public async Task<UpdateInfo?> CheckForUpdateAsync(string currentVersion, CancellationToken ct = default)
    {
        try
        {
            var response = await _http.GetAsync($"api/v1/agents/update-check?version={currentVersion}", ct);
            if (response.StatusCode == HttpStatusCode.NoContent || response.StatusCode == HttpStatusCode.NotFound)
                return null;

            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<UpdateInfo>(JsonOptions, ct);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Downloads a file from the given URL to a local path.
    /// Supports both absolute URLs and relative paths on the Meridian server.
    /// </summary>
    public async Task DownloadFileAsync(string url, string destinationPath, CancellationToken ct = default)
    {
        HttpResponseMessage response;
        if (url.StartsWith("http://") || url.StartsWith("https://"))
        {
            using var client = new HttpClient();
            response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        else
        {
            response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        }

        response.EnsureSuccessStatusCode();

        var dir = Path.GetDirectoryName(destinationPath);
        if (dir != null) Directory.CreateDirectory(dir);

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        await using var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
        await stream.CopyToAsync(fileStream, ct);
    }
}

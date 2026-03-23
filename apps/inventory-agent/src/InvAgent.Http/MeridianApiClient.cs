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
        CancellationToken ct = default)
    {
        var body = new
        {
            token,
            hostname,
            platform,
            agentVersion,
        };

        var response = await _http.PostAsJsonAsync("api/v1/agents/enroll", body, JsonOptions, ct);
        if (!response.IsSuccessStatusCode)
            return null;

        return await response.Content.ReadFromJsonAsync<EnrollmentResult>(JsonOptions, ct);
    }

    /// <summary>Sends a heartbeat to the server. Throws on HTTP error (Polly will retry).</summary>
    public async Task SendHeartbeatAsync(HeartbeatPayload payload, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("api/v1/agents/heartbeat", payload, JsonOptions, ct);
        response.EnsureSuccessStatusCode();
    }

    /// <summary>
    /// Submits an inventory payload. Returns the server-assigned snapshot ID, or null on failure.
    /// </summary>
    public async Task<string?> SubmitInventoryAsync(InventoryPayload payload, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("api/v1/agents/inventory", payload, JsonOptions, ct);
        if (!response.IsSuccessStatusCode)
            return null;

        var result = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        return result.TryGetProperty("id", out var id) ? id.GetString() : null;
    }

    /// <summary>Pushes inventory to the CMDB sync endpoint. Throws on HTTP error (Polly will retry).</summary>
    public async Task SubmitCmdbSyncAsync(InventoryPayload payload, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("api/v1/agents/cmdb-sync", payload, JsonOptions, ct);
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
}

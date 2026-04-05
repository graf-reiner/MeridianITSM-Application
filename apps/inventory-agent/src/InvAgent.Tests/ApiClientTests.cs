namespace InvAgent.Tests;

using System.Net;
using System.Text.Json;
using FluentAssertions;
using InvAgent.Config;
using InvAgent.Http;
using InvAgent.Models;
using Xunit;

/// <summary>
/// Integration-style tests for MeridianApiClient using a mock HTTP handler.
/// Validates enrollment, heartbeat, inventory submission, CMDB sync, and connectivity.
/// </summary>
public class ApiClientTests
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static (MeridianApiClient client, MockHandler handler) CreateClient(string? agentKey = null)
    {
        var config = new AgentConfig
        {
            ServerUrl = "https://test.meridian.local",
            AgentKey = agentKey,
        };

        var handler = new MockHandler();
        var httpClient = new HttpClient(handler);
        var client = new MeridianApiClient(httpClient, config);
        return (client, handler);
    }

    private static InventoryPayload CreateTestPayload() => new()
    {
        Hostname = "test-workstation",
        Platform = "WINDOWS",
        CollectedAt = DateTime.UtcNow,
        Os = new OsInfo { Name = "Windows 11", Version = "23H2", Architecture = "x64" },
        Hardware = new HardwareInfo
        {
            Manufacturer = "Dell",
            Model = "OptiPlex 7090",
            SerialNumber = "SN12345",
            TotalMemoryBytes = 17179869184,
            Cpus = [new CpuInfo { Name = "Intel i7-11700", Cores = 8, Threads = 16, SpeedMhz = 2500 }],
            Disks = [new DiskInfo { DeviceName = "C:", SizeBytes = 512110190592, Type = "SSD" }],
        },
        Software = [new SoftwareEntry { Name = "Visual Studio Code", Version = "1.88.0", Publisher = "Microsoft" }],
        Services = [new ServiceEntry { Name = "wuauserv", DisplayName = "Windows Update", Status = "Running" }],
        Processes = [],
        Network = [new NetworkInterface { Name = "Ethernet", MacAddress = "AA:BB:CC:DD:EE:FF", IpAddresses = ["192.168.1.100"] }],
        LocalUsers = [new LocalUser { Username = "admin", IsAdmin = true }],
    };

    // ─── Enrollment Tests ─────────────────────────────────────────────────

    [Fact]
    public async Task Enroll_ReturnsAgentKey_OnSuccess()
    {
        var (client, handler) = CreateClient();
        handler.SetResponse(HttpStatusCode.OK, new { agentKey = "abc123def456", agentId = "uuid-1234" });

        var result = await client.EnrollAsync("test-token", "workstation-1", "WINDOWS", "1.0.0");

        result.Should().NotBeNull();
        result!.AgentKey.Should().Be("abc123def456");
        result.AgentId.Should().Be("uuid-1234");
        handler.LastRequest!.Method.Should().Be(HttpMethod.Post);
        handler.LastRequestUri.Should().Contain("api/v1/agents/enroll");
    }

    [Fact]
    public async Task Enroll_ReturnsNull_On401()
    {
        var (client, handler) = CreateClient();
        handler.SetResponse(HttpStatusCode.Unauthorized, new { error = "Invalid token" });

        var result = await client.EnrollAsync("bad-token", "workstation-1", "WINDOWS", "1.0.0");

        result.Should().BeNull();
    }

    [Fact]
    public async Task Enroll_SendsCorrectPayload()
    {
        var (client, handler) = CreateClient();
        handler.SetResponse(HttpStatusCode.OK, new { agentKey = "key", agentId = "id" });

        await client.EnrollAsync("my-token", "ws-42", "LINUX", "2.0.0");

        var body = JsonSerializer.Deserialize<JsonElement>(handler.LastRequestBody!);
        body.GetProperty("token").GetString().Should().Be("my-token");
        body.GetProperty("hostname").GetString().Should().Be("ws-42");
        body.GetProperty("platform").GetString().Should().Be("LINUX");
        body.GetProperty("agentVersion").GetString().Should().Be("2.0.0");
    }

    // ─── Heartbeat Tests ──────────────────────────────────────────────────

    [Fact]
    public async Task Heartbeat_SendsSuccessfully()
    {
        var (client, handler) = CreateClient("agent-key-123");
        handler.SetResponse(HttpStatusCode.OK, new { ok = true });

        var payload = new HeartbeatPayload
        {
            AgentVersion = "1.0.0",
        };

        var act = () => client.SendHeartbeatAsync(payload);
        await act.Should().NotThrowAsync();
        handler.LastRequestUri.Should().Contain("api/v1/agents/heartbeat");
    }

    [Fact]
    public async Task Heartbeat_SetsAuthHeader()
    {
        var (client, handler) = CreateClient("my-agent-key");
        handler.SetResponse(HttpStatusCode.OK, new { ok = true });

        await client.SendHeartbeatAsync(new HeartbeatPayload { AgentVersion = "1.0.0" });

        handler.LastRequest!.Headers.GetValues("Authorization")
            .Should().Contain("AgentKey my-agent-key");
    }

    [Fact]
    public async Task Heartbeat_ThrowsOn500()
    {
        var (client, handler) = CreateClient("key");
        handler.SetResponse(HttpStatusCode.InternalServerError, new { error = "boom" });

        var act = () => client.SendHeartbeatAsync(new HeartbeatPayload { AgentVersion = "1.0.0" });
        await act.Should().ThrowAsync<HttpRequestException>();
    }

    // ─── Inventory Submission Tests ───────────────────────────────────────

    [Fact]
    public async Task SubmitInventory_ReturnsSnapshotId()
    {
        var (client, handler) = CreateClient("key");
        handler.SetResponse(HttpStatusCode.OK, new { id = "snapshot-uuid-1234" });

        var result = await client.SubmitInventoryAsync(CreateTestPayload());

        result.Should().Be("snapshot-uuid-1234");
        handler.LastRequestUri.Should().Contain("api/v1/agents/inventory");
    }

    [Fact]
    public async Task SubmitInventory_ReturnsNull_OnFailure()
    {
        var (client, handler) = CreateClient("key");
        handler.SetResponse(HttpStatusCode.BadRequest, new { error = "Invalid payload" });

        var result = await client.SubmitInventoryAsync(CreateTestPayload());

        result.Should().BeNull();
    }

    [Fact]
    public async Task SubmitInventory_SendsFullPayload()
    {
        var (client, handler) = CreateClient("key");
        handler.SetResponse(HttpStatusCode.OK, new { id = "snap-1" });

        var payload = CreateTestPayload();
        await client.SubmitInventoryAsync(payload);

        var body = JsonSerializer.Deserialize<JsonElement>(handler.LastRequestBody!);
        body.GetProperty("hostname").GetString().Should().Be("test-workstation");
        body.GetProperty("platform").GetString().Should().Be("WINDOWS");
        body.GetProperty("os").GetProperty("name").GetString().Should().Be("Windows 11");
        body.GetProperty("hardware").GetProperty("manufacturer").GetString().Should().Be("Dell");
        body.GetProperty("software").GetArrayLength().Should().Be(1);
        body.GetProperty("network").GetArrayLength().Should().Be(1);
    }

    // ─── CMDB Sync Tests ─────────────────────────────────────────────────

    [Fact]
    public async Task CmdbSync_SendsSuccessfully()
    {
        var (client, handler) = CreateClient("key");
        handler.SetResponse(HttpStatusCode.OK, new { ok = true });

        var act = () => client.SubmitCmdbSyncAsync(CreateTestPayload());
        await act.Should().NotThrowAsync();
        handler.LastRequestUri.Should().Contain("api/v1/agents/cmdb-sync");
    }

    // ─── Connectivity Tests ──────────────────────────────────────────────

    [Fact]
    public async Task TestConnectivity_ReturnsLatency_OnSuccess()
    {
        var (client, handler) = CreateClient();
        handler.SetResponse(HttpStatusCode.OK, "");

        var latency = await client.TestConnectivityAsync();

        latency.Should().BeGreaterOrEqualTo(0);
    }

    [Fact]
    public async Task TestConnectivity_ReturnsNegative_OnFailure()
    {
        var (client, handler) = CreateClient();
        handler.SetResponse(HttpStatusCode.ServiceUnavailable, "");

        var latency = await client.TestConnectivityAsync();

        latency.Should().Be(-1);
    }

    // ─── SetAgentKey Tests ───────────────────────────────────────────────

    [Fact]
    public async Task SetAgentKey_UpdatesAuthHeader()
    {
        var (client, handler) = CreateClient();
        handler.SetResponse(HttpStatusCode.OK, new { ok = true });

        client.SetAgentKey("new-key-abc");
        await client.SendHeartbeatAsync(new HeartbeatPayload { AgentVersion = "2.0.0" });

        handler.LastRequest!.Headers.GetValues("Authorization")
            .Should().Contain("AgentKey new-key-abc");
    }
}

/// <summary>
/// Mock HTTP message handler for testing MeridianApiClient without a real server.
/// </summary>
public class MockHandler : HttpMessageHandler
{
    private HttpStatusCode _statusCode = HttpStatusCode.OK;
    private string _responseBody = "{}";

    public HttpRequestMessage? LastRequest { get; private set; }
    public string? LastRequestBody { get; private set; }
    public string? LastRequestUri => LastRequest?.RequestUri?.ToString();

    public void SetResponse(HttpStatusCode statusCode, object body)
    {
        _statusCode = statusCode;
        _responseBody = body is string s ? s : JsonSerializer.Serialize(body, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        LastRequest = request;
        if (request.Content != null)
            LastRequestBody = await request.Content.ReadAsStringAsync(ct);

        return new HttpResponseMessage(_statusCode)
        {
            Content = new StringContent(_responseBody, System.Text.Encoding.UTF8, "application/json"),
        };
    }
}

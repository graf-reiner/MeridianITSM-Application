namespace InvAgent.Tests;

using FluentAssertions;
using InvAgent.Models;
using InvAgent.Privacy;
using Xunit;

public class PrivacyFilterTests
{
    private static InventoryPayload CreateSamplePayload() => new()
    {
        Hostname = "workstation-42",
        Platform = "LINUX",
        Os = new OsInfo { Name = "Ubuntu", Version = "22.04" },
        Hardware = new HardwareInfo
        {
            Manufacturer = "Dell",
            Model = "Latitude 5520",
            SerialNumber = "SN-ABC123",
            Cpus = [new CpuInfo { Name = "Intel Core i7", Cores = 8, Threads = 16 }],
            TotalMemoryBytes = 16L * 1024 * 1024 * 1024
        },
        Software =
        [
            new SoftwareEntry { Name = "Visual Studio Code", Version = "1.85.0", Publisher = "Microsoft" },
            new SoftwareEntry { Name = "Git", Version = "2.43.0", Publisher = "Software Freedom Conservancy" }
        ],
        Services =
        [
            new ServiceEntry { Name = "sshd", DisplayName = "OpenSSH Server", Status = "Running" }
        ],
        Processes =
        [
            new ProcessEntry { Pid = 1234, Name = "code", CpuPercent = 2.5, MemoryBytes = 512 * 1024 * 1024 },
            new ProcessEntry { Pid = 5678, Name = "chrome", CpuPercent = 5.0, MemoryBytes = 1024 * 1024 * 1024 }
        ],
        Network =
        [
            new NetworkInterface
            {
                Name = "eth0",
                MacAddress = "aa:bb:cc:dd:ee:ff",
                IpAddresses = ["192.168.1.100", "::1"],
                SpeedMbps = 1000
            }
        ],
        LocalUsers =
        [
            new LocalUser { Username = "alice", IsAdmin = true },
            new LocalUser { Username = "bob", IsAdmin = false }
        ],
        CollectedAt = DateTime.UtcNow
    };

    [Fact]
    public void Full_Tier_Returns_Payload_Unchanged()
    {
        var payload = CreateSamplePayload();

        var result = PrivacyFilter.Apply(payload, "full");

        result.Should().BeSameAs(payload, "full tier should return the original reference");
    }

    [Fact]
    public void Restricted_Tier_Removes_LocalUsers()
    {
        var payload = CreateSamplePayload();

        var result = PrivacyFilter.Apply(payload, "restricted");

        result.LocalUsers.Should().BeEmpty("restricted tier must remove all local user data");
    }

    [Fact]
    public void Restricted_Tier_Removes_SerialNumber()
    {
        var payload = CreateSamplePayload();

        var result = PrivacyFilter.Apply(payload, "restricted");

        result.Hardware.SerialNumber.Should().BeEmpty("restricted tier must strip serial number");
    }

    [Fact]
    public void Restricted_Tier_Removes_Software_Publisher()
    {
        var payload = CreateSamplePayload();

        var result = PrivacyFilter.Apply(payload, "restricted");

        result.Software.Should().AllSatisfy(s =>
            s.Publisher.Should().BeEmpty("restricted tier must remove software publisher"));
    }

    [Fact]
    public void Restricted_Tier_Removes_Process_Names()
    {
        var payload = CreateSamplePayload();

        var result = PrivacyFilter.Apply(payload, "restricted");

        result.Processes.Should().AllSatisfy(p =>
            p.Name.Should().BeEmpty("restricted tier must remove process names"));
    }

    [Fact]
    public void Restricted_Tier_Preserves_Process_PIDs()
    {
        var payload = CreateSamplePayload();

        var result = PrivacyFilter.Apply(payload, "restricted");

        result.Processes.Select(p => p.Pid).Should().BeEquivalentTo(
            payload.Processes.Select(p => p.Pid),
            "PIDs should be preserved even in restricted mode");
    }

    [Fact]
    public void Anonymized_Tier_Hashes_Hostname()
    {
        var payload = CreateSamplePayload();
        var originalHostname = payload.Hostname;

        var result = PrivacyFilter.Apply(payload, "anonymized");

        result.Hostname.Should().NotBe(originalHostname, "anonymized tier must hash the hostname");
        result.Hostname.Should().HaveLength(12, "hash should be 12 hex characters");
    }

    [Fact]
    public void Anonymized_Tier_Hashes_MAC_Addresses()
    {
        var payload = CreateSamplePayload();
        var originalMac = payload.Network[0].MacAddress;

        var result = PrivacyFilter.Apply(payload, "anonymized");

        result.Network[0].MacAddress.Should().NotBe(originalMac,
            "anonymized tier must hash MAC addresses");
        result.Network[0].MacAddress.Should().HaveLength(12,
            "hashed MAC should be 12 hex characters");
    }

    [Fact]
    public void Anonymized_Tier_Hashes_IP_Addresses()
    {
        var payload = CreateSamplePayload();
        var originalIp = payload.Network[0].IpAddresses[0];

        var result = PrivacyFilter.Apply(payload, "anonymized");

        result.Network[0].IpAddresses[0].Should().NotBe(originalIp,
            "anonymized tier must hash IP addresses");
    }

    [Fact]
    public void Anonymized_Tier_Also_Removes_LocalUsers()
    {
        var payload = CreateSamplePayload();

        var result = PrivacyFilter.Apply(payload, "anonymized");

        result.LocalUsers.Should().BeEmpty("anonymized tier inherits all restricted restrictions");
    }

    [Fact]
    public void Unknown_Tier_Returns_Payload_Unchanged()
    {
        var payload = CreateSamplePayload();

        var result = PrivacyFilter.Apply(payload, "unknown-tier");

        result.Should().BeSameAs(payload, "unknown tier defaults to full (no filtering)");
    }

    [Fact]
    public void Hashing_Is_Deterministic()
    {
        var payload1 = CreateSamplePayload();
        var payload2 = CreateSamplePayload();

        var result1 = PrivacyFilter.Apply(payload1, "anonymized");
        var result2 = PrivacyFilter.Apply(payload2, "anonymized");

        result1.Hostname.Should().Be(result2.Hostname,
            "same hostname should always hash to same value");
    }
}

namespace InvAgent.Tests;

using System.Runtime.InteropServices;
using FluentAssertions;
using InvAgent.Collectors;
using InvAgent.Models;
using Xunit;

public class CollectorTests
{
    private static ICollector GetPlatformCollector()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return new InvAgent.Collectors.Windows.WmiCollector();
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            return new InvAgent.Collectors.Linux.ProcCollector();
        else
            return new InvAgent.Collectors.MacOs.MacOsCollector();
    }

    [Fact]
    public async Task CurrentPlatformCollector_Returns_ValidPayload()
    {
        // Arrange
        var collector = GetPlatformCollector();

        // Act
        var payload = await collector.CollectAsync();

        // Assert
        payload.Should().NotBeNull();
        payload.Hostname.Should().NotBeNullOrEmpty("hostname should always be available");
        payload.Platform.Should().BeOneOf("WINDOWS", "LINUX", "MACOS");
    }

    [Fact]
    public async Task CollectedAt_Should_Be_Set_To_UtcNow()
    {
        // Arrange
        var collector = GetPlatformCollector();
        var before = DateTime.UtcNow.AddSeconds(-5);

        // Act
        var payload = await collector.CollectAsync();
        var after = DateTime.UtcNow.AddSeconds(5);

        // Assert
        payload.CollectedAt.Should().BeAfter(before);
        payload.CollectedAt.Should().BeBefore(after);
    }

    [Fact]
    public async Task Payload_Os_Should_Have_NonEmpty_Name()
    {
        var collector = GetPlatformCollector();
        var payload = await collector.CollectAsync();

        payload.Os.Should().NotBeNull();
        payload.Os.Name.Should().NotBeNullOrEmpty("OS name should be populated by all collectors");
    }

    [Fact]
    public async Task Payload_Collections_Should_Not_Be_Null()
    {
        var collector = GetPlatformCollector();
        var payload = await collector.CollectAsync();

        payload.Software.Should().NotBeNull();
        payload.Services.Should().NotBeNull();
        payload.Processes.Should().NotBeNull();
        payload.Network.Should().NotBeNull();
        payload.LocalUsers.Should().NotBeNull();
    }
}

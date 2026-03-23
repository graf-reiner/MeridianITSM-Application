using System.CommandLine;
using System.Runtime.InteropServices;
using InvAgent.Collectors;
using InvAgent.Config;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var rootCommand = new RootCommand("Meridian Inventory Agent — endpoint discovery daemon");

var enrollOption = new Option<string?>("--enroll", "Enrollment token to register this agent with the server");
var runOnceOption = new Option<bool>("--run-once", "Run a single inventory collection and exit");
var serverUrlOption = new Option<string?>("--server-url", "Override the server URL");
var configOption = new Option<string?>("--config", "Path to configuration JSON file");
var agentKeyOption = new Option<string?>("--agent-key", "Override the agent API key");
var privacyTierOption = new Option<string?>("--privacy-tier", "Privacy tier: full, restricted, or anonymized");

rootCommand.AddOption(enrollOption);
rootCommand.AddOption(runOnceOption);
rootCommand.AddOption(serverUrlOption);
rootCommand.AddOption(configOption);
rootCommand.AddOption(agentKeyOption);
rootCommand.AddOption(privacyTierOption);

rootCommand.SetHandler(async (context) =>
{
    var enrollToken = context.ParseResult.GetValueForOption(enrollOption);
    var runOnce = context.ParseResult.GetValueForOption(runOnceOption);
    var serverUrl = context.ParseResult.GetValueForOption(serverUrlOption);
    var configPath = context.ParseResult.GetValueForOption(configOption);
    var agentKey = context.ParseResult.GetValueForOption(agentKeyOption);
    var privacyTier = context.ParseResult.GetValueForOption(privacyTierOption);

    var builder = Host.CreateApplicationBuilder(args);

    // Configuration layering: appsettings.json -> platform config -> env vars -> CLI flags
    var platformConfigPath = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Meridian", "config.json")
        : "/etc/meridian-agent/config.json";

    if (configPath != null)
        platformConfigPath = configPath;

    builder.Configuration
        .AddJsonFile("appsettings.json", optional: true)
        .AddJsonFile(platformConfigPath, optional: true)
        .AddEnvironmentVariables("MERIDIAN_");

    // Apply CLI overrides
    var inMemoryOverrides = new Dictionary<string, string?>();
    if (serverUrl != null) inMemoryOverrides["AgentConfig:ServerUrl"] = serverUrl;
    if (agentKey != null) inMemoryOverrides["AgentConfig:AgentKey"] = agentKey;
    if (enrollToken != null) inMemoryOverrides["AgentConfig:EnrollmentToken"] = enrollToken;
    if (privacyTier != null) inMemoryOverrides["AgentConfig:PrivacyTier"] = privacyTier;
    if (inMemoryOverrides.Count > 0)
        builder.Configuration.AddInMemoryCollection(inMemoryOverrides);

    // Register AgentConfig
    builder.Services.Configure<AgentConfig>(builder.Configuration.GetSection("AgentConfig"));

    // Register platform-specific collector via OS detection
    if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        builder.Services.AddSingleton<ICollector, InvAgent.Collectors.Windows.WmiCollector>();
    else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        builder.Services.AddSingleton<ICollector, InvAgent.Collectors.Linux.ProcCollector>();
    else
        builder.Services.AddSingleton<ICollector, InvAgent.Collectors.MacOs.MacOsCollector>();

    var host = builder.Build();

    if (runOnce)
    {
        // Run a single collection and exit
        var collector = host.Services.GetRequiredService<ICollector>();
        var payload = await collector.CollectAsync();
        Console.WriteLine($"Collection complete. Hostname: {payload.Hostname}, OS: {payload.Os.Name}, Software count: {payload.Software.Count}");
        return;
    }

    await host.RunAsync();
});

return await rootCommand.InvokeAsync(args);

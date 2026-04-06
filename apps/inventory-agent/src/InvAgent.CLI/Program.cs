using System.CommandLine;
using System.Net;
using System.Runtime.InteropServices;
using InvAgent.Api;
using InvAgent.Collectors;
using InvAgent.Config;
using InvAgent.Http;
using InvAgent.Queue;
using InvAgent.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Http.Resilience;
using Polly;
using Polly.Retry;
using Polly.CircuitBreaker;
using Serilog;

// Determine platform-appropriate log path
static string GetAgentLogPath()
{
    if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Meridian", "logs", "agent-.log");
    return "/var/log/meridian-agent/agent-.log";
}

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
    .WriteTo.File(
        GetAgentLogPath(),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 7,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    .CreateLogger();

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

    // Use Serilog for structured logging
    builder.Services.AddSerilog(Log.Logger);

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

    // Register AgentConfig (both IOptions<AgentConfig> and concrete AgentConfig for direct injection)
    builder.Services.Configure<AgentConfig>(builder.Configuration.GetSection("AgentConfig"));
    builder.Services.AddSingleton(sp =>
        sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<AgentConfig>>().Value);

    // Register platform-specific collector via OS detection
    if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        builder.Services.AddSingleton<ICollector, InvAgent.Collectors.Windows.WmiCollector>();
    else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        builder.Services.AddSingleton<ICollector, InvAgent.Collectors.Linux.ProcCollector>();
    else
        builder.Services.AddSingleton<ICollector, InvAgent.Collectors.MacOs.MacOsCollector>();

    // Register HTTP client with Polly resilience (retry + circuit breaker)
    var agentConfigSection = builder.Configuration.GetSection("AgentConfig");
    var proxyUrl = agentConfigSection["HttpProxy"];

    builder.Services.AddHttpClient<MeridianApiClient>(client =>
    {
        // Base address + auth header set in MeridianApiClient constructor via AgentConfig
    })
    .ConfigurePrimaryHttpMessageHandler(() =>
    {
        var handler = new HttpClientHandler();
        if (!string.IsNullOrEmpty(proxyUrl))
        {
            handler.Proxy = new WebProxy(proxyUrl);
            handler.UseProxy = true;
        }
        return handler;
    })
    .AddResilienceHandler("meridian-retry", pipeline =>
    {
        pipeline.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 10,
            Delay = TimeSpan.FromSeconds(30),
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,
        });
        pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            SamplingDuration = TimeSpan.FromMinutes(2),
            FailureRatio = 0.5,
            MinimumThroughput = 3,
        });
    });

    // Register offline queue
    builder.Services.AddSingleton<LocalQueue>();

    // Register auto-update services
    builder.Services.AddSingleton<InvAgent.Worker.UpdateChecker>();
    builder.Services.AddSingleton<InvAgent.Worker.UpdateInstaller>();

    // Register daemon lifecycle support
    if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        builder.Services.AddWindowsService(options => options.ServiceName = "MeridianAgent");
    builder.Services.AddSystemd();

    if (runOnce)
    {
        // Run a single collection and submit, then exit
        var host = builder.Build();
        var collector = host.Services.GetRequiredService<ICollector>();
        var api = host.Services.GetRequiredService<MeridianApiClient>();
        var cfg = host.Services.GetRequiredService<AgentConfig>();

        // Enroll if enrollment token is provided and no agent key exists yet
        if (!string.IsNullOrEmpty(cfg.EnrollmentToken) && string.IsNullOrEmpty(cfg.AgentKey))
        {
            Log.Information("Enrolling agent...");
            var enrollResult = await api.EnrollAsync(
                cfg.EnrollmentToken,
                Environment.MachineName,
                System.Runtime.InteropServices.RuntimeInformation.OSDescription,
                "1.0.0");
            if (enrollResult?.AgentKey != null)
            {
                Log.Information("Enrolled successfully. AgentId: {AgentId}", enrollResult.AgentId);
                api.SetAgentKey(enrollResult.AgentKey);
            }
            else
            {
                Log.Error("Enrollment failed — server may have rejected the token.");
                host.Dispose();
                await Log.CloseAndFlushAsync();
                return;
            }
        }

        var payload = await collector.CollectAsync();
        Log.Information("Collection complete. Hostname: {Hostname}, OS: {Os}, Software count: {Count}",
            payload.Hostname, payload.Os.Name, payload.Software.Count);

        try
        {
            var snapshotId = await api.SubmitInventoryAsync(payload);
            Log.Information("Inventory submitted. SnapshotId: {SnapshotId}", snapshotId);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Submission failed: {Message}", ex.Message);
        }

        host.Dispose();
        await Log.CloseAndFlushAsync();
        return;
    }

    // Register background worker
    builder.Services.AddHostedService<AgentWorker>();

    var fullHost = builder.Build();

    // Start local diagnostic web UI on a background thread (minimal API on 127.0.0.1:8787)
    var agentConfig = fullHost.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<AgentConfig>>().Value;
    _ = Task.Run(() => LocalWebApi.StartAsync(
        agentConfig,
        fullHost.Services,
        fullHost.Services.GetRequiredService<LocalQueue>(),
        fullHost.Services.GetRequiredService<ICollector>(),
        fullHost.Services.GetRequiredService<MeridianApiClient>()));

    await fullHost.RunAsync();
});

var exitCode = await rootCommand.InvokeAsync(args);
await Log.CloseAndFlushAsync();
return exitCode;

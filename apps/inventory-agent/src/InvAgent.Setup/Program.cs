using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.Json;

namespace InvAgent.Setup;

/// <summary>
/// Meridian Inventory Agent — Interactive / Silent Windows Installer
///
/// Usage:
///   MeridianAgentSetup.exe                                       → guided interactive mode
///   MeridianAgentSetup.exe --server-url URL --token TOKEN [...]  → silent install
///
/// CLI switches (same as InvAgent.exe):
///   --server-url    Meridian ITSM server URL (required)
///   --token         Enrollment token (required)
///   --privacy-tier  full | restricted | anonymized (default: full)
///   --install-dir   Custom install path (default: C:\Program Files\MeridianAgent)
///   --quiet         Suppress interactive prompts; fail if required args are missing
/// </summary>
internal static class Program
{
    private const string DefaultInstallDir = @"C:\Program Files\MeridianAgent";
    private const string ServiceName = "MeridianAgent";
    private const string ConfigParent = @"Meridian";

    private static int Main(string[] args)
    {
        Console.Title = "Meridian ITSM Agent Installer";

        // ── Check Administrator ──────────────────────────────────────────────
        if (!IsAdmin())
        {
            WriteColor("ERROR: This installer must be run as Administrator.", ConsoleColor.Red);
            WriteColor("Right-click and choose 'Run as administrator'.", ConsoleColor.Gray);
            WaitForKey();
            return 1;
        }

        // ── Parse CLI args ───────────────────────────────────────────────────
        var serverUrl = GetArg(args, "--server-url");
        var token = GetArg(args, "--token");
        var privacyTier = GetArg(args, "--privacy-tier") ?? "full";
        var installDir = GetArg(args, "--install-dir") ?? DefaultInstallDir;
        var quiet = args.Contains("--quiet", StringComparer.OrdinalIgnoreCase);

        var interactive = string.IsNullOrEmpty(serverUrl) && string.IsNullOrEmpty(token) && !quiet;

        // ── Banner ───────────────────────────────────────────────────────────
        Console.WriteLine();
        WriteColor(@"    __  __           _     _ _             ", ConsoleColor.Cyan);
        WriteColor(@"   |  \/  | ___ _ __(_) __| (_) __ _ _ __  ", ConsoleColor.Cyan);
        WriteColor(@"   | |\/| |/ _ \ '__| |/ _` | |/ _` | '_ \ ", ConsoleColor.DarkCyan);
        WriteColor(@"   | |  | |  __/ |  | | (_| | | (_| | | | |", ConsoleColor.DarkCyan);
        WriteColor(@"   |_|  |_|\___|_|  |_|\__,_|_|\__,_|_| |_|", ConsoleColor.Magenta);
        WriteColor(@"                      I T S M                ", ConsoleColor.Magenta);
        Console.WriteLine();
        WriteColor("   ── Inventory Agent Installer ─────────────────", ConsoleColor.Gray);
        WriteColor("   Version 1.0.0", ConsoleColor.DarkGray);
        Console.WriteLine();

        if (interactive)
        {
            WriteColor("  No command-line arguments detected — starting guided setup.", ConsoleColor.Gray);
            Console.WriteLine();

            // Step 1: Server URL
            WriteColor("  Step 1 of 4: Server URL", ConsoleColor.Yellow);
            Console.Write("  Enter the Meridian ITSM server URL (e.g. https://meridian.company.com): ");
            serverUrl = ReadNonEmpty();

            Console.WriteLine();

            // Step 2: Enrollment Token
            WriteColor("  Step 2 of 4: Enrollment Token", ConsoleColor.Yellow);
            Console.Write("  Enter the enrollment token from Settings > Agents: ");
            token = ReadNonEmpty();

            Console.WriteLine();

            // Step 3: Privacy Tier
            WriteColor("  Step 3 of 4: Privacy Tier", ConsoleColor.Yellow);
            Console.WriteLine("    1) full        — All hardware, software, network, security data");
            Console.WriteLine("    2) restricted  — Hardware and OS only, no software/usernames/IPs");
            Console.WriteLine("    3) anonymized  — Minimal data, hostnames hashed, all PII stripped");
            Console.Write("  Choose [1/2/3] (default: 1): ");
            var tierChoice = Console.ReadLine()?.Trim();
            privacyTier = tierChoice switch
            {
                "2" => "restricted",
                "3" => "anonymized",
                _ => "full",
            };

            Console.WriteLine();

            // Step 4: Install directory
            WriteColor("  Step 4 of 4: Install Location", ConsoleColor.Yellow);
            Console.Write($"  Install directory (default: {DefaultInstallDir}): ");
            var customDir = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(customDir)) installDir = customDir;

            Console.WriteLine();

            // Confirm
            WriteColor("  ── Installation Summary ─────────────────────────", ConsoleColor.Cyan);
            Console.WriteLine($"    Server URL:    {serverUrl}");
            Console.WriteLine($"    Token:         {token![..Math.Min(8, token.Length)]}...");
            Console.WriteLine($"    Privacy Tier:  {privacyTier}");
            Console.WriteLine($"    Install Dir:   {installDir}");
            Console.WriteLine();
            Console.Write("  Proceed with installation? [Y/n]: ");
            var confirm = Console.ReadLine()?.Trim().ToLowerInvariant();
            if (confirm == "n" || confirm == "no")
            {
                WriteColor("  Installation cancelled.", ConsoleColor.Yellow);
                WaitForKey();
                return 0;
            }
            Console.WriteLine();
        }

        // ── Validate required inputs ─────────────────────────────────────────
        if (string.IsNullOrEmpty(serverUrl))
        {
            WriteColor("ERROR: --server-url is required.", ConsoleColor.Red);
            return 1;
        }
        if (string.IsNullOrEmpty(token))
        {
            WriteColor("ERROR: --token is required.", ConsoleColor.Red);
            return 1;
        }
        if (privacyTier is not ("full" or "restricted" or "anonymized"))
        {
            WriteColor($"ERROR: Invalid privacy tier '{privacyTier}'. Use full, restricted, or anonymized.", ConsoleColor.Red);
            return 1;
        }

        try
        {
            RunInstall(serverUrl!, token!, privacyTier, installDir);
        }
        catch (Exception ex)
        {
            WriteColor($"  ERROR: {ex.Message}", ConsoleColor.Red);
            if (interactive) WaitForKey();
            return 1;
        }

        if (interactive) WaitForKey();
        return 0;
    }

    // ─── Installation Steps ──────────────────────────────────────────────────

    private static void RunInstall(string serverUrl, string token, string privacyTier, string installDir)
    {
        var configDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            ConfigParent);

        // Step 1: Stop & remove existing service
        WriteStep("Checking for existing installation...");
        StopAndRemoveService();

        // Step 2: Create directories
        WriteStep("Creating directories...");
        Directory.CreateDirectory(installDir);
        Directory.CreateDirectory(configDir);
        Directory.CreateDirectory(Path.Combine(configDir, "logs"));

        // Step 3: Copy agent files
        WriteStep("Copying agent files...");
        CopyAgentFiles(installDir);

        // Step 4: Write config
        WriteStep("Writing configuration...");
        WriteConfig(configDir, serverUrl, token, privacyTier);

        // Step 5: Install service
        WriteStep("Installing Windows Service...");
        InstallService(installDir);

        // Step 6: Start service
        WriteStep("Starting service...");
        StartService();

        // Step 7: Verify
        Thread.Sleep(3000);
        var running = IsServiceRunning();

        Console.WriteLine();
        if (running)
        {
            WriteColor("  ┌──────────────────────────────────────────────┐", ConsoleColor.Green);
            WriteColor("  │   Meridian Agent installed successfully!     │", ConsoleColor.Green);
            WriteColor("  └──────────────────────────────────────────────┘", ConsoleColor.Green);
            Console.WriteLine();
            WriteColor($"    Service:  {ServiceName} (Running)", ConsoleColor.Green);
            WriteColor($"    Config:   {Path.Combine(configDir, "config.json")}", ConsoleColor.Gray);
            WriteColor($"    Logs:     {Path.Combine(configDir, "logs")}", ConsoleColor.Gray);
            WriteColor($"    Web UI:   http://127.0.0.1:8787", ConsoleColor.Gray);
        }
        else
        {
            WriteColor("  WARNING: Service installed but not running.", ConsoleColor.Yellow);
            WriteColor("  Check Event Viewer > Application for details.", ConsoleColor.Yellow);
        }
        Console.WriteLine();
    }

    // ─── Service Management ──────────────────────────────────────────────────

    private static void StopAndRemoveService()
    {
        RunCmd("sc.exe", $"stop {ServiceName}", ignoreErrors: true);
        Thread.Sleep(1000);
        RunCmd("sc.exe", $"delete {ServiceName}", ignoreErrors: true);
        Thread.Sleep(1000);
    }

    private static void InstallService(string installDir)
    {
        var exePath = Path.Combine(installDir, "InvAgent.exe");
        if (!File.Exists(exePath))
            throw new FileNotFoundException($"InvAgent.exe not found at {exePath}");

        RunCmd("sc.exe", $"create {ServiceName} binPath= \"{exePath}\" start= auto DisplayName= \"Meridian ITSM Inventory Agent\"");
        RunCmd("sc.exe", $"description {ServiceName} \"Collects hardware and software inventory for Meridian ITSM\"");
    }

    private static void StartService()
    {
        RunCmd("sc.exe", $"start {ServiceName}", ignoreErrors: true);
    }

    private static bool IsServiceRunning()
    {
        try
        {
            var output = RunCmd("sc.exe", $"query {ServiceName}", captureOutput: true);
            return output?.Contains("RUNNING", StringComparison.OrdinalIgnoreCase) ?? false;
        }
        catch { return false; }
    }

    // ─── File Operations ─────────────────────────────────────────────────────

    private static void CopyAgentFiles(string installDir)
    {
        // The setup exe lives alongside the agent files in the publish folder.
        // Use the actual EXE location (not AppContext.BaseDirectory, which points
        // to a temp extraction dir for single-file publishes).
        var sourceDir = Path.GetDirectoryName(Environment.ProcessPath!)!;

        var files = Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories);
        var setupExeName = Path.GetFileName(Environment.ProcessPath ?? "MeridianAgentSetup.exe");
        var copied = 0;

        foreach (var file in files)
        {
            var relativePath = Path.GetRelativePath(sourceDir, file);
            // Skip the setup exe itself
            if (relativePath.Equals(setupExeName, StringComparison.OrdinalIgnoreCase))
                continue;

            var destPath = Path.Combine(installDir, relativePath);
            var destDir = Path.GetDirectoryName(destPath)!;
            Directory.CreateDirectory(destDir);
            File.Copy(file, destPath, overwrite: true);
            copied++;
        }

        WriteColor($"    Copied {copied} files to {installDir}", ConsoleColor.Gray);
    }

    private static void WriteConfig(string configDir, string serverUrl, string token, string privacyTier)
    {
        var config = new
        {
            AgentConfig = new
            {
                ServerUrl = serverUrl,
                EnrollmentToken = token,
                PrivacyTier = privacyTier,
                HeartbeatIntervalSeconds = 300,
                InventoryIntervalSeconds = 14400,
                LocalWebUiPort = 8787,
                LocalQueueMaxSizeMb = 100,
                LogLevel = "Information",
            },
        };

        var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        var configPath = Path.Combine(configDir, "config.json");
        File.WriteAllText(configPath, json);
        WriteColor($"    Config written to {configPath}", ConsoleColor.Gray);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static string? GetArg(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        }
        return null;
    }

    private static string ReadNonEmpty()
    {
        while (true)
        {
            var input = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(input)) return input;
            Console.Write("  This field is required. Please enter a value: ");
        }
    }

    private static bool IsAdmin()
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) return false;
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static string RunCmd(string exe, string arguments, bool ignoreErrors = false, bool captureOutput = false)
    {
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = captureOutput,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };

        using var process = Process.Start(psi)!;
        var output = captureOutput ? process.StandardOutput.ReadToEnd() : "";
        var error = process.StandardError.ReadToEnd();
        process.WaitForExit(30_000);

        if (process.ExitCode != 0 && !ignoreErrors)
            throw new InvalidOperationException($"{exe} {arguments} failed (exit {process.ExitCode}): {error}");

        return output;
    }

    private static void WriteStep(string message)
    {
        WriteColor($"  → {message}", ConsoleColor.White);
    }

    private static void WriteColor(string text, ConsoleColor color)
    {
        var prev = Console.ForegroundColor;
        Console.ForegroundColor = color;
        Console.WriteLine(text);
        Console.ForegroundColor = prev;
    }

    private static void WaitForKey()
    {
        Console.WriteLine();
        Console.Write("  Press any key to exit...");
        Console.ReadKey(true);
    }
}

namespace InvAgent.Collectors.MacOs;

using InvAgent.Models;
using System.Text.Json;

/// <summary>
/// macOS inventory collector using system_profiler and other macOS utilities.
/// </summary>
public class MacOsCollector : ICollector
{
    public async Task<InventoryPayload> CollectAsync(CancellationToken ct = default)
    {
        var payload = new InventoryPayload
        {
            Hostname = Environment.MachineName,
            Platform = "MACOS",
            CollectedAt = DateTime.UtcNow
        };

        await Task.Run(() =>
        {
            payload.Os = CollectOsInfo();
            payload.Hardware = CollectHardwareInfo();
            payload.Software = CollectSoftware();
            payload.Services = CollectServices();
            payload.Processes = CollectProcesses();
            payload.Network = CollectNetwork();
            payload.LocalUsers = CollectLocalUsers();
        }, ct);

        return payload;
    }

    private static OsInfo CollectOsInfo()
    {
        var info = new OsInfo();
        try
        {
            var output = RunCommand("sw_vers", "");
            foreach (var line in output.Split('\n'))
            {
                if (line.StartsWith("ProductName:"))
                    info.Name = line.Split(':')[1].Trim();
                else if (line.StartsWith("ProductVersion:"))
                    info.Version = line.Split(':')[1].Trim();
                else if (line.StartsWith("BuildVersion:"))
                    info.BuildNumber = line.Split(':')[1].Trim();
            }

            info.Architecture = RunCommand("uname", "-m").Trim();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] OS info collection failed: {ex.Message}");
        }
        return info;
    }

    private static HardwareInfo CollectHardwareInfo()
    {
        var hardware = new HardwareInfo();
        try
        {
            var json = RunCommand("system_profiler", "SPHardwareDataType -json");
            if (!string.IsNullOrWhiteSpace(json))
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("SPHardwareDataType", out var items) &&
                    items.GetArrayLength() > 0)
                {
                    var item = items[0];

                    hardware.Model = GetJsonString(item, "machine_model");
                    hardware.Manufacturer = "Apple Inc.";
                    hardware.SerialNumber = GetJsonString(item, "serial_number");

                    var cpuName = GetJsonString(item, "cpu_type");
                    var coreCount = GetJsonString(item, "number_processors");
                    if (int.TryParse(coreCount, out int cores))
                    {
                        hardware.Cpus.Add(new CpuInfo { Name = cpuName, Cores = cores });
                    }

                    // Memory: e.g. "16 GB"
                    var memStr = GetJsonString(item, "physical_memory");
                    if (!string.IsNullOrEmpty(memStr))
                    {
                        var parts = memStr.Split(' ');
                        if (parts.Length >= 2 && double.TryParse(parts[0], out double memVal))
                        {
                            var multiplier = parts[1].ToUpper() switch
                            {
                                "TB" => 1024L * 1024 * 1024 * 1024,
                                "GB" => 1024L * 1024 * 1024,
                                "MB" => 1024L * 1024,
                                _ => 1024L * 1024 * 1024
                            };
                            hardware.TotalMemoryBytes = (long)(memVal * multiplier);
                        }
                    }
                }
            }

            // Disks via SPStorageDataType
            var storageJson = RunCommand("system_profiler", "SPStorageDataType -json");
            if (!string.IsNullOrWhiteSpace(storageJson))
            {
                using var doc = JsonDocument.Parse(storageJson);
                if (doc.RootElement.TryGetProperty("SPStorageDataType", out var storageItems))
                {
                    foreach (var disk in storageItems.EnumerateArray())
                    {
                        var diskName = GetJsonString(disk, "_name");
                        long sizeBytes = 0;
                        if (disk.TryGetProperty("size_in_bytes", out var sizeEl))
                            sizeBytes = sizeEl.GetInt64();

                        hardware.Disks.Add(new DiskInfo
                        {
                            DeviceName = diskName,
                            SizeBytes = sizeBytes,
                            Type = GetJsonString(disk, "spstorage_protocol")
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Hardware info collection failed: {ex.Message}");
        }
        return hardware;
    }

    private static List<SoftwareEntry> CollectSoftware()
    {
        var list = new List<SoftwareEntry>();
        try
        {
            var json = RunCommand("system_profiler", "SPApplicationsDataType -json");
            if (string.IsNullOrWhiteSpace(json)) return list;

            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("SPApplicationsDataType", out var apps))
            {
                foreach (var app in apps.EnumerateArray())
                {
                    list.Add(new SoftwareEntry
                    {
                        Name = GetJsonString(app, "_name"),
                        Version = GetJsonString(app, "version"),
                        Publisher = GetJsonString(app, "signed_by")
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Software collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<ServiceEntry> CollectServices()
    {
        var list = new List<ServiceEntry>();
        try
        {
            var output = RunCommand("launchctl", "list");
            foreach (var line in output.Split('\n').Skip(1)) // Skip header
            {
                var parts = line.Split('\t', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 3)
                {
                    var name = parts[2].Trim();
                    var status = parts[0].Trim();
                    list.Add(new ServiceEntry
                    {
                        Name = name,
                        DisplayName = name,
                        Status = status == "-" ? "Stopped" : "Running"
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Service collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<ProcessEntry> CollectProcesses()
    {
        var list = new List<ProcessEntry>();
        try
        {
            var output = RunCommand("ps", "aux");
            foreach (var line in output.Split('\n').Skip(1))
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 11) continue;

                if (int.TryParse(parts[1], out int pid) &&
                    double.TryParse(parts[2], out double cpu))
                {
                    list.Add(new ProcessEntry
                    {
                        Pid = pid,
                        Name = parts[10],
                        CpuPercent = cpu
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Process collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<NetworkInterface> CollectNetwork()
    {
        var list = new List<NetworkInterface>();
        try
        {
            var json = RunCommand("system_profiler", "SPNetworkDataType -json");
            if (string.IsNullOrWhiteSpace(json)) return list;

            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("SPNetworkDataType", out var interfaces))
            {
                foreach (var iface in interfaces.EnumerateArray())
                {
                    var ips = new List<string>();
                    if (iface.TryGetProperty("IPv4", out var ipv4) &&
                        ipv4.TryGetProperty("Addresses", out var addrs))
                    {
                        foreach (var addr in addrs.EnumerateArray())
                            ips.Add(addr.GetString() ?? "");
                    }

                    string mac = "";
                    if (iface.TryGetProperty("Ethernet", out var eth))
                        mac = GetJsonString(eth, "MAC Address");

                    list.Add(new NetworkInterface
                    {
                        Name = GetJsonString(iface, "_name"),
                        MacAddress = mac,
                        IpAddresses = ips
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Network collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<LocalUser> CollectLocalUsers()
    {
        var list = new List<LocalUser>();
        try
        {
            var usersOutput = RunCommand("dscl", ". -list /Users");
            var adminOutput = RunCommand("dscacheutil", "-q group -a name admin");

            var adminUsers = new HashSet<string>(StringComparer.Ordinal);
            foreach (var line in adminOutput.Split('\n'))
            {
                if (line.StartsWith("users:"))
                {
                    var parts = line[6..].Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    foreach (var u in parts) adminUsers.Add(u);
                }
            }

            foreach (var user in usersOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var username = user.Trim();
                // Skip system accounts (start with _) and daemon
                if (username.StartsWith("_") || username == "daemon" || username == "nobody") continue;

                list.Add(new LocalUser
                {
                    Username = username,
                    IsAdmin = adminUsers.Contains(username)
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Local users collection failed: {ex.Message}");
        }
        return list;
    }

    private static string GetJsonString(JsonElement element, string property)
    {
        try
        {
            return element.TryGetProperty(property, out var val) ? val.GetString() ?? "" : "";
        }
        catch
        {
            return "";
        }
    }

    private static string RunCommand(string command, string arguments)
    {
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo(command, arguments)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = System.Diagnostics.Process.Start(psi);
            if (process == null) return "";
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(30000);
            return output;
        }
        catch
        {
            return "";
        }
    }
}

namespace InvAgent.Collectors.Windows;

using InvAgent.Models;
using System.Runtime.InteropServices;

/// <summary>
/// Windows inventory collector using WMI (Windows Management Instrumentation).
/// Uses System.Management for WMI queries — only available on Windows.
/// </summary>
public class WmiCollector : ICollector
{
    public async Task<InventoryPayload> CollectAsync(CancellationToken ct = default)
    {
        var payload = new InventoryPayload
        {
            Hostname = Environment.MachineName,
            Platform = "WINDOWS",
            CollectedAt = DateTime.UtcNow
        };

        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            // Running cross-platform compilation check — return stub payload
            return payload;
        }

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
            // Use ManagementObjectSearcher on Windows — conditional compilation ensures this only runs on Windows
            info.Architecture = RuntimeInformation.OSArchitecture.ToString();
            info.Name = RuntimeInformation.OSDescription;
            info.Version = Environment.OSVersion.Version.ToString();
            info.BuildNumber = Environment.OSVersion.Version.Build.ToString();

#if WINDOWS
            // Full WMI collection via System.Management
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_OperatingSystem");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                info.Name = obj["Caption"]?.ToString() ?? info.Name;
                info.Version = obj["Version"]?.ToString() ?? info.Version;
                info.BuildNumber = obj["BuildNumber"]?.ToString() ?? info.BuildNumber;
                info.Architecture = obj["OSArchitecture"]?.ToString() ?? info.Architecture;
            }
#endif
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] OS info collection failed: {ex.Message}");
        }
        return info;
    }

    private static HardwareInfo CollectHardwareInfo()
    {
        var hardware = new HardwareInfo();
        try
        {
#if WINDOWS
            // Manufacturer + Model
            using (var cs = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_ComputerSystem"))
            foreach (System.Management.ManagementObject obj in cs.Get())
            {
                hardware.Manufacturer = obj["Manufacturer"]?.ToString() ?? "";
                hardware.Model = obj["Model"]?.ToString() ?? "";
            }

            // Serial number
            using (var bios = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_BIOS"))
            foreach (System.Management.ManagementObject obj in bios.Get())
            {
                hardware.SerialNumber = obj["SerialNumber"]?.ToString() ?? "";
            }

            // CPUs
            using (var cpuSearcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_Processor"))
            foreach (System.Management.ManagementObject obj in cpuSearcher.Get())
            {
                hardware.Cpus.Add(new CpuInfo
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    Cores = Convert.ToInt32(obj["NumberOfCores"] ?? 0),
                    Threads = Convert.ToInt32(obj["NumberOfLogicalProcessors"] ?? 0),
                    SpeedMhz = Convert.ToDouble(obj["MaxClockSpeed"] ?? 0)
                });
            }

            // Memory (sum of physical memory modules)
            long totalMem = 0;
            using (var memSearcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_PhysicalMemory"))
            foreach (System.Management.ManagementObject obj in memSearcher.Get())
            {
                totalMem += Convert.ToInt64(obj["Capacity"] ?? 0L);
            }
            hardware.TotalMemoryBytes = totalMem;

            // Disks
            using (var diskSearcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_DiskDrive"))
            foreach (System.Management.ManagementObject obj in diskSearcher.Get())
            {
                hardware.Disks.Add(new DiskInfo
                {
                    DeviceName = obj["DeviceID"]?.ToString() ?? "",
                    SizeBytes = Convert.ToInt64(obj["Size"] ?? 0L),
                    Type = obj["MediaType"]?.ToString() ?? ""
                });
            }
#endif
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Hardware info collection failed: {ex.Message}");
        }
        return hardware;
    }

    private static List<SoftwareEntry> CollectSoftware()
    {
        var list = new List<SoftwareEntry>();
        try
        {
#if WINDOWS
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_Product");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                list.Add(new SoftwareEntry
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    Version = obj["Version"]?.ToString() ?? "",
                    Publisher = obj["Vendor"]?.ToString() ?? ""
                });
            }
#endif
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Software collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<ServiceEntry> CollectServices()
    {
        var list = new List<ServiceEntry>();
        try
        {
#if WINDOWS
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_Service");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                list.Add(new ServiceEntry
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    DisplayName = obj["DisplayName"]?.ToString() ?? "",
                    Status = obj["State"]?.ToString() ?? "",
                    StartType = obj["StartMode"]?.ToString() ?? ""
                });
            }
#endif
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Service collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<ProcessEntry> CollectProcesses()
    {
        var list = new List<ProcessEntry>();
        try
        {
#if WINDOWS
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT ProcessId, Name, WorkingSetSize FROM Win32_Process");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                list.Add(new ProcessEntry
                {
                    Pid = Convert.ToInt32(obj["ProcessId"] ?? 0),
                    Name = obj["Name"]?.ToString() ?? "",
                    MemoryBytes = Convert.ToInt64(obj["WorkingSetSize"] ?? 0L)
                });
            }
#endif
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Process collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<NetworkInterface> CollectNetwork()
    {
        var list = new List<NetworkInterface>();
        try
        {
#if WINDOWS
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled=True");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                var ips = new List<string>();
                if (obj["IPAddress"] is string[] ipArr)
                    ips.AddRange(ipArr);

                list.Add(new NetworkInterface
                {
                    Name = obj["Description"]?.ToString() ?? "",
                    MacAddress = obj["MACAddress"]?.ToString() ?? "",
                    IpAddresses = ips
                });
            }
#endif
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Network collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<LocalUser> CollectLocalUsers()
    {
        var list = new List<LocalUser>();
        try
        {
#if WINDOWS
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_UserAccount WHERE LocalAccount=True");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                list.Add(new LocalUser
                {
                    Username = obj["Name"]?.ToString() ?? "",
                    IsAdmin = false  // Group membership check requires additional WMI query
                });
            }
#endif
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Local users collection failed: {ex.Message}");
        }
        return list;
    }
}

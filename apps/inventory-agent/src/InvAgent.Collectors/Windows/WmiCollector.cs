namespace InvAgent.Collectors.Windows;

using InvAgent.Models;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

/// <summary>
/// Windows inventory collector using WMI (Windows Management Instrumentation).
/// Uses System.Management for WMI queries and registry reads.
/// Each collection section is independently try/catch-guarded so a single
/// subsystem failure never blocks the rest of the inventory scan.
/// </summary>
public class WmiCollector : ICollector
{
    public async Task<InventoryPayload> CollectAsync(CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();

        var payload = new InventoryPayload
        {
            Hostname = Environment.MachineName,
            Platform = "WINDOWS",
            CollectedAt = DateTime.UtcNow
        };

        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return payload;
        }

        await Task.Run(() =>
        {
            // --- Identity ---
            CollectIdentity(payload);

            // --- OS ---
            payload.Os = CollectOsInfo();

            // --- Hardware ---
            payload.Hardware = CollectHardwareInfo();

            // --- Software (registry-based, NOT Win32_Product) ---
            payload.Software = CollectSoftware();

            // --- Windows Updates ---
            payload.WindowsUpdates = CollectWindowsUpdates();

            // --- Services ---
            payload.Services = CollectServices();

            // --- Processes ---
            payload.Processes = CollectProcesses();

            // --- Network ---
            payload.Network = CollectNetwork();

            // --- Local Users ---
            payload.LocalUsers = CollectLocalUsers();

            // --- Security Posture ---
            payload.Security = CollectSecurityPosture(payload.Hardware);

            // --- Directory Status ---
            payload.Directory = CollectDirectoryStatus();

            // --- BitLocker ---
            payload.BitLockerVolumes = CollectBitLocker();

            // --- Uptime ---
            payload.Uptime = CollectUptime();

            // --- Performance ---
            payload.Performance = CollectPerformance();

            // --- Virtualization ---
            payload.Virtualization = CollectVirtualization(payload.Hardware);

            // --- Connected hardware (v1.0.0.6) ---
            payload.Printers = CollectPrinters();
            payload.UsbDevices = CollectUsbDevices();
            payload.Cameras = CollectCameras();
            payload.BiometricDevices = CollectBiometricDevices();
            payload.SmartCardReaders = CollectSmartCardReaders();
            payload.AudioDevices = CollectAudioDevices();

            // --- Compliance hardware ---
            payload.TpmDetails = CollectTpmDetails();
            payload.Vbs = CollectVbsStatus();
        }, ct);

        sw.Stop();
        payload.ScanDurationMs = sw.Elapsed.TotalMilliseconds;
        return payload;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  IDENTITY
    // ═══════════════════════════════════════════════════════════════════════════

    private static void CollectIdentity(InventoryPayload payload)
    {
        try
        {
            // FQDN
            payload.Fqdn = System.Net.Dns.GetHostEntry(Environment.MachineName).HostName;
        }
        catch
        {
            payload.Fqdn = Environment.MachineName;
        }

        try
        {
            // DeviceType from ChassisTypes
            using var enclosure = new System.Management.ManagementObjectSearcher("SELECT ChassisTypes FROM Win32_SystemEnclosure");
            foreach (System.Management.ManagementObject obj in enclosure.Get())
            {
                if (obj["ChassisTypes"] is ushort[] types && types.Length > 0)
                {
                    payload.DeviceType = MapChassisType(types[0]);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] DeviceType collection failed: {ex.Message}");
        }

        // Fallback: PCSystemType
        if (string.IsNullOrEmpty(payload.DeviceType))
        {
            try
            {
                using var cs = new System.Management.ManagementObjectSearcher("SELECT PCSystemType FROM Win32_ComputerSystem");
                foreach (System.Management.ManagementObject obj in cs.Get())
                {
                    int pcType = Convert.ToInt32(obj["PCSystemType"] ?? 0);
                    payload.DeviceType = pcType switch
                    {
                        1 => "Desktop",
                        2 => "Laptop",
                        3 => "Workstation",
                        4 => "Server",
                        5 => "Server",
                        _ => "Desktop"
                    };
                }
            }
            catch { /* already have fallback */ }
        }

        try
        {
            // DomainWorkgroup
            using var cs = new System.Management.ManagementObjectSearcher("SELECT Domain, PartOfDomain FROM Win32_ComputerSystem");
            foreach (System.Management.ManagementObject obj in cs.Get())
            {
                bool partOfDomain = Convert.ToBoolean(obj["PartOfDomain"] ?? false);
                string domain = obj["Domain"]?.ToString() ?? "";
                payload.DomainWorkgroup = partOfDomain ? $"Domain: {domain}" : $"Workgroup: {domain}";
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Domain/Workgroup collection failed: {ex.Message}");
        }
    }

    private static string MapChassisType(int chassisType) => chassisType switch
    {
        3 or 4 or 5 or 6 or 7 or 15 or 16 => "Desktop",
        9 or 10 or 14 or 31 => "Laptop",
        23 or 28 => "Server",
        30 or 32 or 33 or 34 or 35 or 36 => "ThinClient",
        _ => "Desktop"
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  OS INFO
    // ═══════════════════════════════════════════════════════════════════════════

    private static OsInfo CollectOsInfo()
    {
        var info = new OsInfo
        {
            Architecture = RuntimeInformation.OSArchitecture.ToString(),
            Name = RuntimeInformation.OSDescription,
            Version = Environment.OSVersion.Version.ToString(),
            BuildNumber = Environment.OSVersion.Version.Build.ToString()
        };

        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_OperatingSystem");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                string caption = obj["Caption"]?.ToString() ?? "";
                info.Name = caption;
                info.Version = obj["Version"]?.ToString() ?? info.Version;
                info.BuildNumber = obj["BuildNumber"]?.ToString() ?? info.BuildNumber;
                info.Architecture = obj["OSArchitecture"]?.ToString() ?? info.Architecture;
                info.InstallDate = WmiDateToIso(obj["InstallDate"]?.ToString());
                info.LastBootTime = WmiDateToIso(obj["LastBootUpTime"]?.ToString());
                info.RegisteredUser = obj["RegisteredUser"]?.ToString() ?? "";
                info.SystemDirectory = obj["SystemDirectory"]?.ToString() ?? "";
                info.KernelVersion = obj["Version"]?.ToString() ?? "";
                info.Locale = obj["Locale"]?.ToString() ?? "";

                // Parse edition from caption (e.g., "Microsoft Windows 11 Pro" -> "Pro")
                info.Edition = ParseEdition(caption);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] OS info collection failed: {ex.Message}");
        }

        // TimeZone
        try
        {
            using var tzSearcher = new System.Management.ManagementObjectSearcher("SELECT Caption FROM Win32_TimeZone");
            foreach (System.Management.ManagementObject obj in tzSearcher.Get())
            {
                info.TimeZone = obj["Caption"]?.ToString() ?? "";
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] TimeZone collection failed: {ex.Message}");
        }

        return info;
    }

    private static string ParseEdition(string caption)
    {
        if (string.IsNullOrWhiteSpace(caption)) return "";

        // Typical: "Microsoft Windows 11 Pro", "Microsoft Windows Server 2022 Standard"
        string[] editionKeywords = ["Enterprise", "Pro", "Professional", "Home", "Education",
            "Standard", "Datacenter", "Essentials", "IoT", "LTSC", "LTSB"];
        foreach (var kw in editionKeywords)
        {
            if (caption.Contains(kw, StringComparison.OrdinalIgnoreCase))
                return kw;
        }
        return "";
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  HARDWARE INFO
    // ═══════════════════════════════════════════════════════════════════════════

    private static HardwareInfo CollectHardwareInfo()
    {
        var hw = new HardwareInfo();

        // --- ComputerSystem ---
        try
        {
            using var cs = new System.Management.ManagementObjectSearcher(
                "SELECT Manufacturer, Model, SystemType, Domain, DomainRole FROM Win32_ComputerSystem");
            foreach (System.Management.ManagementObject obj in cs.Get())
            {
                hw.Manufacturer = obj["Manufacturer"]?.ToString()?.Trim() ?? "";
                hw.Model = obj["Model"]?.ToString()?.Trim() ?? "";
                hw.SystemType = obj["SystemType"]?.ToString() ?? "";
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] ComputerSystem collection failed: {ex.Message}");
        }

        // --- BIOS ---
        try
        {
            using var bios = new System.Management.ManagementObjectSearcher(
                "SELECT SerialNumber, SMBIOSBIOSVersion, ReleaseDate, Manufacturer FROM Win32_BIOS");
            foreach (System.Management.ManagementObject obj in bios.Get())
            {
                hw.SerialNumber = obj["SerialNumber"]?.ToString()?.Trim() ?? "";
                hw.BiosVersion = obj["SMBIOSBIOSVersion"]?.ToString() ?? "";
                hw.BiosDate = WmiDateToIso(obj["ReleaseDate"]?.ToString());
                hw.BiosVendor = obj["Manufacturer"]?.ToString() ?? "";
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] BIOS collection failed: {ex.Message}");
        }

        // --- BaseBoard ---
        try
        {
            using var board = new System.Management.ManagementObjectSearcher(
                "SELECT Manufacturer, Product, SerialNumber FROM Win32_BaseBoard");
            foreach (System.Management.ManagementObject obj in board.Get())
            {
                hw.BoardManufacturer = obj["Manufacturer"]?.ToString() ?? "";
                hw.BoardModel = obj["Product"]?.ToString() ?? "";
                hw.BoardSerialNumber = obj["SerialNumber"]?.ToString() ?? "";
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] BaseBoard collection failed: {ex.Message}");
        }

        // --- UUID ---
        try
        {
            using var csp = new System.Management.ManagementObjectSearcher(
                "SELECT UUID FROM Win32_ComputerSystemProduct");
            foreach (System.Management.ManagementObject obj in csp.Get())
            {
                hw.UUID = obj["UUID"]?.ToString() ?? "";
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] UUID collection failed: {ex.Message}");
        }

        // --- TPM ---
        try
        {
            using var tpm = new System.Management.ManagementObjectSearcher(
                @"root\cimv2\Security\MicrosoftTpm",
                "SELECT IsActivated_InitialValue, SpecVersion FROM Win32_Tpm");
            foreach (System.Management.ManagementObject obj in tpm.Get())
            {
                hw.TpmPresent = true;
                hw.TpmVersion = obj["SpecVersion"]?.ToString() ?? "";
                // SpecVersion format: "2.0, 0, 1.59" — extract major version
                if (hw.TpmVersion.Contains(','))
                    hw.TpmVersion = hw.TpmVersion.Split(',')[0].Trim();
            }
        }
        catch
        {
            // TPM WMI namespace may not exist — not an error
            hw.TpmPresent = false;
        }

        // --- SecureBoot (registry) ---
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                @"SYSTEM\CurrentControlSet\Control\SecureBoot\State");
            if (key != null)
            {
                var val = key.GetValue("UEFISecureBootEnabled");
                hw.SecureBootEnabled = val != null && Convert.ToInt32(val) == 1;
            }
        }
        catch
        {
            hw.SecureBootEnabled = false;
        }

        // --- CPUs ---
        try
        {
            using var cpuSearcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_Processor");
            foreach (System.Management.ManagementObject obj in cpuSearcher.Get())
            {
                hw.Cpus.Add(new CpuInfo
                {
                    Name = obj["Name"]?.ToString()?.Trim() ?? "",
                    Manufacturer = obj["Manufacturer"]?.ToString() ?? "",
                    PartNumber = obj["PartNumber"]?.ToString()?.Trim() ?? "",
                    SerialNumber = obj["SerialNumber"]?.ToString()?.Trim() ?? "",
                    Cores = Convert.ToInt32(obj["NumberOfCores"] ?? 0),
                    Threads = Convert.ToInt32(obj["NumberOfLogicalProcessors"] ?? 0),
                    MaxSpeedMhz = Convert.ToDouble(obj["MaxClockSpeed"] ?? 0),
                    SpeedMhz = Convert.ToDouble(obj["CurrentClockSpeed"] ?? 0),
                    Socket = obj["SocketDesignation"]?.ToString() ?? "",
                    L2CacheKb = Convert.ToInt32(obj["L2CacheSize"] ?? 0),
                    L3CacheKb = Convert.ToInt32(obj["L3CacheSize"] ?? 0),
                    Architecture = MapCpuArchitecture(Convert.ToInt32(obj["Architecture"] ?? 0))
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] CPU collection failed: {ex.Message}");
        }

        // --- Memory Modules ---
        try
        {
            long totalMem = 0;
            using var memSearcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_PhysicalMemory");
            foreach (System.Management.ManagementObject obj in memSearcher.Get())
            {
                long capacity = Convert.ToInt64(obj["Capacity"] ?? 0L);
                totalMem += capacity;

                hw.MemoryModules.Add(new MemoryModule
                {
                    DeviceLocator = obj["DeviceLocator"]?.ToString() ?? "",
                    BankLabel = obj["BankLabel"]?.ToString() ?? "",
                    Manufacturer = obj["Manufacturer"]?.ToString()?.Trim() ?? "",
                    PartNumber = obj["PartNumber"]?.ToString()?.Trim() ?? "",
                    SerialNumber = obj["SerialNumber"]?.ToString()?.Trim() ?? "",
                    CapacityBytes = capacity,
                    SpeedMhz = Convert.ToInt32(obj["Speed"] ?? 0),
                    ConfiguredSpeedMhz = Convert.ToInt32(obj["ConfiguredClockSpeed"] ?? 0),
                    MemoryType = MapMemoryType(Convert.ToInt32(obj["SMBIOSMemoryType"] ?? 0)),
                    FormFactor = MapFormFactor(Convert.ToInt32(obj["FormFactor"] ?? 0)),
                    DataWidth = Convert.ToInt32(obj["DataWidth"] ?? 0)
                });
            }
            hw.TotalMemoryBytes = totalMem;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Memory collection failed: {ex.Message}");
        }

        // --- Available memory ---
        try
        {
            using var osSearcher = new System.Management.ManagementObjectSearcher(
                "SELECT FreePhysicalMemory FROM Win32_OperatingSystem");
            foreach (System.Management.ManagementObject obj in osSearcher.Get())
            {
                // FreePhysicalMemory is in KB
                hw.AvailableMemoryBytes = Convert.ToInt64(obj["FreePhysicalMemory"] ?? 0L) * 1024;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Available memory collection failed: {ex.Message}");
        }

        // --- Disks ---
        CollectDisks(hw);

        // --- GPUs ---
        try
        {
            using var gpuSearcher = new System.Management.ManagementObjectSearcher(
                "SELECT Name, AdapterCompatibility, AdapterRAM, DriverVersion, DriverDate FROM Win32_VideoController");
            foreach (System.Management.ManagementObject obj in gpuSearcher.Get())
            {
                hw.Gpus.Add(new GpuInfo
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    Manufacturer = obj["AdapterCompatibility"]?.ToString() ?? "",
                    VramBytes = Convert.ToInt64(obj["AdapterRAM"] ?? 0L),
                    DriverVersion = obj["DriverVersion"]?.ToString() ?? "",
                    DriverDate = WmiDateToIso(obj["DriverDate"]?.ToString())
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] GPU collection failed: {ex.Message}");
        }

        // --- Battery ---
        try
        {
            using var batSearcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_Battery");
            foreach (System.Management.ManagementObject obj in batSearcher.Get())
            {
                var battery = new BatteryInfo
                {
                    DesignCapacityMwh = Convert.ToInt32(obj["DesignCapacity"] ?? 0),
                    FullChargeCapacityMwh = Convert.ToInt32(obj["FullChargeCapacity"] ?? 0),
                    CurrentChargeMwh = Convert.ToInt32(obj["EstimatedChargeRemaining"] ?? 0),
                    ChargingState = MapBatteryStatus(Convert.ToInt32(obj["BatteryStatus"] ?? 0))
                };

                if (battery.DesignCapacityMwh > 0)
                    battery.HealthPercent = Math.Round((double)battery.FullChargeCapacityMwh / battery.DesignCapacityMwh * 100, 1);

                hw.Battery = battery;
                break; // typically one battery
            }

            // Chemistry from PortableBattery
            if (hw.Battery != null)
            {
                try
                {
                    using var pbSearcher = new System.Management.ManagementObjectSearcher("SELECT Chemistry FROM Win32_PortableBattery");
                    foreach (System.Management.ManagementObject obj in pbSearcher.Get())
                    {
                        hw.Battery.Chemistry = MapBatteryChemistry(Convert.ToInt32(obj["Chemistry"] ?? 0));
                        break;
                    }
                }
                catch { /* PortableBattery may not exist */ }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Battery collection failed: {ex.Message}");
        }

        // --- Monitors ---
        CollectMonitors(hw);

        return hw;
    }

    private static void CollectDisks(HardwareInfo hw)
    {
        try
        {
            // Build mapping: physical disk DeviceID -> DiskInfo
            var diskMap = new Dictionary<string, DiskInfo>();

            using (var diskSearcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_DiskDrive"))
            {
                foreach (System.Management.ManagementObject obj in diskSearcher.Get())
                {
                    var disk = new DiskInfo
                    {
                        DeviceName = obj["DeviceID"]?.ToString() ?? "",
                        Model = obj["Model"]?.ToString()?.Trim() ?? "",
                        SerialNumber = obj["SerialNumber"]?.ToString()?.Trim() ?? "",
                        FirmwareVersion = obj["FirmwareRevision"]?.ToString()?.Trim() ?? "",
                        SizeBytes = Convert.ToInt64(obj["Size"] ?? 0L),
                        MediaType = obj["MediaType"]?.ToString() ?? "",
                        BusType = obj["InterfaceType"]?.ToString() ?? ""
                    };
                    diskMap[disk.DeviceName] = disk;
                    hw.Disks.Add(disk);
                }
            }

            // Try MSFT_PhysicalDisk for SSD/HDD detection and SMART status
            try
            {
                using var msftDisk = new System.Management.ManagementObjectSearcher(
                    @"root\Microsoft\Windows\Storage",
                    "SELECT DeviceId, MediaType, OperationalStatus, FriendlyName FROM MSFT_PhysicalDisk");
                foreach (System.Management.ManagementObject obj in msftDisk.Get())
                {
                    int mediaType = Convert.ToInt32(obj["MediaType"] ?? 0);
                    string typeName = mediaType switch
                    {
                        3 => "HDD",
                        4 => "SSD",
                        5 => "SCM",
                        _ => ""
                    };

                    int opStatus = Convert.ToInt32(obj["OperationalStatus"] ?? 0);
                    string smartStatus = opStatus switch
                    {
                        // 0 = Unknown, 2 = OK/Healthy, 3 = Degraded, 5 = Predictive Failure
                        2 => "Healthy",
                        3 => "Warning",
                        5 => "Critical",
                        _ => "Unknown"
                    };

                    // Match by index (MSFT DeviceId is typically the disk index)
                    string devId = obj["DeviceId"]?.ToString() ?? "";
                    string matchKey = $"\\\\.\\PHYSICALDRIVE{devId}";
                    if (diskMap.TryGetValue(matchKey, out var matchedDisk))
                    {
                        if (!string.IsNullOrEmpty(typeName))
                            matchedDisk.Type = typeName;
                        matchedDisk.SmartStatus = smartStatus;
                    }
                }
            }
            catch
            {
                // MSFT_PhysicalDisk not available on older systems — fall back
                foreach (var disk in hw.Disks)
                {
                    if (string.IsNullOrEmpty(disk.Type))
                    {
                        disk.Type = disk.MediaType.Contains("Fixed", StringComparison.OrdinalIgnoreCase) ? "HDD" : disk.MediaType;
                    }
                }
            }

            // Map logical disks to physical via partition associations
            // Build: Partition -> PhysicalDisk DeviceID
            var partitionToDisk = new Dictionary<string, string>();
            try
            {
                using var d2p = new System.Management.ManagementObjectSearcher(
                    "SELECT * FROM Win32_DiskDriveToDiskPartition");
                foreach (System.Management.ManagementObject obj in d2p.Get())
                {
                    string antecedent = obj["Antecedent"]?.ToString() ?? "";
                    string dependent = obj["Dependent"]?.ToString() ?? "";
                    string diskId = ExtractWmiPath(antecedent);
                    string partId = ExtractWmiPath(dependent);
                    if (!string.IsNullOrEmpty(partId))
                        partitionToDisk[partId] = diskId;
                }
            }
            catch { /* association may not exist */ }

            // Build: LogicalDisk -> Partition
            var logicalToPartition = new Dictionary<string, string>();
            try
            {
                using var l2p = new System.Management.ManagementObjectSearcher(
                    "SELECT * FROM Win32_LogicalDiskToPartition");
                foreach (System.Management.ManagementObject obj in l2p.Get())
                {
                    string antecedent = obj["Antecedent"]?.ToString() ?? "";
                    string dependent = obj["Dependent"]?.ToString() ?? "";
                    string partId = ExtractWmiPath(antecedent);
                    string logicalId = ExtractWmiPath(dependent);
                    if (!string.IsNullOrEmpty(logicalId))
                        logicalToPartition[logicalId] = partId;
                }
            }
            catch { /* association may not exist */ }

            // Collect logical disks (volumes)
            using (var logSearcher = new System.Management.ManagementObjectSearcher(
                "SELECT DeviceID, FileSystem, Size, FreeSpace, VolumeName FROM Win32_LogicalDisk WHERE DriveType=3"))
            {
                foreach (System.Management.ManagementObject obj in logSearcher.Get())
                {
                    string driveLetter = obj["DeviceID"]?.ToString() ?? "";
                    var volume = new VolumeInfo
                    {
                        DriveLetter = driveLetter,
                        MountPoint = driveLetter + "\\",
                        FileSystem = obj["FileSystem"]?.ToString() ?? "",
                        SizeBytes = Convert.ToInt64(obj["Size"] ?? 0L),
                        FreeBytes = Convert.ToInt64(obj["FreeSpace"] ?? 0L),
                        Label = obj["VolumeName"]?.ToString() ?? ""
                    };

                    // Try to find which physical disk this volume belongs to
                    bool assigned = false;
                    if (logicalToPartition.TryGetValue(driveLetter, out string? partId) &&
                        partitionToDisk.TryGetValue(partId, out string? diskDevId) &&
                        diskMap.TryGetValue(diskDevId, out var parentDisk))
                    {
                        parentDisk.Volumes.Add(volume);
                        assigned = true;
                    }

                    // Fallback: assign to first disk
                    if (!assigned && hw.Disks.Count > 0)
                    {
                        hw.Disks[0].Volumes.Add(volume);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Disk collection failed: {ex.Message}");
        }
    }

    private static void CollectMonitors(HardwareInfo hw)
    {
        try
        {
            // Try WmiMonitorID from root\wmi for accurate data
            try
            {
                using var monSearcher = new System.Management.ManagementObjectSearcher(
                    @"root\wmi", "SELECT ManufacturerName, SerialNumberID, UserFriendlyName FROM WmiMonitorID");
                foreach (System.Management.ManagementObject obj in monSearcher.Get())
                {
                    hw.Monitors.Add(new MonitorInfo
                    {
                        Manufacturer = DecodeWmiByteArray(obj["ManufacturerName"] as ushort[]),
                        SerialNumber = DecodeWmiByteArray(obj["SerialNumberID"] as ushort[]),
                        Name = DecodeWmiByteArray(obj["UserFriendlyName"] as ushort[])
                    });
                }
            }
            catch
            {
                // Fall back to Win32_DesktopMonitor
                using var monSearcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_DesktopMonitor");
                foreach (System.Management.ManagementObject obj in monSearcher.Get())
                {
                    hw.Monitors.Add(new MonitorInfo
                    {
                        Name = obj["Name"]?.ToString() ?? "",
                        Manufacturer = obj["MonitorManufacturer"]?.ToString() ?? ""
                    });
                }
            }

            // Get resolution from VideoController
            if (hw.Monitors.Count > 0)
            {
                int idx = 0;
                using var vidSearcher = new System.Management.ManagementObjectSearcher(
                    "SELECT CurrentHorizontalResolution, CurrentVerticalResolution FROM Win32_VideoController");
                foreach (System.Management.ManagementObject obj in vidSearcher.Get())
                {
                    int hRes = Convert.ToInt32(obj["CurrentHorizontalResolution"] ?? 0);
                    int vRes = Convert.ToInt32(obj["CurrentVerticalResolution"] ?? 0);
                    if (hRes > 0 && vRes > 0 && idx < hw.Monitors.Count)
                    {
                        hw.Monitors[idx].Resolution = $"{hRes}x{vRes}";
                    }
                    idx++;
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Monitor collection failed: {ex.Message}");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  SOFTWARE (Registry-based — avoids slow/problematic Win32_Product)
    // ═══════════════════════════════════════════════════════════════════════════

    private static List<SoftwareEntry> CollectSoftware()
    {
        var list = new List<SoftwareEntry>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            string[] regPaths =
            [
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
            ];

            // HKLM paths
            foreach (string regPath in regPaths)
            {
                ReadSoftwareFromRegistry(Microsoft.Win32.Registry.LocalMachine, regPath, list, seen);
            }

            // HKCU path
            ReadSoftwareFromRegistry(Microsoft.Win32.Registry.CurrentUser,
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", list, seen);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Software collection failed: {ex.Message}");
        }

        return list;
    }

    private static void ReadSoftwareFromRegistry(
        Microsoft.Win32.RegistryKey hive, string path,
        List<SoftwareEntry> list, HashSet<string> seen)
    {
        try
        {
            using var key = hive.OpenSubKey(path);
            if (key == null) return;

            foreach (string subKeyName in key.GetSubKeyNames())
            {
                try
                {
                    using var subKey = key.OpenSubKey(subKeyName);
                    if (subKey == null) continue;

                    string name = subKey.GetValue("DisplayName")?.ToString() ?? "";
                    if (string.IsNullOrWhiteSpace(name)) continue;

                    string version = subKey.GetValue("DisplayVersion")?.ToString() ?? "";
                    string dedupKey = $"{name}|{version}";
                    if (!seen.Add(dedupKey)) continue;

                    DateTime? installDate = null;
                    string dateStr = subKey.GetValue("InstallDate")?.ToString() ?? "";
                    if (dateStr.Length == 8 &&
                        DateTime.TryParseExact(dateStr, "yyyyMMdd", CultureInfo.InvariantCulture,
                            DateTimeStyles.None, out var parsed))
                    {
                        installDate = parsed;
                    }

                    // Determine architecture from registry path
                    string arch = path.Contains("WOW6432Node") ? "x86" : "x64";

                    list.Add(new SoftwareEntry
                    {
                        Name = name,
                        Version = version,
                        Publisher = subKey.GetValue("Publisher")?.ToString() ?? "",
                        InstalledDate = installDate,
                        InstallLocation = subKey.GetValue("InstallLocation")?.ToString() ?? "",
                        InstallSource = subKey.GetValue("InstallSource")?.ToString() ?? "",
                        Architecture = arch
                    });
                }
                catch { /* skip individual entry */ }
            }
        }
        catch { /* registry path may not exist */ }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  WINDOWS UPDATES
    // ═══════════════════════════════════════════════════════════════════════════

    private static List<WindowsUpdate> CollectWindowsUpdates()
    {
        var list = new List<WindowsUpdate>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT HotFixID, Description, InstalledOn, InstalledBy FROM Win32_QuickFixEngineering");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                DateTime? installedDate = null;
                string installedOn = obj["InstalledOn"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(installedOn) &&
                    DateTime.TryParse(installedOn, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
                {
                    installedDate = dt;
                }

                list.Add(new WindowsUpdate
                {
                    HotFixId = obj["HotFixID"]?.ToString() ?? "",
                    Description = obj["Description"]?.ToString() ?? "",
                    InstalledDate = installedDate,
                    InstalledBy = obj["InstalledBy"]?.ToString() ?? ""
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Windows Updates collection failed: {ex.Message}");
        }
        return list;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  SERVICES
    // ═══════════════════════════════════════════════════════════════════════════

    private static List<ServiceEntry> CollectServices()
    {
        var list = new List<ServiceEntry>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT Name, DisplayName, State, StartMode, StartName, PathName, ProcessId, Description FROM Win32_Service");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                list.Add(new ServiceEntry
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    DisplayName = obj["DisplayName"]?.ToString() ?? "",
                    Status = obj["State"]?.ToString() ?? "",
                    StartType = obj["StartMode"]?.ToString() ?? "",
                    Account = obj["StartName"]?.ToString() ?? "",
                    BinaryPath = obj["PathName"]?.ToString() ?? "",
                    Pid = Convert.ToInt32(obj["ProcessId"] ?? 0),
                    Description = obj["Description"]?.ToString() ?? ""
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Service collection failed: {ex.Message}");
        }
        return list;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PROCESSES
    // ═══════════════════════════════════════════════════════════════════════════

    private static List<ProcessEntry> CollectProcesses()
    {
        var list = new List<ProcessEntry>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT ProcessId, Name, WorkingSetSize FROM Win32_Process");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                list.Add(new ProcessEntry
                {
                    Pid = Convert.ToInt32(obj["ProcessId"] ?? 0),
                    Name = obj["Name"]?.ToString() ?? "",
                    MemoryBytes = Convert.ToInt64(obj["WorkingSetSize"] ?? 0L)
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Process collection failed: {ex.Message}");
        }
        return list;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  NETWORK
    // ═══════════════════════════════════════════════════════════════════════════

    private static List<NetworkInterface> CollectNetwork()
    {
        var list = new List<NetworkInterface>();
        try
        {
            // Build adapter speed map from Win32_NetworkAdapter
            var adapterSpeedMap = new Dictionary<int, long>();
            var adapterTypeMap = new Dictionary<int, string>();
            var adapterNetConnMap = new Dictionary<int, string>();

            try
            {
                using var adapterSearcher = new System.Management.ManagementObjectSearcher(
                    "SELECT Index, Speed, AdapterType, NetConnectionID FROM Win32_NetworkAdapter WHERE NetEnabled=True");
                foreach (System.Management.ManagementObject obj in adapterSearcher.Get())
                {
                    int index = Convert.ToInt32(obj["Index"] ?? -1);
                    long speed = Convert.ToInt64(obj["Speed"] ?? 0L);
                    if (index >= 0)
                    {
                        adapterSpeedMap[index] = speed / 1_000_000; // bps to Mbps
                        adapterTypeMap[index] = obj["AdapterType"]?.ToString() ?? "";
                        adapterNetConnMap[index] = obj["NetConnectionID"]?.ToString() ?? "";
                    }
                }
            }
            catch { /* speed data is supplementary */ }

            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled=True");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                int index = Convert.ToInt32(obj["Index"] ?? -1);

                var nic = new NetworkInterface
                {
                    Name = obj["Description"]?.ToString() ?? "",
                    MacAddress = obj["MACAddress"]?.ToString() ?? "",
                    DhcpEnabled = Convert.ToBoolean(obj["DHCPEnabled"] ?? false),
                    DhcpServer = obj["DHCPServer"]?.ToString() ?? ""
                };

                if (obj["IPAddress"] is string[] ipArr)
                    nic.IpAddresses.AddRange(ipArr);
                if (obj["IPSubnet"] is string[] subArr)
                    nic.SubnetMasks.AddRange(subArr);
                if (obj["DefaultIPGateway"] is string[] gwArr)
                    nic.DefaultGateways.AddRange(gwArr);
                if (obj["DNSServerSearchOrder"] is string[] dnsArr)
                    nic.DnsServers.AddRange(dnsArr);

                if (adapterSpeedMap.TryGetValue(index, out long speedMbps))
                    nic.SpeedMbps = speedMbps;
                if (adapterTypeMap.TryGetValue(index, out string? aType))
                    nic.AdapterType = aType ?? "";
                if (adapterNetConnMap.TryGetValue(index, out string? netConn))
                {
                    // Use NetConnectionID for adapter type classification
                    if (!string.IsNullOrEmpty(netConn) && string.IsNullOrEmpty(nic.AdapterType))
                        nic.AdapterType = netConn;
                }

                nic.Status = "Up"; // IPEnabled=True implies active

                list.Add(nic);
            }

            // Wireless SSID via netsh
            try
            {
                string ssid = RunCommand("netsh", "wlan show interfaces")
                    .Split('\n')
                    .FirstOrDefault(l => l.Trim().StartsWith("SSID", StringComparison.OrdinalIgnoreCase)
                                        && !l.Trim().StartsWith("BSSID", StringComparison.OrdinalIgnoreCase))
                    ?.Split(':', 2).ElementAtOrDefault(1)?.Trim() ?? "";

                if (!string.IsNullOrEmpty(ssid))
                {
                    // Assign to wireless adapter (heuristic: adapter type contains "Wireless" or "Wi-Fi")
                    var wirelessNic = list.FirstOrDefault(n =>
                        n.Name.Contains("Wireless", StringComparison.OrdinalIgnoreCase) ||
                        n.Name.Contains("Wi-Fi", StringComparison.OrdinalIgnoreCase) ||
                        n.AdapterType.Contains("Wireless", StringComparison.OrdinalIgnoreCase));
                    if (wirelessNic != null)
                        wirelessNic.WirelessSsid = ssid;
                }
            }
            catch { /* wireless SSID is supplementary */ }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Network collection failed: {ex.Message}");
        }
        return list;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  LOCAL USERS
    // ═══════════════════════════════════════════════════════════════════════════

    private static List<LocalUser> CollectLocalUsers()
    {
        var list = new List<LocalUser>();
        try
        {
            // Get local admin group members
            var adminUsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using var groupSearcher = new System.Management.ManagementObjectSearcher(
                    "SELECT * FROM Win32_GroupUser WHERE GroupComponent=\"Win32_Group.Domain='" +
                    Environment.MachineName + "',Name='Administrators'\"");
                foreach (System.Management.ManagementObject obj in groupSearcher.Get())
                {
                    string partComponent = obj["PartComponent"]?.ToString() ?? "";
                    // Extract username from "Win32_UserAccount.Domain=\"...\",Name=\"username\""
                    var nameMatch = System.Text.RegularExpressions.Regex.Match(partComponent, "Name=\"([^\"]+)\"");
                    if (nameMatch.Success)
                        adminUsers.Add(nameMatch.Groups[1].Value);
                }
            }
            catch { /* admin check is supplementary */ }

            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_UserAccount WHERE LocalAccount=True");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                string username = obj["Name"]?.ToString() ?? "";
                list.Add(new LocalUser
                {
                    Username = username,
                    IsAdmin = adminUsers.Contains(username)
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Local users collection failed: {ex.Message}");
        }
        return list;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  SECURITY POSTURE
    // ═══════════════════════════════════════════════════════════════════════════

    private static SecurityPosture CollectSecurityPosture(HardwareInfo hw)
    {
        var sec = new SecurityPosture();

        // Copy hardware-detected values
        sec.SecureBootEnabled = hw.SecureBootEnabled;
        sec.TpmReady = hw.TpmPresent;

        // --- Antivirus ---
        try
        {
            using var avSearcher = new System.Management.ManagementObjectSearcher(
                @"root\SecurityCenter2", "SELECT displayName, productState FROM AntiVirusProduct");
            foreach (System.Management.ManagementObject obj in avSearcher.Get())
            {
                sec.AntivirusProduct = obj["displayName"]?.ToString() ?? "";
                int productState = Convert.ToInt32(obj["productState"] ?? 0);

                // productState bitmask: bits 12-8 = scanner state, bit 4 = real-time
                // 0x1000 (bit 12) = on, 0x0000 = off for real-time protection
                sec.RealTimeProtectionEnabled = ((productState >> 12) & 0x1) == 1;

                // Take the first non-empty AV product
                if (!string.IsNullOrEmpty(sec.AntivirusProduct))
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] AV detection failed: {ex.Message}");
        }

        // --- Firewall ---
        try
        {
            using var fwSearcher = new System.Management.ManagementObjectSearcher(
                @"root\SecurityCenter2", "SELECT displayName FROM FirewallProduct");
            bool hasFirewall = false;
            foreach (System.Management.ManagementObject obj in fwSearcher.Get())
            {
                hasFirewall = true;
                sec.FirewallProfile = obj["displayName"]?.ToString() ?? "";
                break;
            }
            sec.FirewallEnabled = hasFirewall;
        }
        catch
        {
            // Fallback: check registry
            try
            {
                using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                    @"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\StandardProfile");
                if (key != null)
                {
                    sec.FirewallEnabled = Convert.ToInt32(key.GetValue("EnableFirewall") ?? 0) == 1;
                }
            }
            catch { /* firewall status is supplementary */ }
        }

        // --- Pending updates / Reboot required ---
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired");
            sec.RebootRequired = key != null;
        }
        catch { /* supplementary */ }

        // --- Disk encryption (from BitLocker volumes collected separately) ---
        sec.EncryptionProduct = "BitLocker";

        // --- Local admin accounts ---
        try
        {
            using var groupSearcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_GroupUser WHERE GroupComponent=\"Win32_Group.Domain='" +
                Environment.MachineName + "',Name='Administrators'\"");
            foreach (System.Management.ManagementObject obj in groupSearcher.Get())
            {
                string partComponent = obj["PartComponent"]?.ToString() ?? "";
                var nameMatch = System.Text.RegularExpressions.Regex.Match(partComponent, "Name=\"([^\"]+)\"");
                if (nameMatch.Success)
                    sec.LocalAdminAccounts.Add(nameMatch.Groups[1].Value);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Local admin enumeration failed: {ex.Message}");
        }

        return sec;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  DIRECTORY STATUS
    // ═══════════════════════════════════════════════════════════════════════════

    private static DirectoryStatus CollectDirectoryStatus()
    {
        var dir = new DirectoryStatus();

        // AD Domain
        try
        {
            using var cs = new System.Management.ManagementObjectSearcher(
                "SELECT PartOfDomain, Domain FROM Win32_ComputerSystem");
            foreach (System.Management.ManagementObject obj in cs.Get())
            {
                dir.AdJoined = Convert.ToBoolean(obj["PartOfDomain"] ?? false);
                dir.AdDomainName = obj["Domain"]?.ToString() ?? "";
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] AD status collection failed: {ex.Message}");
        }

        // Azure AD / MDM via dsregcmd
        try
        {
            string dsregOutput = RunCommand("dsregcmd", "/status");
            var lines = dsregOutput.Split('\n');

            foreach (string line in lines)
            {
                string trimmed = line.Trim();
                if (trimmed.StartsWith("AzureAdJoined", StringComparison.OrdinalIgnoreCase))
                {
                    dir.AzureAdJoined = trimmed.EndsWith("YES", StringComparison.OrdinalIgnoreCase);
                }
                else if (trimmed.StartsWith("DeviceId", StringComparison.OrdinalIgnoreCase))
                {
                    dir.AzureAdDeviceId = trimmed.Split(':').ElementAtOrDefault(1)?.Trim() ?? "";
                }
                else if (trimmed.StartsWith("MdmUrl", StringComparison.OrdinalIgnoreCase))
                {
                    string mdmUrl = trimmed.Split(':').ElementAtOrDefault(1)?.Trim() ?? "";
                    dir.MdmEnrolled = !string.IsNullOrEmpty(mdmUrl);
                    if (mdmUrl.Contains("microsoft", StringComparison.OrdinalIgnoreCase))
                        dir.MdmProvider = "Microsoft Intune";
                    else if (!string.IsNullOrEmpty(mdmUrl))
                        dir.MdmProvider = mdmUrl;
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] dsregcmd parsing failed: {ex.Message}");
        }

        return dir;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  BITLOCKER
    // ═══════════════════════════════════════════════════════════════════════════

    private static List<BitLockerVolume> CollectBitLocker()
    {
        var list = new List<BitLockerVolume>();
        try
        {
            string output = RunCommand("manage-bde", "-status");
            if (string.IsNullOrWhiteSpace(output)) return list;

            BitLockerVolume? current = null;
            foreach (string line in output.Split('\n'))
            {
                string trimmed = line.Trim();

                // New volume starts with "Volume X:" pattern
                if (trimmed.StartsWith("Volume", StringComparison.OrdinalIgnoreCase) && trimmed.Contains(':'))
                {
                    // Extract drive letter (e.g., "Volume C: [OSDisk]" -> "C:")
                    var match = System.Text.RegularExpressions.Regex.Match(trimmed, @"([A-Z]:)");
                    if (match.Success)
                    {
                        current = new BitLockerVolume { DriveLetter = match.Groups[1].Value };
                        list.Add(current);
                    }
                }
                else if (current != null)
                {
                    if (trimmed.StartsWith("Protection Status", StringComparison.OrdinalIgnoreCase))
                        current.ProtectionStatus = ExtractValue(trimmed);
                    else if (trimmed.StartsWith("Encryption Method", StringComparison.OrdinalIgnoreCase))
                        current.EncryptionMethod = ExtractValue(trimmed);
                    else if (trimmed.StartsWith("Lock Status", StringComparison.OrdinalIgnoreCase))
                        current.LockStatus = ExtractValue(trimmed);
                    else if (trimmed.StartsWith("Percentage Encrypted", StringComparison.OrdinalIgnoreCase))
                    {
                        string pctStr = ExtractValue(trimmed).Replace("%", "").Trim();
                        if (double.TryParse(pctStr, NumberStyles.Any, CultureInfo.InvariantCulture, out double pct))
                            current.EncryptionPercentage = pct;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] BitLocker collection failed: {ex.Message}");
        }
        return list;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  UPTIME
    // ═══════════════════════════════════════════════════════════════════════════

    private static UptimeInfo CollectUptime()
    {
        var info = new UptimeInfo();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT LastBootUpTime FROM Win32_OperatingSystem");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                string wmiDate = obj["LastBootUpTime"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(wmiDate))
                {
                    var bootTime = System.Management.ManagementDateTimeConverter.ToDateTime(wmiDate);
                    info.LastBootTime = bootTime.ToUniversalTime();
                    info.Uptime = DateTime.UtcNow - info.LastBootTime;
                    info.UptimeFormatted = $"{info.Uptime.Days}d {info.Uptime.Hours}h {info.Uptime.Minutes}m";
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Uptime collection failed: {ex.Message}");
        }
        return info;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PERFORMANCE SNAPSHOT
    // ═══════════════════════════════════════════════════════════════════════════

    private static PerformanceSnapshot CollectPerformance()
    {
        var perf = new PerformanceSnapshot();

        // CPU utilization
        try
        {
            using var cpuSearcher = new System.Management.ManagementObjectSearcher(
                "SELECT LoadPercentage FROM Win32_Processor");
            double totalLoad = 0;
            int count = 0;
            foreach (System.Management.ManagementObject obj in cpuSearcher.Get())
            {
                totalLoad += Convert.ToDouble(obj["LoadPercentage"] ?? 0);
                count++;
            }
            if (count > 0)
                perf.CpuUtilizationPercent = Math.Round(totalLoad / count, 1);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] CPU perf collection failed: {ex.Message}");
        }

        // Memory utilization
        try
        {
            using var memSearcher = new System.Management.ManagementObjectSearcher(
                "SELECT TotalVisibleMemorySize, FreePhysicalMemory FROM Win32_OperatingSystem");
            foreach (System.Management.ManagementObject obj in memSearcher.Get())
            {
                long totalKb = Convert.ToInt64(obj["TotalVisibleMemorySize"] ?? 0L);
                long freeKb = Convert.ToInt64(obj["FreePhysicalMemory"] ?? 0L);
                long usedKb = totalKb - freeKb;

                perf.MemoryAvailableBytes = freeKb * 1024;
                perf.MemoryUsedBytes = usedKb * 1024;

                if (totalKb > 0)
                    perf.MemoryUtilizationPercent = Math.Round((double)usedKb / totalKb * 100, 1);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Memory perf collection failed: {ex.Message}");
        }

        // Disk usage per drive
        try
        {
            using var diskSearcher = new System.Management.ManagementObjectSearcher(
                "SELECT DeviceID, Size, FreeSpace FROM Win32_LogicalDisk WHERE DriveType=3");
            foreach (System.Management.ManagementObject obj in diskSearcher.Get())
            {
                long size = Convert.ToInt64(obj["Size"] ?? 0L);
                long free = Convert.ToInt64(obj["FreeSpace"] ?? 0L);
                long used = size - free;

                perf.DiskUsages.Add(new DiskUsage
                {
                    MountPoint = obj["DeviceID"]?.ToString() ?? "",
                    FreeBytes = free,
                    UsedBytes = used,
                    UsagePercent = size > 0 ? Math.Round((double)used / size * 100, 1) : 0
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Disk perf collection failed: {ex.Message}");
        }

        return perf;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  VIRTUALIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    private static VirtualizationInfo CollectVirtualization(HardwareInfo hw)
    {
        var virt = new VirtualizationInfo();

        try
        {
            string model = hw.Model;
            string biosSerial = hw.SerialNumber;
            string manufacturer = hw.Manufacturer;

            // Detect hypervisor from model/manufacturer
            if (model.Contains("Virtual Machine", StringComparison.OrdinalIgnoreCase) ||
                manufacturer.Contains("Microsoft Corporation", StringComparison.OrdinalIgnoreCase) &&
                model.Contains("Virtual", StringComparison.OrdinalIgnoreCase))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "Hyper-V";
            }
            else if (model.Contains("VMware", StringComparison.OrdinalIgnoreCase) ||
                     manufacturer.Contains("VMware", StringComparison.OrdinalIgnoreCase))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "VMware";
            }
            else if (model.Contains("VirtualBox", StringComparison.OrdinalIgnoreCase) ||
                     manufacturer.Contains("innotek", StringComparison.OrdinalIgnoreCase))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "VirtualBox";
            }
            else if (manufacturer.Contains("QEMU", StringComparison.OrdinalIgnoreCase) ||
                     model.Contains("KVM", StringComparison.OrdinalIgnoreCase))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "KVM";
            }
            else if (manufacturer.Contains("Xen", StringComparison.OrdinalIgnoreCase))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "Xen";
            }

            // Check HypervisorPresent
            if (!virt.IsVirtual)
            {
                using var cs = new System.Management.ManagementObjectSearcher(
                    "SELECT HypervisorPresent FROM Win32_ComputerSystem");
                foreach (System.Management.ManagementObject obj in cs.Get())
                {
                    if (Convert.ToBoolean(obj["HypervisorPresent"] ?? false))
                    {
                        virt.IsVirtual = true;
                        if (string.IsNullOrEmpty(virt.HypervisorType))
                            virt.HypervisorType = "Unknown";
                    }
                }
            }

            // Cloud provider detection via BIOS/serial patterns
            if (virt.IsVirtual)
            {
                if (biosSerial.StartsWith("ec2", StringComparison.OrdinalIgnoreCase) ||
                    manufacturer.Contains("Amazon", StringComparison.OrdinalIgnoreCase))
                {
                    virt.CloudProvider = "AWS";
                }
                else if (biosSerial.Contains("Azure", StringComparison.OrdinalIgnoreCase) ||
                         manufacturer.Contains("Microsoft", StringComparison.OrdinalIgnoreCase) &&
                         virt.HypervisorType == "Hyper-V")
                {
                    virt.CloudProvider = "Azure";
                }
                else if (biosSerial.Contains("Google", StringComparison.OrdinalIgnoreCase) ||
                         manufacturer.Contains("Google", StringComparison.OrdinalIgnoreCase))
                {
                    virt.CloudProvider = "GCP";
                }

                // Allocated resources
                if (hw.Cpus.Count > 0)
                    virt.AllocatedVcpus = hw.Cpus.Sum(c => c.Threads);
                virt.AllocatedRamBytes = hw.TotalMemoryBytes;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Virtualization detection failed: {ex.Message}");
        }

        return virt;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Converts WMI datetime string (yyyyMMddHHmmss.ffffff±UUU) to ISO 8601.
    /// </summary>
    private static string WmiDateToIso(string? wmiDate)
    {
        if (string.IsNullOrEmpty(wmiDate)) return "";
        try
        {
            var dt = System.Management.ManagementDateTimeConverter.ToDateTime(wmiDate);
            return dt.ToUniversalTime().ToString("o");
        }
        catch
        {
            return wmiDate ?? "";
        }
    }

    /// <summary>
    /// Maps Win32_Processor.Architecture to string.
    /// </summary>
    private static string MapCpuArchitecture(int arch) => arch switch
    {
        0 => "x86",
        5 => "ARM64",
        9 => "x64",
        12 => "ARM64",
        _ => $"Unknown({arch})"
    };

    /// <summary>
    /// Maps Win32_PhysicalMemory.SMBIOSMemoryType to DDR type string.
    /// </summary>
    private static string MapMemoryType(int type) => type switch
    {
        20 => "DDR",
        21 => "DDR2",
        22 => "DDR2",
        24 => "DDR3",
        26 => "DDR4",
        34 => "DDR5",
        _ => type > 0 ? $"Type({type})" : ""
    };

    /// <summary>
    /// Maps Win32_PhysicalMemory.FormFactor to string.
    /// </summary>
    private static string MapFormFactor(int ff) => ff switch
    {
        8 => "DIMM",
        12 => "SODIMM",
        _ => ff > 0 ? $"FormFactor({ff})" : ""
    };

    /// <summary>
    /// Maps Win32_Battery.BatteryStatus to charging state string.
    /// </summary>
    private static string MapBatteryStatus(int status) => status switch
    {
        1 => "Discharging",
        2 => "Charging", // AC connected
        3 => "FullyCharged",
        4 => "Low",
        5 => "Critical",
        6 => "Charging",
        7 => "Charging", // Charging and High
        8 => "Charging", // Charging and Low
        9 => "Charging", // Charging and Critical
        _ => "Unknown"
    };

    /// <summary>
    /// Maps Win32_PortableBattery.Chemistry to string.
    /// </summary>
    private static string MapBatteryChemistry(int chem) => chem switch
    {
        1 => "Other",
        2 => "Unknown",
        3 => "Lead Acid",
        4 => "NiCd",
        5 => "NiMH",
        6 => "LiIon",
        7 => "Zinc Air",
        8 => "LiPo",
        _ => ""
    };

    /// <summary>
    /// Decodes a WMI byte/ushort array (from WmiMonitorID) to a string.
    /// </summary>
    private static string DecodeWmiByteArray(ushort[]? arr)
    {
        if (arr == null || arr.Length == 0) return "";
        var chars = arr.Where(c => c > 0).Select(c => (char)c).ToArray();
        return new string(chars).Trim();
    }

    /// <summary>
    /// Extracts the WMI object path value from an association reference string.
    /// E.g., \\MACHINE\root\cimv2:Win32_DiskPartition.DeviceID="Disk #0, Partition #0"
    ///       -> "Disk #0, Partition #0"
    /// </summary>
    private static string ExtractWmiPath(string reference)
    {
        if (string.IsNullOrEmpty(reference)) return "";
        // Extract the value between the last pair of quotes
        int lastQuote = reference.LastIndexOf('"');
        if (lastQuote <= 0) return "";
        int prevQuote = reference.LastIndexOf('"', lastQuote - 1);
        if (prevQuote < 0) return "";
        return reference.Substring(prevQuote + 1, lastQuote - prevQuote - 1);
    }

    /// <summary>
    /// Extracts value after colon from "Key:    Value" format lines.
    /// </summary>
    private static string ExtractValue(string line)
    {
        int idx = line.IndexOf(':');
        return idx >= 0 ? line[(idx + 1)..].Trim() : "";
    }

    /// <summary>
    /// Runs an external command and returns stdout. Returns empty string on failure.
    /// </summary>
    private static string RunCommand(string fileName, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi);
            if (proc == null) return "";
            string output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(10_000); // 10 second timeout
            return output;
        }
        catch
        {
            return "";
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  CONNECTED HARDWARE (v1.0.0.6)
    // ═══════════════════════════════════════════════════════════════════════════

    private static List<Printer> CollectPrinters()
    {
        var printers = new List<Printer>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_Printer");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                printers.Add(new Printer
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    DriverName = obj["DriverName"]?.ToString() ?? "",
                    PortName = obj["PortName"]?.ToString() ?? "",
                    Default = obj["Default"] is bool d && d,
                    Network = obj["Network"] is bool n && n,
                    Shared = obj["Shared"] is bool s && s,
                    ShareName = obj["ShareName"]?.ToString() ?? "",
                    Status = obj["Status"]?.ToString() ?? "",
                    Location = obj["Location"]?.ToString() ?? "",
                    Comment = obj["Comment"]?.ToString() ?? "",
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Printers collection failed: {ex.Message}");
        }
        return printers;
    }

    private static List<UsbDevice> CollectUsbDevices()
    {
        var devices = new List<UsbDevice>();
        try
        {
            // Filter to USB-attached PnP entities. The pattern matches both 'USB\\' and 'USBSTOR\\' families.
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_PnPEntity WHERE PNPDeviceID LIKE 'USB%'");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                var hwIdRaw = obj["HardwareID"];
                var hwIds = hwIdRaw is string[] arr ? arr.ToList() : new List<string>();

                devices.Add(new UsbDevice
                {
                    DeviceId = obj["PNPDeviceID"]?.ToString() ?? "",
                    Name = obj["Name"]?.ToString() ?? "",
                    Manufacturer = obj["Manufacturer"]?.ToString() ?? "",
                    HardwareId = hwIds,
                    Service = obj["Service"]?.ToString() ?? "",
                    Status = obj["Status"]?.ToString() ?? "",
                    ClassGuid = obj["ClassGuid"]?.ToString() ?? "",
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] USB devices collection failed: {ex.Message}");
        }
        return devices;
    }

    private static List<Camera> CollectCameras()
    {
        var cameras = new List<Camera>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_PnPEntity WHERE PNPClass = 'Camera' OR PNPClass = 'Image'");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                cameras.Add(new Camera
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    Manufacturer = obj["Manufacturer"]?.ToString() ?? "",
                    DeviceId = obj["PNPDeviceID"]?.ToString() ?? "",
                    Status = obj["Status"]?.ToString() ?? "",
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Cameras collection failed: {ex.Message}");
        }
        return cameras;
    }

    private static List<BiometricDevice> CollectBiometricDevices()
    {
        var devices = new List<BiometricDevice>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_PnPEntity WHERE PNPClass = 'Biometric'");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                var name = obj["Name"]?.ToString() ?? "";
                var lower = name.ToLowerInvariant();
                var deviceType = lower.Contains("fingerprint") ? "Fingerprint"
                    : (lower.Contains("iris") ? "Iris"
                    : (lower.Contains("face") || lower.Contains("ir camera") ? "Face/IR" : "Other"));

                devices.Add(new BiometricDevice
                {
                    Name = name,
                    Manufacturer = obj["Manufacturer"]?.ToString() ?? "",
                    DeviceType = deviceType,
                    Status = obj["Status"]?.ToString() ?? "",
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Biometric devices collection failed: {ex.Message}");
        }
        return devices;
    }

    private static List<SmartCardReader> CollectSmartCardReaders()
    {
        var readers = new List<SmartCardReader>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT * FROM Win32_PnPEntity WHERE PNPClass = 'SmartCardReader' OR PNPClass = 'SCSIAdapter' AND Name LIKE '%smart card%'");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                readers.Add(new SmartCardReader
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    Manufacturer = obj["Manufacturer"]?.ToString() ?? "",
                    Status = obj["Status"]?.ToString() ?? "",
                    DriverVersion = "",
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Smart card readers collection failed: {ex.Message}");
        }
        return readers;
    }

    private static List<AudioDevice> CollectAudioDevices()
    {
        var devices = new List<AudioDevice>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_SoundDevice");
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                devices.Add(new AudioDevice
                {
                    Name = obj["Name"]?.ToString() ?? "",
                    Manufacturer = obj["Manufacturer"]?.ToString() ?? "",
                    ProductName = obj["ProductName"]?.ToString() ?? "",
                    Status = obj["Status"]?.ToString() ?? "",
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] Audio devices collection failed: {ex.Message}");
        }
        return devices;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  COMPLIANCE HARDWARE
    // ═══════════════════════════════════════════════════════════════════════════

    private static TpmDetails CollectTpmDetails()
    {
        var tpm = new TpmDetails();
        try
        {
            // TPM lives in a non-default WMI namespace; access requires admin in some configurations.
            var scope = new System.Management.ManagementScope(@"\\.\ROOT\CIMV2\Security\MicrosoftTpm");
            scope.Connect();

            using var searcher = new System.Management.ManagementObjectSearcher(scope,
                new System.Management.ObjectQuery("SELECT * FROM Win32_Tpm"));
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                tpm.Present = true;
                tpm.Manufacturer = obj["ManufacturerIdTxt"]?.ToString() ?? "";
                tpm.ManufacturerId = obj["ManufacturerId"]?.ToString() ?? "";
                tpm.ManufacturerVersion = obj["ManufacturerVersion"]?.ToString() ?? "";
                tpm.SpecVersion = obj["SpecVersion"]?.ToString() ?? "";
                tpm.PhysicalPresenceVersion = obj["PhysicalPresenceVersionInfo"]?.ToString() ?? "";
                tpm.IsActivated = obj["IsActivated_InitialValue"] is bool a && a;
                tpm.IsEnabled = obj["IsEnabled_InitialValue"] is bool e && e;
                tpm.IsOwned = obj["IsOwned_InitialValue"] is bool o && o;
                // IsReady is reported via a method; treat the combined flags as a proxy.
                tpm.IsReady = tpm.IsActivated && tpm.IsEnabled && tpm.IsOwned;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] TPM details collection failed: {ex.Message}");
        }
        return tpm;
    }

    private static VbsStatus CollectVbsStatus()
    {
        var vbs = new VbsStatus();
        try
        {
            // Win32_DeviceGuard exposes VBS / HVCI / Credential Guard status.
            var scope = new System.Management.ManagementScope(@"\\.\ROOT\Microsoft\Windows\DeviceGuard");
            scope.Connect();

            using var searcher = new System.Management.ManagementObjectSearcher(scope,
                new System.Management.ObjectQuery("SELECT * FROM Win32_DeviceGuard"));
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                // VirtualizationBasedSecurityStatus: 0=off, 1=configured but not running, 2=running.
                if (obj["VirtualizationBasedSecurityStatus"] is uint vbsStatus)
                {
                    vbs.Enabled = vbsStatus >= 1;
                    vbs.Running = vbsStatus == 2;
                }

                // SecurityServicesRunning: array of uint. 1 = Credential Guard, 2 = HVCI.
                if (obj["SecurityServicesRunning"] is uint[] running)
                {
                    vbs.CredentialGuardRunning = running.Contains((uint)1);
                    vbs.HvciRunning = running.Contains((uint)2);
                }
                if (obj["SecurityServicesConfigured"] is uint[] configured)
                {
                    vbs.CredentialGuardEnabled = configured.Contains((uint)1);
                    vbs.HvciEnabled = configured.Contains((uint)2);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WmiCollector] VBS status collection failed: {ex.Message}");
        }
        return vbs;
    }
}

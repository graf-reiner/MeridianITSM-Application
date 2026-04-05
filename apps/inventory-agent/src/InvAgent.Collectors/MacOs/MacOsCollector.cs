namespace InvAgent.Collectors.MacOs;

using InvAgent.Models;
using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

/// <summary>
/// macOS inventory collector using system_profiler, sysctl, and other macOS utilities.
/// Populates all tiers of InventoryPayload using native macOS data sources.
/// </summary>
public class MacOsCollector : ICollector
{
    public async Task<InventoryPayload> CollectAsync(CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();

        var payload = new InventoryPayload
        {
            Hostname = Environment.MachineName,
            Platform = "MACOS",
            CollectedAt = DateTime.UtcNow
        };

        await Task.Run(() =>
        {
            // Tier 1: Identity & Inventory
            payload.Fqdn = CollectFqdn();
            payload.Os = CollectOsInfo();
            payload.Hardware = CollectHardwareInfo();
            payload.DeviceType = DeriveDeviceType(payload.Hardware.Model);
            payload.Software = CollectSoftware();
            payload.Services = CollectServices();
            payload.Processes = CollectProcesses();
            payload.Network = CollectNetwork();
            payload.LocalUsers = CollectLocalUsers();

            // Tier 2: Security & Compliance
            payload.Security = CollectSecurityPosture();
            payload.Directory = CollectDirectoryStatus();

            // Tier 3: Operational Health
            payload.Uptime = CollectUptime();
            payload.Performance = CollectPerformance();
            payload.Virtualization = CollectVirtualization();
        }, ct);

        sw.Stop();
        payload.ScanDurationMs = sw.Elapsed.TotalMilliseconds;
        return payload;
    }

    // ─── FQDN ───────────────────────────────────────────────────────────────

    private static string CollectFqdn()
    {
        try
        {
            var fqdn = RunCommand("scutil", "--get HostName").Trim();
            if (!string.IsNullOrEmpty(fqdn)) return fqdn;

            fqdn = RunCommand("hostname", "-f").Trim();
            if (!string.IsNullOrEmpty(fqdn)) return fqdn;

            // Fallback: DNS lookup
            var hostname = Environment.MachineName;
            try
            {
                var entry = System.Net.Dns.GetHostEntry(hostname);
                return entry.HostName;
            }
            catch { return hostname; }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] FQDN collection failed: {ex.Message}");
            return Environment.MachineName;
        }
    }

    // ─── Device Type ────────────────────────────────────────────────────────

    private static string DeriveDeviceType(string model)
    {
        if (string.IsNullOrEmpty(model)) return "Desktop";
        var m = model.ToLowerInvariant();
        if (m.Contains("macbook")) return "Laptop";
        if (m.Contains("imac")) return "Desktop";
        if (m.Contains("mac mini") || m.Contains("macmini")) return "Desktop";
        if (m.Contains("mac pro") || m.Contains("macpro")) return "Desktop";
        if (m.Contains("mac studio") || m.Contains("macstudio")) return "Desktop";
        if (m.Contains("virtual") || m.Contains("vmware") || m.Contains("parallels")) return "VM";
        return "Desktop";
    }

    // ─── OS Info ────────────────────────────────────────────────────────────

    private static OsInfo CollectOsInfo()
    {
        var info = new OsInfo();
        try
        {
            // sw_vers: ProductName, ProductVersion, BuildVersion
            var swVers = RunCommand("sw_vers", "");
            foreach (var line in swVers.Split('\n'))
            {
                if (line.StartsWith("ProductName:"))
                    info.Name = line.Split(':', 2)[1].Trim();
                else if (line.StartsWith("ProductVersion:"))
                    info.Version = line.Split(':', 2)[1].Trim();
                else if (line.StartsWith("BuildVersion:"))
                    info.BuildNumber = line.Split(':', 2)[1].Trim();
            }

            // Kernel version and architecture
            info.KernelVersion = RunCommand("uname", "-r").Trim();
            info.Architecture = RunCommand("uname", "-m").Trim();

            // system_profiler SPSoftwareDataType for boot time, registered user
            var swJson = RunCommand("system_profiler", "SPSoftwareDataType -json");
            if (!string.IsNullOrWhiteSpace(swJson))
            {
                using var doc = JsonDocument.Parse(swJson);
                if (doc.RootElement.TryGetProperty("SPSoftwareDataType", out var items) &&
                    items.GetArrayLength() > 0)
                {
                    var item = items[0];
                    info.RegisteredUser = GetJsonString(item, "user_name");

                    var bootTime = GetJsonString(item, "boot_time");
                    if (!string.IsNullOrEmpty(bootTime))
                        info.LastBootTime = bootTime;
                }
            }

            // SystemDirectory
            info.SystemDirectory = "/System";

            // TimeZone
            var tzOutput = RunCommand("systemsetup", "-gettimezone");
            // Output: "Time Zone: America/New_York"
            if (tzOutput.Contains(':'))
                info.TimeZone = tzOutput.Split(':', 2)[1].Trim();

            // Locale
            var locale = RunCommand("defaults", "read -g AppleLocale").Trim();
            if (!string.IsNullOrEmpty(locale))
                info.Locale = locale;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] OS info collection failed: {ex.Message}");
        }
        return info;
    }

    // ─── Hardware Info ──────────────────────────────────────────────────────

    private static HardwareInfo CollectHardwareInfo()
    {
        var hw = new HardwareInfo();
        try
        {
            // SPHardwareDataType: core hardware details
            var hwJson = RunCommand("system_profiler", "SPHardwareDataType -json");
            if (!string.IsNullOrWhiteSpace(hwJson))
            {
                using var doc = JsonDocument.Parse(hwJson);
                if (doc.RootElement.TryGetProperty("SPHardwareDataType", out var items) &&
                    items.GetArrayLength() > 0)
                {
                    var item = items[0];
                    hw.Model = GetJsonString(item, "machine_model");
                    hw.Manufacturer = "Apple Inc.";
                    hw.SerialNumber = GetJsonString(item, "serial_number");
                    hw.UUID = GetJsonString(item, "platform_UUID");
                    hw.BoardManufacturer = "Apple Inc.";
                    hw.BoardModel = GetJsonString(item, "machine_model");

                    // CPU info from hardware profile
                    var cpuName = GetJsonString(item, "chip_type");
                    if (string.IsNullOrEmpty(cpuName))
                        cpuName = GetJsonString(item, "cpu_type");

                    int cores = 0;
                    var coreStr = GetJsonString(item, "total_number_of_cores");
                    // May contain "10 (8 performance and 2 efficiency)"
                    if (!string.IsNullOrEmpty(coreStr))
                    {
                        var match = Regex.Match(coreStr, @"^(\d+)");
                        if (match.Success) int.TryParse(match.Groups[1].Value, out cores);
                    }
                    if (cores == 0)
                    {
                        var numProc = GetJsonString(item, "number_processors");
                        int.TryParse(numProc, out cores);
                    }

                    hw.Cpus.Add(CollectCpuInfo(cpuName, cores));

                    // Memory from hardware profile: e.g. "16 GB" or "16384 MB"
                    var memStr = GetJsonString(item, "physical_memory");
                    hw.TotalMemoryBytes = ParseMemoryString(memStr);
                }
            }

            // Memory modules
            hw.MemoryModules = CollectMemoryModules();

            // Available memory from sysctl
            try
            {
                var pageSize = RunCommand("sysctl", "-n hw.pagesize").Trim();
                var vmStat = RunCommand("vm_stat", "");
                if (long.TryParse(pageSize, out long ps))
                {
                    long freePages = ParseVmStatLine(vmStat, "Pages free");
                    long inactivePages = ParseVmStatLine(vmStat, "Pages inactive");
                    hw.AvailableMemoryBytes = (freePages + inactivePages) * ps;
                }
            }
            catch { /* non-critical */ }

            // Storage / Disks
            hw.Disks = CollectDisks();

            // GPUs
            hw.Gpus = CollectGpus();

            // Battery
            hw.Battery = CollectBattery();

            // Monitors
            hw.Monitors = CollectMonitors();

            // TPM / Secure Enclave
            CollectSecurityHardware(hw);

            // SystemType detection (physical vs virtual)
            var modelLower = (hw.Model ?? "").ToLowerInvariant();
            hw.SystemType = (modelLower.Contains("virtual") || modelLower.Contains("vmware") || modelLower.Contains("parallels"))
                ? "Virtual" : "Physical";
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Hardware info collection failed: {ex.Message}");
        }
        return hw;
    }

    // ─── CPU Info ───────────────────────────────────────────────────────────

    private static CpuInfo CollectCpuInfo(string nameFromProfile, int coresFromProfile)
    {
        var cpu = new CpuInfo
        {
            Name = nameFromProfile,
            Manufacturer = "Apple",
            Cores = coresFromProfile
        };

        try
        {
            // Try sysctl for Intel-specific info
            var brandString = RunCommand("sysctl", "-n machdep.cpu.brand_string").Trim();
            if (!string.IsNullOrEmpty(brandString))
            {
                cpu.Name = brandString;
                if (brandString.Contains("Intel"))
                    cpu.Manufacturer = "Intel";
                else if (brandString.Contains("Apple"))
                    cpu.Manufacturer = "Apple";
            }

            // Thread count
            var ncpu = RunCommand("sysctl", "-n hw.ncpu").Trim();
            if (int.TryParse(ncpu, out int threads))
                cpu.Threads = threads;

            // Physical CPU cores
            var physCpu = RunCommand("sysctl", "-n hw.physicalcpu").Trim();
            if (int.TryParse(physCpu, out int physCores) && physCores > 0)
                cpu.Cores = physCores;

            // CPU frequency (Intel only, returns 0 on Apple Silicon)
            var freqStr = RunCommand("sysctl", "-n hw.cpufrequency").Trim();
            if (long.TryParse(freqStr, out long freqHz) && freqHz > 0)
                cpu.SpeedMhz = freqHz / 1_000_000.0;

            // Max frequency
            var maxFreqStr = RunCommand("sysctl", "-n hw.cpufrequency_max").Trim();
            if (long.TryParse(maxFreqStr, out long maxFreqHz) && maxFreqHz > 0)
                cpu.MaxSpeedMhz = maxFreqHz / 1_000_000.0;

            // Architecture
            cpu.Architecture = RunCommand("uname", "-m").Trim();

            // L2 and L3 cache
            var l2 = RunCommand("sysctl", "-n hw.l2cachesize").Trim();
            if (long.TryParse(l2, out long l2Bytes) && l2Bytes > 0)
                cpu.L2CacheKb = (int)(l2Bytes / 1024);

            var l3 = RunCommand("sysctl", "-n hw.l3cachesize").Trim();
            if (long.TryParse(l3, out long l3Bytes) && l3Bytes > 0)
                cpu.L3CacheKb = (int)(l3Bytes / 1024);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] CPU info collection failed: {ex.Message}");
        }
        return cpu;
    }

    // ─── Memory Modules ─────────────────────────────────────────────────────

    private static List<MemoryModule> CollectMemoryModules()
    {
        var modules = new List<MemoryModule>();
        try
        {
            var memJson = RunCommand("system_profiler", "SPMemoryDataType -json");
            if (string.IsNullOrWhiteSpace(memJson)) return modules;

            using var doc = JsonDocument.Parse(memJson);
            if (!doc.RootElement.TryGetProperty("SPMemoryDataType", out var memData)) return modules;

            foreach (var bank in memData.EnumerateArray())
            {
                // Apple Silicon may report unified memory as a single entry
                if (bank.TryGetProperty("_items", out var dimms))
                {
                    foreach (var dimm in dimms.EnumerateArray())
                    {
                        var mod = new MemoryModule
                        {
                            DeviceLocator = GetJsonString(dimm, "dimm_locator"),
                            Manufacturer = GetJsonString(dimm, "dimm_manufacturer"),
                            PartNumber = GetJsonString(dimm, "dimm_part_number"),
                            SerialNumber = GetJsonString(dimm, "dimm_serial_number"),
                            MemoryType = GetJsonString(dimm, "dimm_type")
                        };

                        // Parse capacity: e.g. "8 GB"
                        var sizeStr = GetJsonString(dimm, "dimm_size");
                        mod.CapacityBytes = ParseMemoryString(sizeStr);

                        // Parse speed: e.g. "2400 MHz"
                        var speedStr = GetJsonString(dimm, "dimm_speed");
                        if (!string.IsNullOrEmpty(speedStr))
                        {
                            var match = Regex.Match(speedStr, @"(\d+)");
                            if (match.Success && int.TryParse(match.Groups[1].Value, out int speed))
                            {
                                mod.SpeedMhz = speed;
                                mod.ConfiguredSpeedMhz = speed;
                            }
                        }

                        modules.Add(mod);
                    }
                }
                else
                {
                    // Unified memory: single entry with size reported at bank level
                    var sizeStr = GetJsonString(bank, "dimm_size");
                    if (string.IsNullOrEmpty(sizeStr))
                        sizeStr = GetJsonString(bank, "SPMemoryDataType");

                    if (!string.IsNullOrEmpty(sizeStr))
                    {
                        modules.Add(new MemoryModule
                        {
                            DeviceLocator = "Unified",
                            Manufacturer = "Apple",
                            CapacityBytes = ParseMemoryString(sizeStr),
                            MemoryType = GetJsonString(bank, "dimm_type")
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Memory module collection failed: {ex.Message}");
        }
        return modules;
    }

    // ─── Disks ──────────────────────────────────────────────────────────────

    private static List<DiskInfo> CollectDisks()
    {
        var disks = new List<DiskInfo>();
        try
        {
            var storageJson = RunCommand("system_profiler", "SPStorageDataType -json");
            if (string.IsNullOrWhiteSpace(storageJson)) return disks;

            using var doc = JsonDocument.Parse(storageJson);
            if (!doc.RootElement.TryGetProperty("SPStorageDataType", out var storageItems)) return disks;

            foreach (var vol in storageItems.EnumerateArray())
            {
                var bsdName = GetJsonString(vol, "bsd_name");
                var volumeName = GetJsonString(vol, "_name");
                long sizeBytes = 0;
                long freeBytes = 0;

                if (vol.TryGetProperty("size_in_bytes", out var sizeEl))
                {
                    try { sizeBytes = sizeEl.GetInt64(); } catch { }
                }
                if (vol.TryGetProperty("free_space_in_bytes", out var freeEl))
                {
                    try { freeBytes = freeEl.GetInt64(); } catch { }
                }

                var fs = GetJsonString(vol, "file_system");
                var mountPoint = GetJsonString(vol, "mount_point");

                // Get physical disk info from the BSD name
                var diskModel = "";
                var busType = "";
                var diskType = "SSD";
                var smartStatus = "";
                var serialNumber = "";

                // Extract base disk device (e.g., disk0 from disk0s1)
                var baseDisk = ExtractBaseDisk(bsdName);
                if (!string.IsNullOrEmpty(baseDisk))
                {
                    var diskInfo = RunCommand("diskutil", $"info /dev/{baseDisk}");
                    foreach (var line in diskInfo.Split('\n'))
                    {
                        var trimmed = line.Trim();
                        if (trimmed.StartsWith("Device / Media Name:"))
                            diskModel = trimmed.Split(':', 2)[1].Trim();
                        else if (trimmed.StartsWith("Protocol:"))
                            busType = trimmed.Split(':', 2)[1].Trim();
                        else if (trimmed.StartsWith("Solid State:"))
                        {
                            var val = trimmed.Split(':', 2)[1].Trim().ToLowerInvariant();
                            diskType = val == "yes" ? "SSD" : "HDD";
                        }
                        else if (trimmed.StartsWith("SMART Status:"))
                            smartStatus = trimmed.Split(':', 2)[1].Trim();
                        else if (trimmed.StartsWith("Disk / Partition UUID:"))
                            serialNumber = trimmed.Split(':', 2)[1].Trim();
                    }
                }

                // Map protocol to BusType
                if (busType.Contains("NVMe", StringComparison.OrdinalIgnoreCase))
                {
                    busType = "NVMe";
                    diskType = "NVMe";
                }
                else if (busType.Contains("SATA", StringComparison.OrdinalIgnoreCase))
                    busType = "SATA";
                else if (busType.Contains("USB", StringComparison.OrdinalIgnoreCase))
                    busType = "USB";

                // Map SMART status
                if (smartStatus.Contains("Verified", StringComparison.OrdinalIgnoreCase))
                    smartStatus = "Healthy";
                else if (smartStatus.Contains("Failing", StringComparison.OrdinalIgnoreCase))
                    smartStatus = "Critical";

                // Check if FileVault is on for this volume
                bool isEncrypted = false;
                if (mountPoint == "/")
                {
                    var fvStatus = RunCommand("fdesetup", "status");
                    isEncrypted = fvStatus.Contains("On", StringComparison.OrdinalIgnoreCase);
                }

                var disk = new DiskInfo
                {
                    DeviceName = bsdName,
                    Model = diskModel,
                    Manufacturer = "Apple",
                    SerialNumber = serialNumber,
                    SizeBytes = sizeBytes,
                    Type = diskType,
                    BusType = busType,
                    MediaType = "Fixed",
                    PartitionStyle = "GPT",
                    SmartStatus = smartStatus,
                    Volumes =
                    [
                        new VolumeInfo
                        {
                            MountPoint = mountPoint,
                            FileSystem = fs,
                            Label = volumeName,
                            SizeBytes = sizeBytes,
                            FreeBytes = freeBytes,
                            IsEncrypted = isEncrypted
                        }
                    ]
                };
                disks.Add(disk);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Disk collection failed: {ex.Message}");
        }
        return disks;
    }

    // ─── GPUs ───────────────────────────────────────────────────────────────

    private static List<GpuInfo> CollectGpus()
    {
        var gpus = new List<GpuInfo>();
        try
        {
            var dispJson = RunCommand("system_profiler", "SPDisplaysDataType -json");
            if (string.IsNullOrWhiteSpace(dispJson)) return gpus;

            using var doc = JsonDocument.Parse(dispJson);
            if (!doc.RootElement.TryGetProperty("SPDisplaysDataType", out var displays)) return gpus;

            foreach (var disp in displays.EnumerateArray())
            {
                var gpu = new GpuInfo
                {
                    Name = GetJsonString(disp, "sppci_model"),
                    Manufacturer = GetJsonString(disp, "spdisplays_vendor")
                };

                if (string.IsNullOrEmpty(gpu.Name))
                    gpu.Name = GetJsonString(disp, "chipset_model");

                // VRAM: e.g. "1536 MB" or "spdisplays_vram" key
                var vramStr = GetJsonString(disp, "spdisplays_vram");
                if (string.IsNullOrEmpty(vramStr))
                    vramStr = GetJsonString(disp, "spdisplays_vram_shared");

                if (!string.IsNullOrEmpty(vramStr))
                    gpu.VramBytes = ParseMemoryString(vramStr);

                // Driver version (Metal version on newer macOS)
                gpu.DriverVersion = GetJsonString(disp, "spdisplays_metal");

                gpus.Add(gpu);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] GPU collection failed: {ex.Message}");
        }
        return gpus;
    }

    // ─── Battery ────────────────────────────────────────────────────────────

    private static BatteryInfo? CollectBattery()
    {
        try
        {
            var powerJson = RunCommand("system_profiler", "SPPowerDataType -json");
            if (string.IsNullOrWhiteSpace(powerJson)) return null;

            using var doc = JsonDocument.Parse(powerJson);
            if (!doc.RootElement.TryGetProperty("SPPowerDataType", out var powerItems)) return null;

            foreach (var item in powerItems.EnumerateArray())
            {
                if (!item.TryGetProperty("sppower_battery_health_info", out var health)) continue;

                var battery = new BatteryInfo
                {
                    Chemistry = "LiPo" // All modern Macs use LiPo
                };

                // Design capacity (mAh reported by macOS, approximate to mWh)
                var designCap = GetJsonString(health, "sppower_battery_health_maximum_capacity");
                // Actually macOS reports MaxCapacity as percentage and cycle count separately
                // sppower_battery_health_info has: sppower_battery_cycle_count, sppower_battery_health_maximum_capacity
                var cycleStr = GetJsonString(health, "sppower_battery_cycle_count");
                if (int.TryParse(cycleStr, out int cycles))
                    battery.CycleCount = cycles;

                var maxCapPct = GetJsonString(health, "sppower_battery_health_maximum_capacity");
                // e.g. "92%"
                if (!string.IsNullOrEmpty(maxCapPct))
                {
                    var pctMatch = Regex.Match(maxCapPct, @"(\d+)");
                    if (pctMatch.Success && double.TryParse(pctMatch.Groups[1].Value, out double pct))
                        battery.HealthPercent = pct;
                }

                // Get charge info from battery_charge_info
                if (item.TryGetProperty("sppower_battery_charge_info", out var chargeInfo))
                {
                    var isChargingStr = GetJsonString(chargeInfo, "sppower_battery_is_charging");
                    var isFullStr = GetJsonString(chargeInfo, "sppower_battery_fully_charged");

                    if (isFullStr.Equals("TRUE", StringComparison.OrdinalIgnoreCase))
                        battery.ChargingState = "FullyCharged";
                    else if (isChargingStr.Equals("TRUE", StringComparison.OrdinalIgnoreCase))
                        battery.ChargingState = "Charging";
                    else
                        battery.ChargingState = "Discharging";
                }

                // Try pmset for current charge level
                var pmset = RunCommand("pmset", "-g batt");
                // Output: "... 85%; charging; ..."
                var chargeMatch = Regex.Match(pmset, @"(\d+)%");
                if (chargeMatch.Success && int.TryParse(chargeMatch.Groups[1].Value, out int chargePct))
                {
                    // Approximate mWh from percentage (use design capacity if available)
                    battery.CurrentChargeMwh = chargePct * 100; // approximate
                    battery.DesignCapacityMwh = 10000; // placeholder, macOS doesn't expose raw mWh easily
                    battery.FullChargeCapacityMwh = (int)(battery.DesignCapacityMwh * battery.HealthPercent / 100.0);
                }

                // Get raw capacity from ioreg if available
                var ioregBatt = RunCommand("ioreg", "-rc AppleSmartBattery");
                if (!string.IsNullOrWhiteSpace(ioregBatt))
                {
                    battery.DesignCapacityMwh = ParseIoregInt(ioregBatt, "DesignCapacity");
                    battery.FullChargeCapacityMwh = ParseIoregInt(ioregBatt, "MaxCapacity");
                    battery.CurrentChargeMwh = ParseIoregInt(ioregBatt, "CurrentCapacity");
                }

                return battery;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Battery collection failed: {ex.Message}");
        }
        return null;
    }

    // ─── Monitors ───────────────────────────────────────────────────────────

    private static List<MonitorInfo> CollectMonitors()
    {
        var monitors = new List<MonitorInfo>();
        try
        {
            var dispJson = RunCommand("system_profiler", "SPDisplaysDataType -json");
            if (string.IsNullOrWhiteSpace(dispJson)) return monitors;

            using var doc = JsonDocument.Parse(dispJson);
            if (!doc.RootElement.TryGetProperty("SPDisplaysDataType", out var displays)) return monitors;

            foreach (var gpu in displays.EnumerateArray())
            {
                if (!gpu.TryGetProperty("spdisplays_ndrvs", out var monitorList)) continue;

                foreach (var mon in monitorList.EnumerateArray())
                {
                    var monitor = new MonitorInfo
                    {
                        Name = GetJsonString(mon, "_name"),
                        Resolution = GetJsonString(mon, "_spdisplays_resolution"),
                        ConnectionType = GetJsonString(mon, "spdisplays_connection_type"),
                        Manufacturer = GetJsonString(mon, "_spdisplays_display-vendor-id")
                    };

                    // If manufacturer looks like vendor id, try to map
                    if (string.IsNullOrEmpty(monitor.Manufacturer) || monitor.Manufacturer.StartsWith("0x"))
                        monitor.Manufacturer = GetJsonString(mon, "spdisplays_display-vendor-name");

                    // Internal display
                    var isInternal = GetJsonString(mon, "spdisplays_builtin");
                    if (isInternal.Equals("spdisplays_yes", StringComparison.OrdinalIgnoreCase) ||
                        isInternal.Equals("Yes", StringComparison.OrdinalIgnoreCase))
                        monitor.ConnectionType = "Internal";

                    monitors.Add(monitor);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Monitor collection failed: {ex.Message}");
        }
        return monitors;
    }

    // ─── Security Hardware (TPM/SecureBoot) ─────────────────────────────────

    private static void CollectSecurityHardware(HardwareInfo hw)
    {
        try
        {
            // macOS uses Secure Enclave, not TPM
            // Check for T2 chip or Apple Silicon (both have Secure Enclave)
            var bridgeJson = RunCommand("system_profiler", "SPiBridgeDataType -json");
            if (!string.IsNullOrWhiteSpace(bridgeJson) && bridgeJson.Contains("iBridge"))
            {
                hw.TpmPresent = true;
                hw.TpmVersion = "T2 (Secure Enclave)";
            }

            // Apple Silicon always has Secure Enclave
            var arch = RunCommand("uname", "-m").Trim();
            if (arch == "arm64")
            {
                hw.TpmPresent = true;
                hw.TpmVersion = "Apple Silicon (Secure Enclave)";
                hw.SecureBootEnabled = true; // Apple Silicon always has secure boot
            }

            // SIP status as SecureBoot indicator for Intel
            var csrutil = RunCommand("csrutil", "status");
            if (csrutil.Contains("enabled", StringComparison.OrdinalIgnoreCase))
                hw.SecureBootEnabled = true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Security hardware collection failed: {ex.Message}");
        }
    }

    // ─── Software ───────────────────────────────────────────────────────────

    private static List<SoftwareEntry> CollectSoftware()
    {
        var list = new List<SoftwareEntry>();
        try
        {
            // system_profiler SPApplicationsDataType
            var json = RunCommand("system_profiler", "SPApplicationsDataType -json");
            if (!string.IsNullOrWhiteSpace(json))
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("SPApplicationsDataType", out var apps))
                {
                    foreach (var app in apps.EnumerateArray())
                    {
                        var entry = new SoftwareEntry
                        {
                            Name = GetJsonString(app, "_name"),
                            Version = GetJsonString(app, "version"),
                            InstallSource = GetJsonString(app, "obtained_from"),
                            InstallLocation = GetJsonString(app, "path"),
                            Description = GetJsonString(app, "info")
                        };

                        // Publisher from signed_by or obtained_from
                        var signedBy = GetJsonString(app, "signed_by");
                        if (!string.IsNullOrEmpty(signedBy))
                        {
                            // signed_by is an array-like string; take the first signer
                            var signers = signedBy.Split(',');
                            entry.Publisher = signers[0].Trim();
                        }

                        // Last modified → LastUpdated
                        var lastModified = GetJsonString(app, "lastModified");
                        if (!string.IsNullOrEmpty(lastModified))
                        {
                            if (DateTime.TryParse(lastModified, CultureInfo.InvariantCulture,
                                DateTimeStyles.AssumeUniversal, out var dt))
                                entry.LastUpdated = dt;
                        }

                        // Architecture from runtime_environment
                        var runtime = GetJsonString(app, "runtime_environment");
                        if (!string.IsNullOrEmpty(runtime))
                            entry.Architecture = runtime; // e.g. "arch_arm64", "arch_x86_64"

                        list.Add(entry);
                    }
                }
            }

            // Homebrew packages
            var brewOutput = RunCommand("brew", "list --versions");
            if (!string.IsNullOrWhiteSpace(brewOutput))
            {
                foreach (var line in brewOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    var parts = line.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 1)
                    {
                        list.Add(new SoftwareEntry
                        {
                            Name = parts[0].Trim(),
                            Version = parts.Length >= 2 ? parts[1].Trim() : "",
                            InstallSource = "brew",
                            Publisher = "Homebrew"
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Software collection failed: {ex.Message}");
        }
        return list;
    }

    // ─── Services ───────────────────────────────────────────────────────────

    private static List<ServiceEntry> CollectServices()
    {
        var list = new List<ServiceEntry>();
        try
        {
            var output = RunCommand("launchctl", "list");
            foreach (var line in output.Split('\n').Skip(1)) // Skip header
            {
                var parts = line.Split('\t', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 3) continue;

                var pidStr = parts[0].Trim();
                var statusStr = parts[1].Trim();
                var label = parts[2].Trim();

                var service = new ServiceEntry
                {
                    Name = label,
                    DisplayName = label,
                    Status = pidStr == "-" ? "Stopped" : "Running",
                    Pid = int.TryParse(pidStr, out int pid) ? pid : 0
                };

                // Determine start type from label convention
                if (label.StartsWith("com.apple."))
                    service.StartType = "Automatic";
                else
                    service.StartType = "Manual";

                // Exit status
                if (int.TryParse(statusStr, out int exitCode) && exitCode != 0)
                    service.Description = $"Exit code: {exitCode}";

                list.Add(service);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Service collection failed: {ex.Message}");
        }
        return list;
    }

    // ─── Processes ──────────────────────────────────────────────────────────

    private static List<ProcessEntry> CollectProcesses()
    {
        var list = new List<ProcessEntry>();
        try
        {
            // Use ps with specific format for reliable parsing
            var output = RunCommand("ps", "-eo pid,pcpu,rss,comm");
            foreach (var line in output.Split('\n').Skip(1))
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;

                var parts = trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 4) continue;

                if (int.TryParse(parts[0], out int pid) &&
                    double.TryParse(parts[1], CultureInfo.InvariantCulture, out double cpu) &&
                    long.TryParse(parts[2], out long rssKb))
                {
                    list.Add(new ProcessEntry
                    {
                        Pid = pid,
                        Name = string.Join(' ', parts.Skip(3)),
                        CpuPercent = cpu,
                        MemoryBytes = rssKb * 1024
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

    // ─── Network ────────────────────────────────────────────────────────────

    private static List<NetworkInterface> CollectNetwork()
    {
        var list = new List<NetworkInterface>();
        try
        {
            var json = RunCommand("system_profiler", "SPNetworkDataType -json");
            if (string.IsNullOrWhiteSpace(json)) return list;

            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("SPNetworkDataType", out var interfaces)) return list;

            foreach (var iface in interfaces.EnumerateArray())
            {
                var name = GetJsonString(iface, "_name");
                var ifaceName = GetJsonString(iface, "interface"); // e.g., en0
                var adapterType = GetJsonString(iface, "type");

                // IP addresses and subnet masks
                var ips = new List<string>();
                var subnets = new List<string>();
                var gateways = new List<string>();
                if (iface.TryGetProperty("IPv4", out var ipv4))
                {
                    if (ipv4.TryGetProperty("Addresses", out var addrs))
                        foreach (var addr in addrs.EnumerateArray())
                            ips.Add(addr.GetString() ?? "");

                    if (ipv4.TryGetProperty("SubnetMasks", out var masks))
                        foreach (var mask in masks.EnumerateArray())
                            subnets.Add(mask.GetString() ?? "");

                    var router = GetJsonString(ipv4, "Router");
                    if (!string.IsNullOrEmpty(router))
                        gateways.Add(router);
                }

                // MAC address
                var mac = "";
                if (iface.TryGetProperty("Ethernet", out var eth))
                    mac = GetJsonString(eth, "MAC Address");

                // DNS
                var dnsServers = new List<string>();
                if (iface.TryGetProperty("DNS", out var dns) &&
                    dns.TryGetProperty("ServerAddresses", out var dnsAddrs))
                {
                    foreach (var d in dnsAddrs.EnumerateArray())
                        dnsServers.Add(d.GetString() ?? "");
                }

                // DHCP detection
                bool dhcpEnabled = false;
                var dhcpServer = "";
                if (!string.IsNullOrEmpty(name))
                {
                    var netInfo = RunCommand("networksetup", $"-getinfo \"{name}\"");
                    if (netInfo.Contains("DHCP", StringComparison.OrdinalIgnoreCase))
                        dhcpEnabled = true;
                    // Extract DHCP server
                    foreach (var line in netInfo.Split('\n'))
                    {
                        if (line.StartsWith("DHCP Server", StringComparison.OrdinalIgnoreCase))
                        {
                            dhcpServer = line.Split(':', 2).Length > 1 ? line.Split(':', 2)[1].Trim() : "";
                        }
                    }
                }

                // Interface speed
                long speedMbps = 0;
                if (!string.IsNullOrEmpty(ifaceName))
                {
                    var ifconfig = RunCommand("ifconfig", ifaceName);
                    var speedMatch = Regex.Match(ifconfig, @"media:.*<.*(\d+)base", RegexOptions.IgnoreCase);
                    if (speedMatch.Success && long.TryParse(speedMatch.Groups[1].Value, out long spd))
                        speedMbps = spd;
                }

                // Wi-Fi SSID
                var ssid = "";
                if (adapterType.Contains("Wi-Fi", StringComparison.OrdinalIgnoreCase) ||
                    adapterType.Contains("AirPort", StringComparison.OrdinalIgnoreCase) ||
                    name.Contains("Wi-Fi", StringComparison.OrdinalIgnoreCase))
                {
                    var airportOutput = RunCommand(
                        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
                        "-I");
                    foreach (var line in airportOutput.Split('\n'))
                    {
                        var trimmed = line.Trim();
                        if (trimmed.StartsWith("SSID:") && !trimmed.StartsWith("BSSID:"))
                        {
                            ssid = trimmed.Split(':', 2)[1].Trim();
                            break;
                        }
                    }
                }

                // Status: check if interface has IPs
                var status = ips.Count > 0 ? "Up" : "Down";

                list.Add(new NetworkInterface
                {
                    Name = name,
                    Description = ifaceName,
                    MacAddress = mac,
                    IpAddresses = ips,
                    SubnetMasks = subnets,
                    DefaultGateways = gateways,
                    DnsServers = dnsServers,
                    SpeedMbps = speedMbps,
                    AdapterType = adapterType,
                    Status = status,
                    DhcpEnabled = dhcpEnabled,
                    DhcpServer = dhcpServer,
                    WirelessSsid = ssid
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Network collection failed: {ex.Message}");
        }
        return list;
    }

    // ─── Local Users ────────────────────────────────────────────────────────

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
                // Skip system accounts (start with _) and special accounts
                if (username.StartsWith('_') || username == "daemon" || username == "nobody" || username == "root")
                    continue;

                var localUser = new LocalUser
                {
                    Username = username,
                    IsAdmin = adminUsers.Contains(username)
                };

                // Try to get last login time
                var lastOutput = RunCommand("last", $"-1 {username}");
                if (!string.IsNullOrWhiteSpace(lastOutput))
                {
                    var firstLine = lastOutput.Split('\n').FirstOrDefault() ?? "";
                    // Parse the date portion from `last` output
                    var dateMatch = Regex.Match(firstLine,
                        @"(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2})");
                    if (dateMatch.Success)
                    {
                        if (DateTime.TryParse(dateMatch.Groups[1].Value, CultureInfo.InvariantCulture,
                            DateTimeStyles.AssumeLocal, out var lastLogon))
                            localUser.LastLogon = lastLogon;
                    }
                }

                list.Add(localUser);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Local users collection failed: {ex.Message}");
        }
        return list;
    }

    // ─── Security Posture ───────────────────────────────────────────────────

    private static SecurityPosture CollectSecurityPosture()
    {
        var security = new SecurityPosture();
        try
        {
            // Antivirus: XProtect is always present on macOS
            if (System.IO.File.Exists("/Library/Apple/System/Library/CoreServices/XProtect.app/Contents/Info.plist") ||
                System.IO.Directory.Exists("/Library/Apple/System/Library/CoreServices/XProtect.app"))
            {
                security.AntivirusProduct = "XProtect";
                security.RealTimeProtectionEnabled = true;

                // Get XProtect version
                var xpVersion = RunCommand("defaults", "read /Library/Apple/System/Library/CoreServices/XProtect.app/Contents/Info.plist CFBundleShortVersionString");
                if (!string.IsNullOrWhiteSpace(xpVersion))
                    security.AntivirusVersion = xpVersion.Trim();
            }

            // Check for third-party AV products
            var thirdPartyAv = new[]
            {
                ("/Library/CS/falconctl", "CrowdStrike Falcon"),
                ("/usr/local/bin/sentinelctl", "SentinelOne"),
                ("/Library/Sophos Anti-Virus", "Sophos"),
                ("/Applications/Malwarebytes.app", "Malwarebytes")
            };
            foreach (var (path, name) in thirdPartyAv)
            {
                if (System.IO.File.Exists(path) || System.IO.Directory.Exists(path))
                {
                    security.AntivirusProduct = name;
                    break;
                }
            }

            // Firewall: ALF (Application Layer Firewall)
            var alfOutput = RunCommand("defaults", "read /Library/Preferences/com.apple.alf globalstate");
            if (int.TryParse(alfOutput.Trim(), out int alfState))
            {
                security.FirewallEnabled = alfState > 0;
                security.FirewallProfile = alfState switch
                {
                    0 => "Off",
                    1 => "On (Allow specific)",
                    2 => "Block all incoming",
                    _ => $"Unknown ({alfState})"
                };
            }

            // FileVault disk encryption
            var fvStatus = RunCommand("fdesetup", "status");
            security.DiskEncryptionEnabled = fvStatus.Contains("On", StringComparison.OrdinalIgnoreCase);
            security.EncryptionProduct = "FileVault";

            // SIP (System Integrity Protection) as SecureBoot indicator
            var csrutil = RunCommand("csrutil", "status");
            security.SecureBootEnabled = csrutil.Contains("enabled", StringComparison.OrdinalIgnoreCase);

            // Secure Enclave as TPM equivalent
            var arch = RunCommand("uname", "-m").Trim();
            security.TpmReady = arch == "arm64"; // Apple Silicon always has Secure Enclave

            // Check for T2 chip on Intel Macs
            if (!security.TpmReady)
            {
                var bridgeJson = RunCommand("system_profiler", "SPiBridgeDataType -json");
                if (!string.IsNullOrWhiteSpace(bridgeJson) && bridgeJson.Contains("iBridge"))
                    security.TpmReady = true;
            }

            // Reboot required (check for pending software updates)
            var pendingUpdates = RunCommand("softwareupdate", "-l");
            security.RebootRequired = pendingUpdates.Contains("[restart]", StringComparison.OrdinalIgnoreCase);
            // Count pending updates
            var updateLines = pendingUpdates.Split('\n')
                .Count(l => l.Trim().StartsWith("*") || l.Trim().StartsWith("Label:"));
            security.PendingUpdateCount = updateLines;

            // Local admin accounts
            var adminOutput = RunCommand("dscacheutil", "-q group -a name admin");
            foreach (var line in adminOutput.Split('\n'))
            {
                if (line.StartsWith("users:"))
                {
                    var users = line[6..].Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    security.LocalAdminAccounts.AddRange(users);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Security posture collection failed: {ex.Message}");
        }
        return security;
    }

    // ─── Directory Status ───────────────────────────────────────────────────

    private static DirectoryStatus CollectDirectoryStatus()
    {
        var dir = new DirectoryStatus();
        try
        {
            // Active Directory binding
            var adOutput = RunCommand("dsconfigad", "-show");
            if (!string.IsNullOrWhiteSpace(adOutput) && !adOutput.Contains("not bound", StringComparison.OrdinalIgnoreCase))
            {
                dir.AdJoined = true;
                foreach (var line in adOutput.Split('\n'))
                {
                    var trimmed = line.Trim();
                    if (trimmed.StartsWith("Active Directory Domain", StringComparison.OrdinalIgnoreCase))
                        dir.AdDomainName = trimmed.Split('=', 2).Length > 1 ? trimmed.Split('=', 2)[1].Trim() : "";
                }
            }

            // MDM enrollment check
            var profilesOutput = RunCommand("profiles", "status -type enrollment");
            if (!string.IsNullOrWhiteSpace(profilesOutput))
            {
                dir.MdmEnrolled = profilesOutput.Contains("MDM enrollment", StringComparison.OrdinalIgnoreCase) &&
                                  profilesOutput.Contains("Yes", StringComparison.OrdinalIgnoreCase);

                // Try to identify MDM provider
                if (dir.MdmEnrolled)
                {
                    var profilesList = RunCommand("profiles", "-P");
                    if (profilesList.Contains("Jamf", StringComparison.OrdinalIgnoreCase))
                        dir.MdmProvider = "Jamf";
                    else if (profilesList.Contains("Intune", StringComparison.OrdinalIgnoreCase) ||
                             profilesList.Contains("Microsoft", StringComparison.OrdinalIgnoreCase))
                        dir.MdmProvider = "Microsoft Intune";
                    else if (profilesList.Contains("Kandji", StringComparison.OrdinalIgnoreCase))
                        dir.MdmProvider = "Kandji";
                    else if (profilesList.Contains("Mosyle", StringComparison.OrdinalIgnoreCase))
                        dir.MdmProvider = "Mosyle";
                    else if (profilesList.Contains("Fleet", StringComparison.OrdinalIgnoreCase))
                        dir.MdmProvider = "Fleet";
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Directory status collection failed: {ex.Message}");
        }
        return dir;
    }

    // ─── Uptime ─────────────────────────────────────────────────────────────

    private static UptimeInfo CollectUptime()
    {
        var uptime = new UptimeInfo();
        try
        {
            // sysctl kern.boottime returns: { sec = 1234567890, usec = 0 } ...
            var bootTimeStr = RunCommand("sysctl", "-n kern.boottime");
            var secMatch = Regex.Match(bootTimeStr, @"sec\s*=\s*(\d+)");
            if (secMatch.Success && long.TryParse(secMatch.Groups[1].Value, out long bootEpoch))
            {
                uptime.LastBootTime = DateTimeOffset.FromUnixTimeSeconds(bootEpoch).UtcDateTime;
                var uptimeSpan = DateTime.UtcNow - uptime.LastBootTime;
                uptime.Uptime = uptimeSpan;
                uptime.UptimeFormatted = $"{(int)uptimeSpan.TotalDays}d {uptimeSpan.Hours}h {uptimeSpan.Minutes}m";
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Uptime collection failed: {ex.Message}");
        }
        return uptime;
    }

    // ─── Performance Snapshot ───────────────────────────────────────────────

    private static PerformanceSnapshot CollectPerformance()
    {
        var perf = new PerformanceSnapshot();
        try
        {
            // CPU usage from top (single sample)
            var topOutput = RunCommand("top", "-l 1 -s 0 -n 0");
            foreach (var line in topOutput.Split('\n'))
            {
                if (line.StartsWith("CPU usage:", StringComparison.OrdinalIgnoreCase))
                {
                    // "CPU usage: 5.55% user, 10.0% sys, 84.44% idle"
                    var idleMatch = Regex.Match(line, @"([\d.]+)%\s*idle");
                    if (idleMatch.Success && double.TryParse(idleMatch.Groups[1].Value,
                        CultureInfo.InvariantCulture, out double idle))
                    {
                        perf.CpuUtilizationPercent = Math.Round(100.0 - idle, 2);
                    }
                    break;
                }
            }

            // Memory from vm_stat
            var pageSizeStr = RunCommand("sysctl", "-n hw.pagesize").Trim();
            var totalMemStr = RunCommand("sysctl", "-n hw.memsize").Trim();
            var vmStat = RunCommand("vm_stat", "");

            if (long.TryParse(pageSizeStr, out long pageSize) && long.TryParse(totalMemStr, out long totalMem))
            {
                long freePages = ParseVmStatLine(vmStat, "Pages free");
                long inactivePages = ParseVmStatLine(vmStat, "Pages inactive");
                long speculativePages = ParseVmStatLine(vmStat, "Pages speculative");

                long availableBytes = (freePages + inactivePages + speculativePages) * pageSize;
                long usedBytes = totalMem - availableBytes;

                perf.MemoryAvailableBytes = availableBytes;
                perf.MemoryUsedBytes = usedBytes;
                perf.MemoryUtilizationPercent = totalMem > 0
                    ? Math.Round((double)usedBytes / totalMem * 100, 2) : 0;
            }

            // Disk usage from df
            var dfOutput = RunCommand("df", "-b");
            foreach (var line in dfOutput.Split('\n').Skip(1))
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 6) continue;

                var mountPoint = parts[^1];
                // Skip pseudo filesystems
                if (!mountPoint.StartsWith("/") || mountPoint.StartsWith("/dev")) continue;

                if (long.TryParse(parts[1], out long totalBlocks) &&
                    long.TryParse(parts[2], out long usedBlocks) &&
                    long.TryParse(parts[3], out long freeBlocks))
                {
                    // df -b reports in 512-byte blocks
                    long blockSize = 512;
                    long totalBytes = totalBlocks * blockSize;
                    long usedDiskBytes = usedBlocks * blockSize;
                    long freeDiskBytes = freeBlocks * blockSize;

                    perf.DiskUsages.Add(new DiskUsage
                    {
                        MountPoint = mountPoint,
                        UsagePercent = totalBytes > 0 ? Math.Round((double)usedDiskBytes / totalBytes * 100, 2) : 0,
                        UsedBytes = usedDiskBytes,
                        FreeBytes = freeDiskBytes
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Performance collection failed: {ex.Message}");
        }
        return perf;
    }

    // ─── Virtualization ─────────────────────────────────────────────────────

    private static VirtualizationInfo CollectVirtualization()
    {
        var virt = new VirtualizationInfo();
        try
        {
            // Check for Rosetta translation (Apple Silicon running x86)
            var translated = RunCommand("sysctl", "-n sysctl.proc_translated").Trim();

            // Check model name for VM indicators
            var hwJson = RunCommand("system_profiler", "SPHardwareDataType -json");
            var modelName = "";
            if (!string.IsNullOrWhiteSpace(hwJson))
            {
                using var doc = JsonDocument.Parse(hwJson);
                if (doc.RootElement.TryGetProperty("SPHardwareDataType", out var items) &&
                    items.GetArrayLength() > 0)
                {
                    modelName = GetJsonString(items[0], "machine_model").ToLowerInvariant();
                }
            }

            // Detect hypervisor
            if (modelName.Contains("vmware"))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "VMware";
            }
            else if (modelName.Contains("virtualbox"))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "VirtualBox";
            }
            else if (modelName.Contains("parallels"))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "Parallels";
            }
            else if (modelName.Contains("qemu") || modelName.Contains("kvm"))
            {
                virt.IsVirtual = true;
                virt.HypervisorType = "KVM";
            }

            // Also check ioreg for hypervisor
            if (!virt.IsVirtual)
            {
                var ioregOutput = RunCommand("ioreg", "-l");
                if (ioregOutput.Contains("hypervisor", StringComparison.OrdinalIgnoreCase))
                {
                    virt.IsVirtual = true;
                    if (ioregOutput.Contains("VMware", StringComparison.OrdinalIgnoreCase))
                        virt.HypervisorType = "VMware";
                    else if (ioregOutput.Contains("Parallels", StringComparison.OrdinalIgnoreCase))
                        virt.HypervisorType = "Parallels";
                    else
                        virt.HypervisorType = "Unknown";
                }
            }

            // Check sysctl for VMX (Intel virtualization support)
            var cpuFeatures = RunCommand("sysctl", "-n machdep.cpu.features").ToUpperInvariant();
            if (cpuFeatures.Contains("VMX"))
            {
                // Has virtualization support, but this indicates HOST capability, not guest
                // Guest detection is above
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[MacOsCollector] Virtualization collection failed: {ex.Message}");
        }
        return virt;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helper Methods
    // ═══════════════════════════════════════════════════════════════════════

    private static string GetJsonString(JsonElement element, string property)
    {
        try
        {
            if (!element.TryGetProperty(property, out var val)) return "";
            return val.ValueKind switch
            {
                JsonValueKind.String => val.GetString() ?? "",
                JsonValueKind.Number => val.ToString(),
                JsonValueKind.True => "TRUE",
                JsonValueKind.False => "FALSE",
                _ => val.ToString()
            };
        }
        catch
        {
            return "";
        }
    }

    private static long ParseMemoryString(string memStr)
    {
        if (string.IsNullOrWhiteSpace(memStr)) return 0;

        var match = Regex.Match(memStr, @"([\d.]+)\s*(TB|GB|MB|KB|B)?", RegexOptions.IgnoreCase);
        if (!match.Success) return 0;

        if (!double.TryParse(match.Groups[1].Value, CultureInfo.InvariantCulture, out double value))
            return 0;

        var unit = (match.Groups[2].Value ?? "").ToUpperInvariant();
        return unit switch
        {
            "TB" => (long)(value * 1024L * 1024 * 1024 * 1024),
            "GB" => (long)(value * 1024L * 1024 * 1024),
            "MB" => (long)(value * 1024L * 1024),
            "KB" => (long)(value * 1024L),
            "B" => (long)value,
            _ => (long)(value * 1024L * 1024 * 1024) // Default assume GB
        };
    }

    private static long ParseVmStatLine(string vmStat, string label)
    {
        foreach (var line in vmStat.Split('\n'))
        {
            if (line.Contains(label, StringComparison.OrdinalIgnoreCase))
            {
                var match = Regex.Match(line, @":\s*(\d+)");
                if (match.Success && long.TryParse(match.Groups[1].Value, out long pages))
                    return pages;
            }
        }
        return 0;
    }

    private static int ParseIoregInt(string ioregOutput, string key)
    {
        var match = Regex.Match(ioregOutput, $"\"{key}\"\\s*=\\s*(\\d+)");
        if (match.Success && int.TryParse(match.Groups[1].Value, out int value))
            return value;
        return 0;
    }

    private static string ExtractBaseDisk(string bsdName)
    {
        if (string.IsNullOrEmpty(bsdName)) return "";
        // e.g., "disk0s1" → "disk0", "disk2s3" → "disk2"
        var match = Regex.Match(bsdName, @"(disk\d+)");
        return match.Success ? match.Groups[1].Value : bsdName;
    }

    private static string RunCommand(string command, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo(command, arguments)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = Process.Start(psi);
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

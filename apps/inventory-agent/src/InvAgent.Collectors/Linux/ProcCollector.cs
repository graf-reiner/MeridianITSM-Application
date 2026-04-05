namespace InvAgent.Collectors.Linux;

using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using InvAgent.Models;

/// <summary>
/// Linux inventory collector using /proc, /sys filesystems and standard Linux utilities.
/// Populates the full InventoryPayload model with Linux-native data sources.
/// </summary>
public class ProcCollector : ICollector
{
    public async Task<InventoryPayload> CollectAsync(CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();

        var payload = new InventoryPayload
        {
            Hostname = Environment.MachineName,
            Platform = "LINUX",
            CollectedAt = DateTime.UtcNow
        };

        await Task.Run(() =>
        {
            // Tier 1: Identity & Inventory
            try { payload.Fqdn = CollectFqdn(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] FQDN collection failed: {ex.Message}"); }

            try { payload.DeviceType = CollectDeviceType(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] DeviceType collection failed: {ex.Message}"); }

            try { payload.DomainWorkgroup = CollectDomainWorkgroup(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] DomainWorkgroup collection failed: {ex.Message}"); }

            try { payload.Os = CollectOsInfo(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] OS info collection failed: {ex.Message}"); }

            try { payload.Hardware = CollectHardwareInfo(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Hardware info collection failed: {ex.Message}"); }

            try { payload.Software = CollectSoftware(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Software collection failed: {ex.Message}"); }

            try { payload.Services = CollectServices(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Service collection failed: {ex.Message}"); }

            try { payload.Processes = CollectProcesses(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Process collection failed: {ex.Message}"); }

            try { payload.Network = CollectNetwork(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Network collection failed: {ex.Message}"); }

            try { payload.LocalUsers = CollectLocalUsers(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Local users collection failed: {ex.Message}"); }

            // Tier 2: Security & Compliance
            try { payload.Security = CollectSecurityPosture(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Security posture collection failed: {ex.Message}"); }

            try { payload.Directory = CollectDirectoryStatus(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Directory status collection failed: {ex.Message}"); }

            // BitLockerVolumes: not applicable on Linux (LUKS covered in SecurityPosture)

            // Tier 3: Operational Health
            try { payload.Uptime = CollectUptime(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Uptime collection failed: {ex.Message}"); }

            try { payload.Performance = CollectPerformance(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Performance collection failed: {ex.Message}"); }

            try { payload.Virtualization = CollectVirtualization(); }
            catch (Exception ex) { Console.Error.WriteLine($"[ProcCollector] Virtualization collection failed: {ex.Message}"); }
        }, ct);

        sw.Stop();
        payload.ScanDurationMs = sw.Elapsed.TotalMilliseconds;
        return payload;
    }

    // ─── Identity ────────────────────────────────────────────────────────────────

    private static string CollectFqdn()
    {
        var fqdn = RunCommand("hostname", "-f").Trim();
        if (!string.IsNullOrWhiteSpace(fqdn) && fqdn.Contains('.'))
            return fqdn;

        // Fallback: DNS lookup
        try
        {
            var entry = System.Net.Dns.GetHostEntry(Environment.MachineName);
            return entry.HostName;
        }
        catch
        {
            return Environment.MachineName;
        }
    }

    private static string CollectDeviceType()
    {
        // Map DMI chassis_type to device type
        // Values from SMBIOS spec: 1=Other, 2=Unknown, 3=Desktop, 4=Low-Profile Desktop,
        // 5=Pizza Box, 6=Mini Tower, 7=Tower, 8=Portable, 9=Laptop, 10=Notebook,
        // 11=Handheld, 12=Docking Station, 13=All-in-One, 14=Sub-Notebook,
        // 15=Space-saving, 16=Lunch Box, 17=Main Server Chassis, 23=Rack Mount,
        // 24=Sealed-case PC, 30=Tablet, 31=Convertible, 32=Detachable, 35=Mini PC,
        // 36=Stick PC
        var chassisStr = ReadSysFile("/sys/class/dmi/id/chassis_type");
        if (int.TryParse(chassisStr, out var chassisType))
        {
            return chassisType switch
            {
                3 or 4 or 5 or 6 or 7 or 15 or 16 or 24 or 35 or 36 => "Desktop",
                8 or 9 or 10 or 14 or 30 or 31 or 32 => "Laptop",
                11 => "ThinClient",
                17 or 23 => "Server",
                _ => "Desktop"
            };
        }

        // Detect VM as fallback
        var virtType = RunCommand("systemd-detect-virt", "").Trim();
        if (!string.IsNullOrWhiteSpace(virtType) && virtType != "none")
            return "VM";

        return "Desktop";
    }

    private static string CollectDomainWorkgroup()
    {
        // Check realm (AD join)
        var realm = RunCommand("realm", "list");
        if (!string.IsNullOrWhiteSpace(realm))
        {
            foreach (var line in realm.Split('\n'))
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith("domain-name:"))
                    return trimmed["domain-name:".Length..].Trim();
            }
        }

        // Check /etc/hostname or /etc/domainname
        var domainname = ReadSysFile("/etc/domainname");
        if (!string.IsNullOrWhiteSpace(domainname))
            return domainname;

        // Fallback: try hostname -d
        var domain = RunCommand("hostname", "-d").Trim();
        if (!string.IsNullOrWhiteSpace(domain) && domain != "(none)")
            return domain;

        return "";
    }

    // ─── OS Info ─────────────────────────────────────────────────────────────────

    private static OsInfo CollectOsInfo()
    {
        var info = new OsInfo();

        // /etc/os-release: NAME, VERSION_ID, VERSION, PRETTY_NAME
        try
        {
            if (File.Exists("/etc/os-release"))
            {
                var osRelease = ParseKeyValueFile("/etc/os-release");
                info.Name = osRelease.GetValueOrDefault("PRETTY_NAME", "")
                            .Trim('"');
                if (string.IsNullOrWhiteSpace(info.Name))
                    info.Name = osRelease.GetValueOrDefault("NAME", "").Trim('"');

                info.Version = osRelease.GetValueOrDefault("VERSION_ID", "").Trim('"');
                info.Edition = osRelease.GetValueOrDefault("VERSION", "").Trim('"');
                info.BuildNumber = osRelease.GetValueOrDefault("BUILD_ID", "").Trim('"');
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] /etc/os-release parse failed: {ex.Message}");
        }

        // uname -r -> KernelVersion
        try
        {
            info.KernelVersion = RunCommand("uname", "-r").Trim();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] uname -r failed: {ex.Message}");
        }

        // uname -m -> Architecture
        try
        {
            info.Architecture = RunCommand("uname", "-m").Trim();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] uname -m failed: {ex.Message}");
        }

        // InstallDate: stat -c %W / (birth time of root filesystem)
        try
        {
            var birthTime = RunCommand("stat", "-c %W /").Trim();
            if (!string.IsNullOrWhiteSpace(birthTime) && birthTime != "0" && long.TryParse(birthTime, out var epoch) && epoch > 0)
            {
                info.InstallDate = DateTimeOffset.FromUnixTimeSeconds(epoch).UtcDateTime
                    .ToString("o", CultureInfo.InvariantCulture);
            }
            else
            {
                // Fallback: check /var/log/installer directory timestamp
                if (Directory.Exists("/var/log/installer"))
                {
                    var dirInfo = new DirectoryInfo("/var/log/installer");
                    info.InstallDate = dirInfo.CreationTimeUtc.ToString("o", CultureInfo.InvariantCulture);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] InstallDate detection failed: {ex.Message}");
        }

        // LastBootTime from /proc/uptime
        try
        {
            var uptimeStr = ReadSysFile("/proc/uptime");
            if (!string.IsNullOrWhiteSpace(uptimeStr))
            {
                var parts = uptimeStr.Split(' ');
                if (parts.Length >= 1 && double.TryParse(parts[0], NumberStyles.Float,
                        CultureInfo.InvariantCulture, out var uptimeSec))
                {
                    var bootTime = DateTime.UtcNow.AddSeconds(-uptimeSec);
                    info.LastBootTime = bootTime.ToString("o", CultureInfo.InvariantCulture);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] LastBootTime failed: {ex.Message}");
        }

        // TimeZone
        try
        {
            // Try timedatectl first
            var tdOutput = RunCommand("timedatectl", "show --property=Timezone --value");
            if (!string.IsNullOrWhiteSpace(tdOutput))
            {
                info.TimeZone = tdOutput.Trim();
            }
            else if (File.Exists("/etc/timezone"))
            {
                info.TimeZone = File.ReadAllText("/etc/timezone").Trim();
            }
            else
            {
                // Fallback: readlink /etc/localtime
                var link = RunCommand("readlink", "-f /etc/localtime").Trim();
                if (link.Contains("zoneinfo/"))
                    info.TimeZone = link[(link.IndexOf("zoneinfo/") + 9)..];
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] TimeZone detection failed: {ex.Message}");
        }

        // Locale
        try
        {
            var localeOutput = RunCommand("locale", "");
            foreach (var line in localeOutput.Split('\n'))
            {
                if (line.StartsWith("LANG="))
                {
                    info.Locale = line[5..].Trim('"');
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Locale detection failed: {ex.Message}");
        }

        // SystemDirectory (Linux equivalent)
        info.SystemDirectory = "/usr";

        return info;
    }

    // ─── Hardware Info ───────────────────────────────────────────────────────────

    private static HardwareInfo CollectHardwareInfo()
    {
        var hw = new HardwareInfo();

        // DMI / sysfs system info
        try
        {
            hw.Manufacturer = ReadSysFile("/sys/class/dmi/id/sys_vendor");
            hw.Model = ReadSysFile("/sys/class/dmi/id/product_name");
            hw.SerialNumber = ReadSysFile("/sys/class/dmi/id/product_serial");
            hw.UUID = ReadSysFile("/sys/class/dmi/id/product_uuid");
            hw.BoardManufacturer = ReadSysFile("/sys/class/dmi/id/board_vendor");
            hw.BoardModel = ReadSysFile("/sys/class/dmi/id/board_name");
            hw.BoardSerialNumber = ReadSysFile("/sys/class/dmi/id/board_serial");
            hw.BiosVendor = ReadSysFile("/sys/class/dmi/id/bios_vendor");
            hw.BiosVersion = ReadSysFile("/sys/class/dmi/id/bios_version");
            hw.BiosDate = ReadSysFile("/sys/class/dmi/id/bios_date");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] DMI sysfs read failed: {ex.Message}");
        }

        // SystemType: Physical vs Virtual
        try
        {
            var virtType = RunCommand("systemd-detect-virt", "").Trim();
            hw.SystemType = (!string.IsNullOrWhiteSpace(virtType) && virtType != "none")
                ? "Virtual"
                : "Physical";
        }
        catch
        {
            hw.SystemType = "Physical";
        }

        // TPM
        try
        {
            if (Directory.Exists("/sys/class/tpm/tpm0"))
            {
                hw.TpmPresent = true;
                var tpmVer = ReadSysFile("/sys/class/tpm/tpm0/tpm_version_major");
                if (!string.IsNullOrWhiteSpace(tpmVer))
                    hw.TpmVersion = $"{tpmVer}.0";
                else
                {
                    // Fallback: parse device caps
                    var caps = ReadSysFile("/sys/class/tpm/tpm0/device/caps");
                    if (caps.Contains("2.0")) hw.TpmVersion = "2.0";
                    else if (caps.Contains("1.2")) hw.TpmVersion = "1.2";
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] TPM detection failed: {ex.Message}");
        }

        // SecureBoot
        try
        {
            // Check EFI variable
            if (Directory.Exists("/sys/firmware/efi/efivars"))
            {
                var sbFiles = Directory.GetFiles("/sys/firmware/efi/efivars", "SecureBoot-*");
                if (sbFiles.Length > 0)
                {
                    var sbData = File.ReadAllBytes(sbFiles[0]);
                    // Last byte: 1 = enabled, 0 = disabled
                    hw.SecureBootEnabled = sbData.Length > 0 && sbData[^1] == 1;
                }
            }

            if (!hw.SecureBootEnabled)
            {
                // Fallback: mokutil
                var mokOutput = RunCommand("mokutil", "--sb-state");
                hw.SecureBootEnabled = mokOutput.Contains("SecureBoot enabled", StringComparison.OrdinalIgnoreCase);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] SecureBoot detection failed: {ex.Message}");
        }

        // CPUs from /proc/cpuinfo
        try
        {
            hw.Cpus = CollectCpuInfo();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] CPU info collection failed: {ex.Message}");
        }

        // Memory total/available from /proc/meminfo
        try
        {
            if (File.Exists("/proc/meminfo"))
            {
                foreach (var line in File.ReadAllLines("/proc/meminfo"))
                {
                    if (line.StartsWith("MemTotal:"))
                    {
                        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2 && long.TryParse(parts[1], out long kb))
                            hw.TotalMemoryBytes = kb * 1024;
                    }
                    else if (line.StartsWith("MemAvailable:"))
                    {
                        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2 && long.TryParse(parts[1], out long kb))
                            hw.AvailableMemoryBytes = kb * 1024;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] /proc/meminfo read failed: {ex.Message}");
        }

        // Memory modules from dmidecode
        try
        {
            hw.MemoryModules = CollectMemoryModules();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Memory module collection failed: {ex.Message}");
        }

        // Disks
        try
        {
            hw.Disks = CollectDisks();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Disk collection failed: {ex.Message}");
        }

        // GPUs
        try
        {
            hw.Gpus = CollectGpus();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] GPU collection failed: {ex.Message}");
        }

        // Battery
        try
        {
            hw.Battery = CollectBattery();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Battery collection failed: {ex.Message}");
        }

        // Monitors
        try
        {
            hw.Monitors = CollectMonitors();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Monitor collection failed: {ex.Message}");
        }

        return hw;
    }

    private static List<CpuInfo> CollectCpuInfo()
    {
        var cpus = new List<CpuInfo>();
        if (!File.Exists("/proc/cpuinfo"))
            return cpus;

        var cpuInfoText = File.ReadAllText("/proc/cpuinfo");
        var blocks = cpuInfoText.Split("\n\n", StringSplitOptions.RemoveEmptyEntries);

        // Group by physical id (socket)
        var sockets = new Dictionary<string, CpuInfo>();
        var socketThreadCounts = new Dictionary<string, int>();

        foreach (var block in blocks)
        {
            var fields = new Dictionary<string, string>();
            foreach (var line in block.Split('\n'))
            {
                var colonIdx = line.IndexOf(':');
                if (colonIdx >= 0)
                {
                    var key = line[..colonIdx].Trim();
                    var val = line[(colonIdx + 1)..].Trim();
                    fields[key] = val;
                }
            }

            if (!fields.ContainsKey("processor"))
                continue;

            var physId = fields.GetValueOrDefault("physical id", "0");

            // Count logical processors per socket
            socketThreadCounts.TryGetValue(physId, out var count);
            socketThreadCounts[physId] = count + 1;

            if (sockets.ContainsKey(physId))
                continue;

            var cpu = new CpuInfo
            {
                Name = fields.GetValueOrDefault("model name", ""),
                Manufacturer = fields.GetValueOrDefault("vendor_id", ""),
                Socket = $"Socket {physId}",
                Architecture = RunCommand("uname", "-m").Trim()
            };

            if (fields.TryGetValue("cpu cores", out var coresStr) &&
                int.TryParse(coresStr, out var cores))
                cpu.Cores = cores;

            if (fields.TryGetValue("siblings", out var siblingsStr) &&
                int.TryParse(siblingsStr, out var siblings))
                cpu.Threads = siblings;

            if (fields.TryGetValue("cpu MHz", out var mhzStr) &&
                double.TryParse(mhzStr, NumberStyles.Float, CultureInfo.InvariantCulture, out var mhz))
                cpu.SpeedMhz = mhz;

            // Cache size parsing (usually reported as L2 or L3)
            if (fields.TryGetValue("cache size", out var cacheStr))
            {
                var match = Regex.Match(cacheStr, @"(\d+)\s*(KB|MB)", RegexOptions.IgnoreCase);
                if (match.Success && int.TryParse(match.Groups[1].Value, out var cacheVal))
                {
                    var cacheKb = match.Groups[2].Value.Equals("MB", StringComparison.OrdinalIgnoreCase)
                        ? cacheVal * 1024
                        : cacheVal;
                    // "cache size" in /proc/cpuinfo is typically the last-level cache (L3 on modern CPUs)
                    cpu.L3CacheKb = cacheKb;
                }
            }

            sockets[physId] = cpu;
        }

        // Set thread counts from our counting
        foreach (var kvp in sockets)
        {
            if (socketThreadCounts.TryGetValue(kvp.Key, out var threads) && kvp.Value.Threads == 0)
                kvp.Value.Threads = threads;
        }

        // Max speed from cpufreq
        try
        {
            var maxFreqStr = ReadSysFile("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq");
            if (!string.IsNullOrWhiteSpace(maxFreqStr) && long.TryParse(maxFreqStr, out var maxFreqKhz))
            {
                var maxMhz = maxFreqKhz / 1000.0;
                foreach (var cpu in sockets.Values)
                    cpu.MaxSpeedMhz = maxMhz;
            }
        }
        catch { /* cpufreq not available on all systems */ }

        // L2 cache from sysfs (per-core, but report per socket)
        try
        {
            var l2Path = "/sys/devices/system/cpu/cpu0/cache/index2/size";
            var l2Str = ReadSysFile(l2Path);
            if (!string.IsNullOrWhiteSpace(l2Str))
            {
                var match = Regex.Match(l2Str, @"(\d+)([KM])?", RegexOptions.IgnoreCase);
                if (match.Success && int.TryParse(match.Groups[1].Value, out var l2Val))
                {
                    var l2Kb = match.Groups[2].Value.Equals("M", StringComparison.OrdinalIgnoreCase)
                        ? l2Val * 1024
                        : l2Val;
                    foreach (var cpu in sockets.Values)
                        cpu.L2CacheKb = l2Kb;
                }
            }
        }
        catch { /* L2 cache sysfs not available */ }

        cpus.AddRange(sockets.Values);
        return cpus;
    }

    private static List<MemoryModule> CollectMemoryModules()
    {
        var modules = new List<MemoryModule>();

        // Try dmidecode (requires root/sudo)
        var output = RunCommand("dmidecode", "-t memory");
        if (string.IsNullOrWhiteSpace(output) || output.Contains("Permission denied") ||
            output.Contains("No SMBIOS"))
            return modules;

        // Split into device sections
        var sections = output.Split("Memory Device\n", StringSplitOptions.RemoveEmptyEntries);
        foreach (var section in sections.Skip(1)) // Skip header
        {
            var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var line in section.Split('\n'))
            {
                var trimmed = line.Trim();
                var colonIdx = trimmed.IndexOf(':');
                if (colonIdx > 0)
                {
                    var key = trimmed[..colonIdx].Trim();
                    var val = trimmed[(colonIdx + 1)..].Trim();
                    fields[key] = val;
                }
            }

            // Skip empty slots
            var sizeStr = fields.GetValueOrDefault("Size", "");
            if (string.IsNullOrWhiteSpace(sizeStr) || sizeStr.Contains("No Module Installed",
                    StringComparison.OrdinalIgnoreCase) || sizeStr == "0")
                continue;

            var module = new MemoryModule
            {
                DeviceLocator = fields.GetValueOrDefault("Locator", ""),
                BankLabel = fields.GetValueOrDefault("Bank Locator", ""),
                Manufacturer = fields.GetValueOrDefault("Manufacturer", ""),
                PartNumber = fields.GetValueOrDefault("Part Number", "").Trim(),
                SerialNumber = fields.GetValueOrDefault("Serial Number", ""),
                MemoryType = fields.GetValueOrDefault("Type", ""),
                FormFactor = fields.GetValueOrDefault("Form Factor", "")
            };

            // Parse capacity
            var sizeMatch = Regex.Match(sizeStr, @"(\d+)\s*(MB|GB|TB)", RegexOptions.IgnoreCase);
            if (sizeMatch.Success && long.TryParse(sizeMatch.Groups[1].Value, out var sizeVal))
            {
                module.CapacityBytes = sizeMatch.Groups[2].Value.ToUpperInvariant() switch
                {
                    "TB" => sizeVal * 1024L * 1024 * 1024 * 1024,
                    "GB" => sizeVal * 1024L * 1024 * 1024,
                    "MB" => sizeVal * 1024L * 1024,
                    _ => sizeVal
                };
            }

            // Speed
            if (fields.TryGetValue("Speed", out var speedStr))
            {
                var speedMatch = Regex.Match(speedStr, @"(\d+)");
                if (speedMatch.Success && int.TryParse(speedMatch.Groups[1].Value, out var speed))
                    module.SpeedMhz = speed;
            }

            if (fields.TryGetValue("Configured Memory Speed", out var confSpeedStr) ||
                fields.TryGetValue("Configured Clock Speed", out confSpeedStr))
            {
                var confMatch = Regex.Match(confSpeedStr, @"(\d+)");
                if (confMatch.Success && int.TryParse(confMatch.Groups[1].Value, out var confSpeed))
                    module.ConfiguredSpeedMhz = confSpeed;
            }

            // Data width
            if (fields.TryGetValue("Data Width", out var dwStr))
            {
                var dwMatch = Regex.Match(dwStr, @"(\d+)");
                if (dwMatch.Success && int.TryParse(dwMatch.Groups[1].Value, out var dw))
                    module.DataWidth = dw;
            }

            modules.Add(module);
        }

        return modules;
    }

    private static List<DiskInfo> CollectDisks()
    {
        var disks = new List<DiskInfo>();

        // Use lsblk JSON output for structured disk data
        var lsblkJson = RunCommand("lsblk",
            "-bJo NAME,SIZE,TYPE,MODEL,SERIAL,FSTYPE,MOUNTPOINT,RO,TRAN,ROTA,DISC-MAX");

        if (string.IsNullOrWhiteSpace(lsblkJson))
        {
            // Fallback to /proc/partitions
            return CollectDisksFallback();
        }

        try
        {
            using var doc = JsonDocument.Parse(lsblkJson);
            var devices = doc.RootElement.GetProperty("blockdevices");

            // Collect df data for free space
            var dfData = ParseDfOutput();

            foreach (var dev in devices.EnumerateArray())
            {
                var type = dev.GetProperty("type").GetString() ?? "";
                if (type != "disk")
                    continue;

                var name = dev.GetProperty("name").GetString() ?? "";
                var disk = new DiskInfo
                {
                    DeviceName = $"/dev/{name}",
                    Model = GetJsonString(dev, "model"),
                    SerialNumber = GetJsonString(dev, "serial"),
                    SizeBytes = dev.TryGetProperty("size", out var sizeEl)
                        ? (sizeEl.ValueKind == JsonValueKind.Number ? sizeEl.GetInt64() : 0)
                        : 0
                };

                // ROTA: 0=SSD, 1=HDD
                var rota = GetJsonString(dev, "rota");
                var tran = GetJsonString(dev, "tran");

                if (tran.Equals("nvme", StringComparison.OrdinalIgnoreCase))
                    disk.Type = "NVMe";
                else if (rota == "0" || rota == "false")
                    disk.Type = "SSD";
                else
                    disk.Type = "HDD";

                // Bus type from transport
                disk.BusType = tran.ToUpperInvariant() switch
                {
                    "SATA" => "SATA",
                    "NVME" => "NVMe",
                    "USB" => "USB",
                    "SAS" => "SAS",
                    "SCSI" => "SCSI",
                    "ISCSI" => "iSCSI",
                    "FC" => "FibreChannel",
                    _ => tran
                };

                // MediaType
                disk.MediaType = tran.Equals("usb", StringComparison.OrdinalIgnoreCase)
                    ? "Removable"
                    : "Fixed";

                // Partition style: check for GPT vs MBR
                var ptypeOutput = RunCommand("blkid", $"-p -s PTTYPE -o value /dev/{name}");
                disk.PartitionStyle = ptypeOutput.Trim().ToUpperInvariant() switch
                {
                    "GPT" => "GPT",
                    "DOS" => "MBR",
                    _ => ptypeOutput.Trim()
                };

                // SMART status
                try
                {
                    var smartOutput = RunCommand("smartctl", $"-H /dev/{name}");
                    if (smartOutput.Contains("PASSED", StringComparison.OrdinalIgnoreCase) ||
                        smartOutput.Contains("OK", StringComparison.OrdinalIgnoreCase))
                        disk.SmartStatus = "Healthy";
                    else if (smartOutput.Contains("FAILED", StringComparison.OrdinalIgnoreCase))
                        disk.SmartStatus = "Critical";
                    else if (!string.IsNullOrWhiteSpace(smartOutput))
                        disk.SmartStatus = "Warning";
                }
                catch { /* smartctl not available */ }

                // Firmware version from smartctl
                try
                {
                    var smartInfo = RunCommand("smartctl", $"-i /dev/{name}");
                    foreach (var line in smartInfo.Split('\n'))
                    {
                        if (line.StartsWith("Firmware Version:", StringComparison.OrdinalIgnoreCase))
                        {
                            disk.FirmwareVersion = line.Split(':')[1].Trim();
                            break;
                        }
                    }
                }
                catch { /* smartctl not available */ }

                // Volumes (children partitions)
                if (dev.TryGetProperty("children", out var children))
                {
                    foreach (var child in children.EnumerateArray())
                    {
                        var childType = GetJsonString(child, "type");
                        if (childType != "part" && childType != "lvm" && childType != "crypt")
                            continue;

                        var mountPoint = GetJsonString(child, "mountpoint");
                        var childName = GetJsonString(child, "name");
                        var fstype = GetJsonString(child, "fstype");

                        var vol = new VolumeInfo
                        {
                            MountPoint = mountPoint,
                            FileSystem = fstype,
                            Label = childName,
                            SizeBytes = child.TryGetProperty("size", out var cSizeEl) &&
                                        cSizeEl.ValueKind == JsonValueKind.Number
                                ? cSizeEl.GetInt64()
                                : 0,
                            IsEncrypted = fstype.Equals("crypto_LUKS", StringComparison.OrdinalIgnoreCase) ||
                                          childType == "crypt"
                        };

                        // Free space from df
                        if (!string.IsNullOrWhiteSpace(mountPoint) && dfData.TryGetValue(mountPoint, out var dfEntry))
                        {
                            vol.FreeBytes = dfEntry.Available;
                            if (dfEntry.Size > 0)
                                vol.SizeBytes = dfEntry.Size;
                        }

                        // Check nested children (e.g., LVM under LUKS)
                        if (child.TryGetProperty("children", out var nested))
                        {
                            foreach (var nestedChild in nested.EnumerateArray())
                            {
                                var nestedMount = GetJsonString(nestedChild, "mountpoint");
                                var nestedFs = GetJsonString(nestedChild, "fstype");
                                var nestedName = GetJsonString(nestedChild, "name");

                                var nestedVol = new VolumeInfo
                                {
                                    MountPoint = nestedMount,
                                    FileSystem = nestedFs,
                                    Label = nestedName,
                                    SizeBytes = nestedChild.TryGetProperty("size", out var nSizeEl) &&
                                                nSizeEl.ValueKind == JsonValueKind.Number
                                        ? nSizeEl.GetInt64()
                                        : 0,
                                    IsEncrypted = true // Under encrypted parent
                                };

                                if (!string.IsNullOrWhiteSpace(nestedMount) &&
                                    dfData.TryGetValue(nestedMount, out var nDfEntry))
                                {
                                    nestedVol.FreeBytes = nDfEntry.Available;
                                    if (nDfEntry.Size > 0)
                                        nestedVol.SizeBytes = nDfEntry.Size;
                                }

                                disk.Volumes.Add(nestedVol);
                            }
                        }

                        disk.Volumes.Add(vol);
                    }
                }

                disks.Add(disk);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] lsblk JSON parse failed: {ex.Message}");
            return CollectDisksFallback();
        }

        return disks;
    }

    private static List<DiskInfo> CollectDisksFallback()
    {
        var disks = new List<DiskInfo>();
        if (!File.Exists("/proc/partitions"))
            return disks;

        foreach (var line in File.ReadAllLines("/proc/partitions").Skip(2))
        {
            var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 4)
            {
                var devName = parts[3];
                if (!string.IsNullOrEmpty(devName) && !char.IsDigit(devName[^1]))
                {
                    if (long.TryParse(parts[2], out long blocks))
                    {
                        disks.Add(new DiskInfo
                        {
                            DeviceName = $"/dev/{devName}",
                            SizeBytes = blocks * 1024
                        });
                    }
                }
            }
        }

        return disks;
    }

    private static List<GpuInfo> CollectGpus()
    {
        var gpus = new List<GpuInfo>();

        var lspciOutput = RunCommand("lspci", "-nn");
        if (string.IsNullOrWhiteSpace(lspciOutput))
            return gpus;

        foreach (var line in lspciOutput.Split('\n'))
        {
            if (!line.Contains("VGA", StringComparison.OrdinalIgnoreCase) &&
                !line.Contains("3D controller", StringComparison.OrdinalIgnoreCase) &&
                !line.Contains("Display controller", StringComparison.OrdinalIgnoreCase))
                continue;

            var slotId = line.Split(' ')[0];
            var gpu = new GpuInfo();

            // Extract name from lspci line (after the class description)
            var colonIdx = line.IndexOf(": ");
            if (colonIdx >= 0)
                gpu.Name = line[(colonIdx + 2)..].Trim();

            // Get details from verbose output
            var details = RunCommand("lspci", $"-v -s {slotId}");
            foreach (var detailLine in details.Split('\n'))
            {
                var trimmed = detailLine.Trim();
                if (trimmed.StartsWith("Memory at", StringComparison.OrdinalIgnoreCase) &&
                    trimmed.Contains("prefetchable"))
                {
                    // Try to parse VRAM size from memory region
                    var sizeMatch = Regex.Match(trimmed, @"\[size=(\d+)([KMG])\]", RegexOptions.IgnoreCase);
                    if (sizeMatch.Success && long.TryParse(sizeMatch.Groups[1].Value, out var vramVal))
                    {
                        gpu.VramBytes = sizeMatch.Groups[2].Value.ToUpperInvariant() switch
                        {
                            "G" => vramVal * 1024L * 1024 * 1024,
                            "M" => vramVal * 1024L * 1024,
                            "K" => vramVal * 1024L,
                            _ => vramVal
                        };
                    }
                }
                else if (trimmed.StartsWith("Kernel driver in use:", StringComparison.OrdinalIgnoreCase))
                {
                    gpu.DriverVersion = trimmed.Split(':')[1].Trim();
                }
            }

            // Determine manufacturer from name
            if (gpu.Name.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase))
                gpu.Manufacturer = "NVIDIA";
            else if (gpu.Name.Contains("AMD", StringComparison.OrdinalIgnoreCase) ||
                     gpu.Name.Contains("ATI", StringComparison.OrdinalIgnoreCase) ||
                     gpu.Name.Contains("Radeon", StringComparison.OrdinalIgnoreCase))
                gpu.Manufacturer = "AMD";
            else if (gpu.Name.Contains("Intel", StringComparison.OrdinalIgnoreCase))
                gpu.Manufacturer = "Intel";

            gpus.Add(gpu);
        }

        return gpus;
    }

    private static BatteryInfo? CollectBattery()
    {
        // Look for battery in /sys/class/power_supply/BAT*
        var psDir = "/sys/class/power_supply";
        if (!Directory.Exists(psDir))
            return null;

        foreach (var dir in Directory.GetDirectories(psDir, "BAT*"))
        {
            var typePath = Path.Combine(dir, "type");
            var type = ReadSysFile(typePath);
            if (!type.Equals("Battery", StringComparison.OrdinalIgnoreCase))
                continue;

            var battery = new BatteryInfo();

            // Design capacity (energy_full_design in microWh)
            var designStr = ReadSysFile(Path.Combine(dir, "energy_full_design"));
            if (!string.IsNullOrWhiteSpace(designStr) && int.TryParse(designStr, out var designUwh))
                battery.DesignCapacityMwh = designUwh / 1000;
            else
            {
                // Some systems use charge_full_design (in microAh) instead
                var chargeDesignStr = ReadSysFile(Path.Combine(dir, "charge_full_design"));
                if (!string.IsNullOrWhiteSpace(chargeDesignStr) && int.TryParse(chargeDesignStr, out var chargeDesign))
                {
                    var voltageStr = ReadSysFile(Path.Combine(dir, "voltage_min_design"));
                    if (int.TryParse(voltageStr, out var voltage) && voltage > 0)
                        battery.DesignCapacityMwh = (int)((long)chargeDesign * voltage / 1_000_000_000);
                }
            }

            // Full charge capacity
            var fullStr = ReadSysFile(Path.Combine(dir, "energy_full"));
            if (!string.IsNullOrWhiteSpace(fullStr) && int.TryParse(fullStr, out var fullUwh))
                battery.FullChargeCapacityMwh = fullUwh / 1000;
            else
            {
                var chargeFullStr = ReadSysFile(Path.Combine(dir, "charge_full"));
                if (!string.IsNullOrWhiteSpace(chargeFullStr) && int.TryParse(chargeFullStr, out var chargeFull))
                {
                    var voltageStr = ReadSysFile(Path.Combine(dir, "voltage_min_design"));
                    if (int.TryParse(voltageStr, out var voltage) && voltage > 0)
                        battery.FullChargeCapacityMwh = (int)((long)chargeFull * voltage / 1_000_000_000);
                }
            }

            // Current charge
            var nowStr = ReadSysFile(Path.Combine(dir, "energy_now"));
            if (!string.IsNullOrWhiteSpace(nowStr) && int.TryParse(nowStr, out var nowUwh))
                battery.CurrentChargeMwh = nowUwh / 1000;
            else
            {
                var chargeNowStr = ReadSysFile(Path.Combine(dir, "charge_now"));
                if (!string.IsNullOrWhiteSpace(chargeNowStr) && int.TryParse(chargeNowStr, out var chargeNow))
                {
                    var voltageStr = ReadSysFile(Path.Combine(dir, "voltage_min_design"));
                    if (int.TryParse(voltageStr, out var voltage) && voltage > 0)
                        battery.CurrentChargeMwh = (int)((long)chargeNow * voltage / 1_000_000_000);
                }
            }

            // Cycle count
            var cycleStr = ReadSysFile(Path.Combine(dir, "cycle_count"));
            if (!string.IsNullOrWhiteSpace(cycleStr) && int.TryParse(cycleStr, out var cycles))
                battery.CycleCount = cycles;

            // Status
            var status = ReadSysFile(Path.Combine(dir, "status"));
            battery.ChargingState = status switch
            {
                "Charging" => "Charging",
                "Discharging" => "Discharging",
                "Full" => "FullyCharged",
                "Not charging" => "FullyCharged",
                _ => status
            };

            // Chemistry / technology
            battery.Chemistry = ReadSysFile(Path.Combine(dir, "technology"));

            // Health percent
            if (battery.DesignCapacityMwh > 0)
                battery.HealthPercent = (double)battery.FullChargeCapacityMwh / battery.DesignCapacityMwh * 100;

            return battery;
        }

        return null;
    }

    private static List<MonitorInfo> CollectMonitors()
    {
        var monitors = new List<MonitorInfo>();

        // Try parsing EDID from DRM subsystem
        try
        {
            var drmDir = "/sys/class/drm";
            if (Directory.Exists(drmDir))
            {
                foreach (var connDir in Directory.GetDirectories(drmDir))
                {
                    var edidPath = Path.Combine(connDir, "edid");
                    if (!File.Exists(edidPath))
                        continue;

                    var edidBytes = File.ReadAllBytes(edidPath);
                    if (edidBytes.Length < 128 || edidBytes.All(b => b == 0))
                        continue;

                    var monitor = ParseEdid(edidBytes);
                    if (monitor != null)
                    {
                        // Connection type from connector name
                        var connName = Path.GetFileName(connDir);
                        if (connName.Contains("HDMI", StringComparison.OrdinalIgnoreCase))
                            monitor.ConnectionType = "HDMI";
                        else if (connName.Contains("DP", StringComparison.OrdinalIgnoreCase))
                            monitor.ConnectionType = "DP";
                        else if (connName.Contains("eDP", StringComparison.OrdinalIgnoreCase))
                            monitor.ConnectionType = "Internal";
                        else if (connName.Contains("VGA", StringComparison.OrdinalIgnoreCase))
                            monitor.ConnectionType = "VGA";
                        else if (connName.Contains("DVI", StringComparison.OrdinalIgnoreCase))
                            monitor.ConnectionType = "DVI";

                        monitors.Add(monitor);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] EDID parsing failed: {ex.Message}");
        }

        // Fallback: xrandr
        if (monitors.Count == 0)
        {
            try
            {
                var xrandrOutput = RunCommand("xrandr", "--query");
                foreach (var line in xrandrOutput.Split('\n'))
                {
                    if (!line.Contains(" connected"))
                        continue;

                    var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    var monitor = new MonitorInfo { Name = parts[0] };

                    // Parse resolution from the "connected" line or subsequent preferred mode
                    var resMatch = Regex.Match(line, @"(\d+)x(\d+)");
                    if (resMatch.Success)
                        monitor.Resolution = $"{resMatch.Groups[1].Value}x{resMatch.Groups[2].Value}";

                    monitors.Add(monitor);
                }
            }
            catch { /* xrandr not available (headless/no X) */ }
        }

        return monitors;
    }

    private static MonitorInfo? ParseEdid(byte[] edid)
    {
        if (edid.Length < 128) return null;

        var monitor = new MonitorInfo();

        // Manufacturer ID (bytes 8-9, compressed ASCII)
        int mfgCode = (edid[8] << 8) | edid[9];
        char c1 = (char)(((mfgCode >> 10) & 0x1F) + 'A' - 1);
        char c2 = (char)(((mfgCode >> 5) & 0x1F) + 'A' - 1);
        char c3 = (char)((mfgCode & 0x1F) + 'A' - 1);
        monitor.Manufacturer = $"{c1}{c2}{c3}";

        // Preferred resolution from detailed timing block (bytes 54-71)
        int hRes = edid[56] | ((edid[58] & 0xF0) << 4);
        int vRes = edid[59] | ((edid[61] & 0xF0) << 4);
        if (hRes > 0 && vRes > 0)
            monitor.Resolution = $"{hRes}x{vRes}";

        // Screen size (bytes 21-22 in cm, approximate diagonal)
        int hSize = edid[21];
        int vSize = edid[22];
        if (hSize > 0 && vSize > 0)
        {
            var diagCm = Math.Sqrt(hSize * hSize + vSize * vSize);
            monitor.SizeInches = (int)Math.Round(diagCm / 2.54);
        }

        // Descriptor blocks (bytes 54-125): look for monitor name (tag 0xFC) and serial (tag 0xFF)
        for (int i = 54; i <= 108; i += 18)
        {
            if (i + 17 >= edid.Length) break;

            // Check for descriptor (not detailed timing: first 2 bytes are 0)
            if (edid[i] != 0 || edid[i + 1] != 0)
                continue;

            var tag = edid[i + 3];
            if (tag == 0xFC) // Monitor name
            {
                var nameBytes = edid.AsSpan(i + 5, 13);
                monitor.Name = System.Text.Encoding.ASCII.GetString(nameBytes.ToArray())
                    .Trim().TrimEnd('\n');
            }
            else if (tag == 0xFF) // Serial number
            {
                var serialBytes = edid.AsSpan(i + 5, 13);
                monitor.SerialNumber = System.Text.Encoding.ASCII.GetString(serialBytes.ToArray())
                    .Trim().TrimEnd('\n');
            }
        }

        return monitor;
    }

    // ─── Software ────────────────────────────────────────────────────────────────

    private static List<SoftwareEntry> CollectSoftware()
    {
        var list = new List<SoftwareEntry>();

        // Debian/Ubuntu: dpkg-query
        try
        {
            var dpkgOutput = RunCommand("dpkg-query",
                "-W -f '${Package}\\t${Version}\\t${Maintainer}\\t${Architecture}\\t${db:Status-Abbrev}\\n'");
            if (!string.IsNullOrWhiteSpace(dpkgOutput))
            {
                foreach (var line in dpkgOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    var parts = line.Split('\t');
                    if (parts.Length >= 1)
                    {
                        var entry = new SoftwareEntry
                        {
                            Name = parts[0].Trim('\''),
                            Version = parts.Length > 1 ? parts[1] : "",
                            Publisher = parts.Length > 2 ? parts[2] : "",
                            Architecture = parts.Length > 3 ? parts[3] : "",
                            InstallSource = "apt"
                        };

                        // Status: 'ii' = installed
                        var status = parts.Length > 4 ? parts[4].Trim() : "";
                        if (!string.IsNullOrWhiteSpace(status) && !status.StartsWith("ii"))
                            continue; // Skip non-installed packages

                        list.Add(entry);
                    }
                }

                // Also collect snap packages
                CollectSnapPackages(list);
                CollectFlatpakPackages(list);
                return list;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] dpkg-query failed: {ex.Message}");
        }

        // RHEL/CentOS/Fedora: rpm
        try
        {
            var rpmOutput = RunCommand("rpm",
                "-qa --qf '%{NAME}\\t%{VERSION}-%{RELEASE}\\t%{VENDOR}\\t%{ARCH}\\t%{INSTALLTIME}\\n'");
            if (!string.IsNullOrWhiteSpace(rpmOutput))
            {
                foreach (var line in rpmOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    var parts = line.Split('\t');
                    if (parts.Length >= 1)
                    {
                        var entry = new SoftwareEntry
                        {
                            Name = parts[0].Trim('\''),
                            Version = parts.Length > 1 ? parts[1] : "",
                            Publisher = parts.Length > 2 ? parts[2] : "",
                            Architecture = parts.Length > 3 ? parts[3] : "",
                            InstallSource = "rpm"
                        };

                        // Parse install time (epoch seconds)
                        if (parts.Length > 4 && long.TryParse(parts[4].Trim('\''), out var epoch) && epoch > 0)
                        {
                            entry.InstalledDate = DateTimeOffset.FromUnixTimeSeconds(epoch).UtcDateTime;
                        }

                        list.Add(entry);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] rpm query failed: {ex.Message}");
        }

        CollectSnapPackages(list);
        CollectFlatpakPackages(list);

        return list;
    }

    private static void CollectSnapPackages(List<SoftwareEntry> list)
    {
        try
        {
            var snapOutput = RunCommand("snap", "list");
            if (string.IsNullOrWhiteSpace(snapOutput))
                return;

            var lines = snapOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            foreach (var line in lines.Skip(1)) // Skip header
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 2)
                {
                    list.Add(new SoftwareEntry
                    {
                        Name = parts[0],
                        Version = parts[1],
                        Publisher = parts.Length > 4 ? parts[4] : "",
                        InstallSource = "snap"
                    });
                }
            }
        }
        catch { /* snap not available */ }
    }

    private static void CollectFlatpakPackages(List<SoftwareEntry> list)
    {
        try
        {
            var fpOutput = RunCommand("flatpak", "list --columns=application,version,origin");
            if (string.IsNullOrWhiteSpace(fpOutput))
                return;

            foreach (var line in fpOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Split('\t', StringSplitOptions.None);
                if (parts.Length >= 1 && !string.IsNullOrWhiteSpace(parts[0]))
                {
                    list.Add(new SoftwareEntry
                    {
                        Name = parts[0].Trim(),
                        Version = parts.Length > 1 ? parts[1].Trim() : "",
                        Publisher = parts.Length > 2 ? parts[2].Trim() : "",
                        InstallSource = "flatpak"
                    });
                }
            }
        }
        catch { /* flatpak not available */ }
    }

    // ─── Services ────────────────────────────────────────────────────────────────

    private static List<ServiceEntry> CollectServices()
    {
        var list = new List<ServiceEntry>();

        var output = RunCommand("systemctl", "list-units --type=service --all --no-legend --no-pager");
        if (string.IsNullOrWhiteSpace(output))
            return list;

        foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 4)
                continue;

            // Format: UNIT LOAD ACTIVE SUB [DESCRIPTION...]
            var unit = parts[0];
            var loadState = parts[1];
            var activeState = parts[2];
            var subState = parts[3];

            // Strip .service suffix for clean name
            var name = unit.EndsWith(".service")
                ? unit[..^".service".Length]
                : unit;

            var entry = new ServiceEntry
            {
                Name = name,
                DisplayName = name,
                Status = subState,   // running, exited, dead, etc.
                StartType = loadState // loaded, not-found, masked, etc.
            };

            // Get detailed info for each service
            try
            {
                var showOutput = RunCommand("systemctl",
                    $"show {unit} --property=Description,ExecMainPID,User,ExecStart --no-pager");
                foreach (var propLine in showOutput.Split('\n'))
                {
                    var eqIdx = propLine.IndexOf('=');
                    if (eqIdx < 0) continue;
                    var key = propLine[..eqIdx];
                    var val = propLine[(eqIdx + 1)..].Trim();

                    switch (key)
                    {
                        case "Description":
                            entry.Description = val;
                            if (!string.IsNullOrWhiteSpace(val))
                                entry.DisplayName = val;
                            break;
                        case "ExecMainPID":
                            if (int.TryParse(val, out var pid))
                                entry.Pid = pid;
                            break;
                        case "User":
                            entry.Account = val;
                            break;
                        case "ExecStart":
                            // ExecStart contains the full exec spec; extract path
                            var pathMatch = Regex.Match(val, @"path=([^;]+)");
                            if (pathMatch.Success)
                                entry.BinaryPath = pathMatch.Groups[1].Value.Trim();
                            else if (!string.IsNullOrWhiteSpace(val) && !val.StartsWith("{"))
                                entry.BinaryPath = val.Split(';')[0].Trim();
                            break;
                    }
                }
            }
            catch { /* systemctl show failed for this unit */ }

            list.Add(entry);
        }

        return list;
    }

    // ─── Processes ───────────────────────────────────────────────────────────────

    private static List<ProcessEntry> CollectProcesses()
    {
        var list = new List<ProcessEntry>();
        if (!Directory.Exists("/proc"))
            return list;

        foreach (var dir in Directory.GetDirectories("/proc"))
        {
            var dirName = Path.GetFileName(dir);
            if (!int.TryParse(dirName, out int pid))
                continue;

            try
            {
                var statusPath = $"/proc/{pid}/status";
                if (!File.Exists(statusPath))
                    continue;

                var statusLines = File.ReadAllLines(statusPath);
                string name = "";
                long memKb = 0;

                foreach (var line in statusLines)
                {
                    if (line.StartsWith("Name:"))
                        name = line[5..].Trim();
                    else if (line.StartsWith("VmRSS:"))
                    {
                        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2) long.TryParse(parts[1], out memKb);
                    }
                }

                if (!string.IsNullOrEmpty(name))
                {
                    list.Add(new ProcessEntry
                    {
                        Pid = pid,
                        Name = name,
                        MemoryBytes = memKb * 1024
                    });
                }
            }
            catch
            {
                // Process may have exited
            }
        }

        return list;
    }

    // ─── Network ─────────────────────────────────────────────────────────────────

    private static List<NetworkInterface> CollectNetwork()
    {
        var list = new List<NetworkInterface>();
        var netDir = "/sys/class/net";
        if (!Directory.Exists(netDir))
            return list;

        // Read DNS servers from resolv.conf
        var dnsServers = new List<string>();
        try
        {
            if (File.Exists("/etc/resolv.conf"))
            {
                foreach (var line in File.ReadAllLines("/etc/resolv.conf"))
                {
                    if (line.TrimStart().StartsWith("nameserver"))
                    {
                        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2)
                            dnsServers.Add(parts[1]);
                    }
                }
            }
        }
        catch { /* resolv.conf not readable */ }

        // Get default gateways
        var defaultGateways = new List<string>();
        try
        {
            var routeOutput = RunCommand("ip", "route show default");
            foreach (var line in routeOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                // "default via 10.0.0.1 dev eth0"
                var match = Regex.Match(line, @"default via (\S+)");
                if (match.Success)
                    defaultGateways.Add(match.Groups[1].Value);
            }
        }
        catch { /* ip route failed */ }

        foreach (var iface in Directory.GetDirectories(netDir))
        {
            var name = Path.GetFileName(iface);

            try
            {
                var nic = new NetworkInterface
                {
                    Name = name,
                    MacAddress = ReadSysFile(Path.Combine(iface, "address")),
                    DnsServers = new List<string>(dnsServers),
                    DefaultGateways = new List<string>(defaultGateways)
                };

                // Speed
                var speedStr = ReadSysFile(Path.Combine(iface, "speed"));
                if (!string.IsNullOrWhiteSpace(speedStr) && long.TryParse(speedStr, out var speedMbps) &&
                    speedMbps > 0)
                    nic.SpeedMbps = speedMbps;

                // Operational state
                var operstate = ReadSysFile(Path.Combine(iface, "operstate"));
                nic.Status = operstate switch
                {
                    "up" => "Up",
                    "down" => "Down",
                    "dormant" => "Dormant",
                    _ => operstate
                };

                // Adapter type from /sys/class/net/<iface>/type
                var typeStr = ReadSysFile(Path.Combine(iface, "type"));
                if (int.TryParse(typeStr, out var ifType))
                {
                    nic.AdapterType = ifType switch
                    {
                        1 => "Ethernet",
                        801 => "Wi-Fi",
                        772 => "Loopback",
                        _ => $"Type-{ifType}"
                    };
                }

                // Check for wireless
                if (Directory.Exists(Path.Combine(iface, "wireless")) ||
                    Directory.Exists($"/sys/class/net/{name}/phy80211"))
                {
                    nic.AdapterType = "Wi-Fi";
                }

                // IP addresses and subnet masks via ip addr show
                try
                {
                    var ipOutput = RunCommand("ip", $"addr show {name}");
                    foreach (var line in ipOutput.Split('\n'))
                    {
                        var trimmed = line.Trim();
                        if (trimmed.StartsWith("inet "))
                        {
                            // "inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0"
                            var parts = trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                            if (parts.Length >= 2)
                            {
                                var cidr = parts[1];
                                var slashIdx = cidr.IndexOf('/');
                                if (slashIdx > 0)
                                {
                                    nic.IpAddresses.Add(cidr[..slashIdx]);
                                    // Convert CIDR prefix to subnet mask
                                    if (int.TryParse(cidr[(slashIdx + 1)..], out var prefix))
                                        nic.SubnetMasks.Add(CidrToSubnetMask(prefix));
                                }
                                else
                                {
                                    nic.IpAddresses.Add(cidr);
                                }
                            }
                        }
                        else if (trimmed.StartsWith("inet6 "))
                        {
                            var parts = trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                            if (parts.Length >= 2)
                                nic.IpAddresses.Add(parts[1].Split('/')[0]);
                        }
                    }
                }
                catch { /* ip addr failed */ }

                // DHCP detection
                try
                {
                    // Check NetworkManager
                    var nmOutput = RunCommand("nmcli", $"-t -f IP4.ADDRESS,IP4.GATEWAY,GENERAL.CONNECTION device show {name}");
                    if (!string.IsNullOrWhiteSpace(nmOutput))
                    {
                        // Check DHCP via connection show
                        foreach (var nmLine in nmOutput.Split('\n'))
                        {
                            if (nmLine.StartsWith("GENERAL.CONNECTION:"))
                            {
                                var connName = nmLine.Split(':')[1].Trim();
                                if (!string.IsNullOrWhiteSpace(connName) && connName != "--")
                                {
                                    var connDetail = RunCommand("nmcli", $"-t -f ipv4.method connection show \"{connName}\"");
                                    nic.DhcpEnabled = connDetail.Contains("auto");
                                }
                            }
                        }
                    }
                    else
                    {
                        // Fallback: check /var/lib/dhcp/ or /var/lib/dhclient/
                        nic.DhcpEnabled = File.Exists($"/var/lib/dhcp/dhclient.{name}.leases") ||
                                          File.Exists($"/var/lib/dhclient/dhclient-{name}.lease") ||
                                          File.Exists($"/run/dhclient-{name}.pid");
                    }
                }
                catch { /* DHCP detection failed */ }

                // Wi-Fi SSID
                if (nic.AdapterType == "Wi-Fi")
                {
                    try
                    {
                        var ssid = RunCommand("iwgetid", $"{name} -r").Trim();
                        if (!string.IsNullOrWhiteSpace(ssid))
                            nic.WirelessSsid = ssid;
                        else
                        {
                            // Fallback: nmcli
                            var nmWifi = RunCommand("nmcli", "-t -f active,ssid dev wifi");
                            foreach (var wLine in nmWifi.Split('\n'))
                            {
                                if (wLine.StartsWith("yes:"))
                                {
                                    nic.WirelessSsid = wLine[4..];
                                    break;
                                }
                            }
                        }
                    }
                    catch { /* SSID detection failed */ }
                }

                list.Add(nic);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ProcCollector] Network interface {name} failed: {ex.Message}");
            }
        }

        return list;
    }

    // ─── Local Users ─────────────────────────────────────────────────────────────

    private static List<LocalUser> CollectLocalUsers()
    {
        var list = new List<LocalUser>();
        if (!File.Exists("/etc/passwd"))
            return list;

        // Determine sudo/wheel group members
        var adminUsers = new HashSet<string>(StringComparer.Ordinal);
        try
        {
            if (File.Exists("/etc/group"))
            {
                foreach (var line in File.ReadAllLines("/etc/group"))
                {
                    var parts = line.Split(':');
                    if (parts.Length >= 4 && (parts[0] == "sudo" || parts[0] == "wheel"))
                    {
                        foreach (var user in parts[3].Split(',', StringSplitOptions.RemoveEmptyEntries))
                            adminUsers.Add(user.Trim());
                    }
                }
            }
        }
        catch { /* /etc/group not readable */ }

        // Parse last login times from lastlog or last
        var lastLogons = new Dictionary<string, DateTime>(StringComparer.Ordinal);
        try
        {
            var lastOutput = RunCommand("lastlog", "-u 0-65535");
            foreach (var line in lastOutput.Split('\n').Skip(1)) // Skip header
            {
                if (line.Contains("**Never logged in**"))
                    continue;

                var parts = line.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 2)
                {
                    var username = parts[0];
                    // Try to parse the date portion
                    var dateStr = parts[1].Trim();
                    // lastlog format: "Port  From  Latest"
                    var dateMatch = Regex.Match(dateStr, @"\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}.*\d{4}");
                    if (dateMatch.Success && DateTime.TryParse(dateMatch.Value, CultureInfo.InvariantCulture,
                            DateTimeStyles.None, out var logonDate))
                    {
                        lastLogons[username] = logonDate.ToUniversalTime();
                    }
                }
            }
        }
        catch { /* lastlog not available */ }

        foreach (var line in File.ReadAllLines("/etc/passwd"))
        {
            var parts = line.Split(':');
            if (parts.Length < 7) continue;

            var username = parts[0];
            var uid = int.TryParse(parts[2], out int u) ? u : -1;

            // Skip system accounts (UID < 1000), except root (UID 0)
            if (uid != 0 && uid < 1000) continue;

            var user = new LocalUser
            {
                Username = username,
                IsAdmin = uid == 0 || adminUsers.Contains(username)
            };

            if (lastLogons.TryGetValue(username, out var lastLogon))
                user.LastLogon = lastLogon;

            list.Add(user);
        }

        return list;
    }

    // ─── Security Posture ────────────────────────────────────────────────────────

    private static SecurityPosture CollectSecurityPosture()
    {
        var security = new SecurityPosture();

        // Antivirus: check for ClamAV
        try
        {
            var clamVersion = RunCommand("clamscan", "--version");
            if (!string.IsNullOrWhiteSpace(clamVersion) && !clamVersion.Contains("not found"))
            {
                security.AntivirusProduct = "ClamAV";
                var versionMatch = Regex.Match(clamVersion, @"ClamAV (\S+)");
                if (versionMatch.Success)
                    security.AntivirusVersion = versionMatch.Groups[1].Value;

                // Signature version from freshclam
                var sigMatch = Regex.Match(clamVersion, @"/(\d+)/");
                if (sigMatch.Success)
                    security.SignatureVersion = sigMatch.Groups[1].Value;

                // Check if clamd is running (real-time)
                var clamdStatus = RunCommand("systemctl", "is-active clamav-daemon");
                security.RealTimeProtectionEnabled = clamdStatus.Trim() == "active";
            }
        }
        catch { /* ClamAV not installed */ }

        // Check for other AVs
        if (string.IsNullOrWhiteSpace(security.AntivirusProduct))
        {
            try
            {
                // ESET
                var esetOutput = RunCommand("opt/eset/esets/sbin/esets_daemon", "--version");
                if (!string.IsNullOrWhiteSpace(esetOutput) && esetOutput.Contains("ESET"))
                {
                    security.AntivirusProduct = "ESET";
                    security.AntivirusVersion = esetOutput.Trim();
                }
            }
            catch { /* ESET not installed */ }

            try
            {
                // Sophos
                var sophosOutput = RunCommand("/opt/sophos-av/bin/savdstatus", "");
                if (!string.IsNullOrWhiteSpace(sophosOutput) && sophosOutput.Contains("Sophos"))
                {
                    security.AntivirusProduct = "Sophos";
                    security.RealTimeProtectionEnabled = sophosOutput.Contains("on-access scanning is running",
                        StringComparison.OrdinalIgnoreCase);
                }
            }
            catch { /* Sophos not installed */ }
        }

        // Firewall
        try
        {
            // Try ufw first
            var ufwOutput = RunCommand("ufw", "status");
            if (!string.IsNullOrWhiteSpace(ufwOutput) && !ufwOutput.Contains("not found"))
            {
                security.FirewallEnabled = ufwOutput.Contains("Status: active", StringComparison.OrdinalIgnoreCase);
                security.FirewallProfile = "ufw";
            }
            else
            {
                // Try firewalld
                var fwCmdOutput = RunCommand("firewall-cmd", "--state");
                if (fwCmdOutput.Trim() == "running")
                {
                    security.FirewallEnabled = true;
                    security.FirewallProfile = "firewalld";
                }
                else
                {
                    // Check iptables has rules
                    var iptOutput = RunCommand("iptables", "-L -n");
                    if (!string.IsNullOrWhiteSpace(iptOutput))
                    {
                        // If there are more rules than default empty chains
                        var ruleCount = iptOutput.Split('\n')
                            .Count(l => !l.StartsWith("Chain") && !l.StartsWith("target") &&
                                        !string.IsNullOrWhiteSpace(l));
                        security.FirewallEnabled = ruleCount > 0;
                        security.FirewallProfile = "iptables";
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Firewall detection failed: {ex.Message}");
        }

        // Disk encryption (LUKS)
        try
        {
            var lsblkFs = RunCommand("lsblk", "-o NAME,FSTYPE --noheadings");
            if (lsblkFs.Contains("crypto_LUKS", StringComparison.OrdinalIgnoreCase))
            {
                security.DiskEncryptionEnabled = true;
                security.EncryptionProduct = "LUKS";
            }
            else
            {
                // Check dmsetup for active encrypted volumes
                var dmOutput = RunCommand("dmsetup", "status");
                if (dmOutput.Contains("crypt", StringComparison.OrdinalIgnoreCase))
                {
                    security.DiskEncryptionEnabled = true;
                    security.EncryptionProduct = "LUKS";
                }
            }
        }
        catch { /* Encryption detection failed */ }

        // Secure Boot and TPM (mirror from hardware)
        try
        {
            if (Directory.Exists("/sys/firmware/efi/efivars"))
            {
                var sbFiles = Directory.GetFiles("/sys/firmware/efi/efivars", "SecureBoot-*");
                if (sbFiles.Length > 0)
                {
                    var sbData = File.ReadAllBytes(sbFiles[0]);
                    security.SecureBootEnabled = sbData.Length > 0 && sbData[^1] == 1;
                }
            }

            security.TpmReady = Directory.Exists("/sys/class/tpm/tpm0");
        }
        catch { /* SecureBoot/TPM detection failed */ }

        // Reboot required
        try
        {
            // Debian/Ubuntu
            if (File.Exists("/var/run/reboot-required"))
            {
                security.RebootRequired = true;
            }
            else
            {
                // RHEL/CentOS
                var needsRestart = RunCommand("needs-restarting", "-r");
                security.RebootRequired = needsRestart.Contains("Reboot is required",
                    StringComparison.OrdinalIgnoreCase);
            }
        }
        catch { /* Reboot detection failed */ }

        // Pending updates count
        try
        {
            // Try apt
            var aptOutput = RunCommand("apt", "list --upgradable");
            if (!string.IsNullOrWhiteSpace(aptOutput) && !aptOutput.Contains("not found"))
            {
                // Count lines excluding the "Listing..." header
                security.PendingUpdateCount = aptOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                    .Count(l => !l.StartsWith("Listing") && !l.StartsWith("WARNING") &&
                                !string.IsNullOrWhiteSpace(l));
            }
            else
            {
                // Try yum/dnf
                var yumOutput = RunCommand("yum", "check-update");
                if (!string.IsNullOrWhiteSpace(yumOutput))
                {
                    // yum check-update returns non-empty lines with package info after empty line
                    var inPackages = false;
                    var count = 0;
                    foreach (var line in yumOutput.Split('\n'))
                    {
                        if (string.IsNullOrWhiteSpace(line))
                        {
                            inPackages = true;
                            continue;
                        }

                        if (inPackages && !string.IsNullOrWhiteSpace(line) &&
                            !line.StartsWith("Obsoleting"))
                            count++;
                    }

                    security.PendingUpdateCount = count;
                }
            }
        }
        catch { /* Pending updates detection failed */ }

        // Local admin accounts
        try
        {
            if (File.Exists("/etc/group"))
            {
                foreach (var line in File.ReadAllLines("/etc/group"))
                {
                    var parts = line.Split(':');
                    if (parts.Length >= 4 && (parts[0] == "sudo" || parts[0] == "wheel"))
                    {
                        foreach (var user in parts[3].Split(',', StringSplitOptions.RemoveEmptyEntries))
                            security.LocalAdminAccounts.Add(user.Trim());
                    }
                }

                // Always include root
                if (!security.LocalAdminAccounts.Contains("root"))
                    security.LocalAdminAccounts.Insert(0, "root");
            }
        }
        catch { /* Admin account enumeration failed */ }

        return security;
    }

    // ─── Directory Status ────────────────────────────────────────────────────────

    private static DirectoryStatus CollectDirectoryStatus()
    {
        var status = new DirectoryStatus();

        // Check realm (AD join via realmd/SSSD)
        try
        {
            var realmOutput = RunCommand("realm", "list");
            if (!string.IsNullOrWhiteSpace(realmOutput) && !realmOutput.Contains("not found"))
            {
                status.AdJoined = true;
                foreach (var line in realmOutput.Split('\n'))
                {
                    var trimmed = line.Trim();
                    if (trimmed.StartsWith("domain-name:"))
                        status.AdDomainName = trimmed["domain-name:".Length..].Trim();
                }
            }
        }
        catch { /* realm not available */ }

        // Fallback: check sssd.conf for AD domains
        if (!status.AdJoined)
        {
            try
            {
                if (File.Exists("/etc/sssd/sssd.conf"))
                {
                    var sssdConf = File.ReadAllText("/etc/sssd/sssd.conf");
                    if (sssdConf.Contains("id_provider = ad", StringComparison.OrdinalIgnoreCase) ||
                        sssdConf.Contains("ad_domain", StringComparison.OrdinalIgnoreCase))
                    {
                        status.AdJoined = true;
                        var domMatch = Regex.Match(sssdConf, @"ad_domain\s*=\s*(.+)$",
                            RegexOptions.Multiline | RegexOptions.IgnoreCase);
                        if (domMatch.Success)
                            status.AdDomainName = domMatch.Groups[1].Value.Trim();
                    }
                }
            }
            catch { /* sssd.conf not readable */ }
        }

        // Fallback: check /etc/krb5.conf
        if (!status.AdJoined)
        {
            try
            {
                if (File.Exists("/etc/krb5.conf"))
                {
                    var krb5Conf = File.ReadAllText("/etc/krb5.conf");
                    var realmMatch = Regex.Match(krb5Conf, @"default_realm\s*=\s*(.+)$",
                        RegexOptions.Multiline | RegexOptions.IgnoreCase);
                    if (realmMatch.Success)
                    {
                        var realm = realmMatch.Groups[1].Value.Trim();
                        // Check if adcli info works
                        var adcliOutput = RunCommand("adcli", $"info {realm}");
                        if (!string.IsNullOrWhiteSpace(adcliOutput) && adcliOutput.Contains("domain-name",
                                StringComparison.OrdinalIgnoreCase))
                        {
                            status.AdJoined = true;
                            status.AdDomainName = realm;
                        }
                    }
                }
            }
            catch { /* krb5.conf not readable */ }
        }

        return status;
    }

    // ─── Uptime ──────────────────────────────────────────────────────────────────

    private static UptimeInfo CollectUptime()
    {
        var info = new UptimeInfo();

        var uptimeStr = ReadSysFile("/proc/uptime");
        if (string.IsNullOrWhiteSpace(uptimeStr))
            return info;

        var parts = uptimeStr.Split(' ');
        if (parts.Length >= 1 && double.TryParse(parts[0], NumberStyles.Float,
                CultureInfo.InvariantCulture, out var uptimeSec))
        {
            info.Uptime = TimeSpan.FromSeconds(uptimeSec);
            info.LastBootTime = DateTime.UtcNow.AddSeconds(-uptimeSec);

            // Format uptime
            var ts = info.Uptime;
            if (ts.Days > 0)
                info.UptimeFormatted = $"{ts.Days}d {ts.Hours}h {ts.Minutes}m";
            else if (ts.Hours > 0)
                info.UptimeFormatted = $"{ts.Hours}h {ts.Minutes}m";
            else
                info.UptimeFormatted = $"{ts.Minutes}m {ts.Seconds}s";
        }

        return info;
    }

    // ─── Performance Snapshot ────────────────────────────────────────────────────

    private static PerformanceSnapshot CollectPerformance()
    {
        var perf = new PerformanceSnapshot();

        // CPU usage: sample /proc/stat twice, 1 second apart
        try
        {
            var stat1 = ReadCpuStat();
            Thread.Sleep(1000);
            var stat2 = ReadCpuStat();

            if (stat1 != null && stat2 != null)
            {
                var totalDelta = stat2.Value.Total - stat1.Value.Total;
                var idleDelta = stat2.Value.Idle - stat1.Value.Idle;

                if (totalDelta > 0)
                    perf.CpuUtilizationPercent = Math.Round((1.0 - (double)idleDelta / totalDelta) * 100, 1);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] CPU usage sampling failed: {ex.Message}");
        }

        // Memory from /proc/meminfo
        try
        {
            long memTotal = 0, memAvailable = 0;
            if (File.Exists("/proc/meminfo"))
            {
                foreach (var line in File.ReadAllLines("/proc/meminfo"))
                {
                    var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 2)
                    {
                        if (line.StartsWith("MemTotal:") && long.TryParse(parts[1], out var val))
                            memTotal = val * 1024;
                        else if (line.StartsWith("MemAvailable:") && long.TryParse(parts[1], out val))
                            memAvailable = val * 1024;
                    }
                }
            }

            perf.MemoryAvailableBytes = memAvailable;
            perf.MemoryUsedBytes = memTotal - memAvailable;
            if (memTotal > 0)
                perf.MemoryUtilizationPercent = Math.Round((double)(memTotal - memAvailable) / memTotal * 100, 1);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Memory usage failed: {ex.Message}");
        }

        // Disk usage from df
        try
        {
            var dfData = ParseDfOutput();
            foreach (var kvp in dfData)
            {
                if (kvp.Value.Size <= 0) continue;

                var used = kvp.Value.Size - kvp.Value.Available;
                perf.DiskUsages.Add(new DiskUsage
                {
                    MountPoint = kvp.Key,
                    UsedBytes = used,
                    FreeBytes = kvp.Value.Available,
                    UsagePercent = Math.Round((double)used / kvp.Value.Size * 100, 1)
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Disk usage failed: {ex.Message}");
        }

        return perf;
    }

    // ─── Virtualization ──────────────────────────────────────────────────────────

    private static VirtualizationInfo CollectVirtualization()
    {
        var virt = new VirtualizationInfo();

        // systemd-detect-virt
        try
        {
            var virtType = RunCommand("systemd-detect-virt", "").Trim();
            if (!string.IsNullOrWhiteSpace(virtType) && virtType != "none")
            {
                virt.IsVirtual = true;
                virt.HypervisorType = virtType switch
                {
                    "vmware" => "VMware",
                    "microsoft" => "Hyper-V",
                    "kvm" => "KVM",
                    "xen" => "Xen",
                    "oracle" => "VirtualBox",
                    "qemu" => "QEMU",
                    "parallels" => "Parallels",
                    "bhyve" => "bhyve",
                    _ => virtType
                };
            }
        }
        catch { /* systemd-detect-virt not available */ }

        // DMI-based detection (fallback/supplement)
        if (!virt.IsVirtual)
        {
            try
            {
                var productName = ReadSysFile("/sys/class/dmi/id/product_name").ToLowerInvariant();
                if (productName.Contains("vmware"))
                {
                    virt.IsVirtual = true;
                    virt.HypervisorType = "VMware";
                }
                else if (productName.Contains("virtualbox"))
                {
                    virt.IsVirtual = true;
                    virt.HypervisorType = "VirtualBox";
                }
                else if (productName.Contains("virtual machine") || productName.Contains("hyper-v"))
                {
                    virt.IsVirtual = true;
                    virt.HypervisorType = "Hyper-V";
                }
                else if (productName.Contains("kvm"))
                {
                    virt.IsVirtual = true;
                    virt.HypervisorType = "KVM";
                }
            }
            catch { /* DMI read failed */ }
        }

        // Xen detection
        if (!virt.IsVirtual)
        {
            try
            {
                var hypervisorType = ReadSysFile("/sys/hypervisor/type");
                if (hypervisorType.Equals("xen", StringComparison.OrdinalIgnoreCase))
                {
                    virt.IsVirtual = true;
                    virt.HypervisorType = "Xen";
                }
            }
            catch { /* /sys/hypervisor not available */ }
        }

        // Cloud provider detection (only if virtual)
        if (virt.IsVirtual)
        {
            // AWS
            try
            {
                var awsInstanceId = RunCommand("curl", "-s -m 2 http://169.254.169.254/latest/meta-data/instance-id");
                if (!string.IsNullOrWhiteSpace(awsInstanceId) && awsInstanceId.StartsWith("i-"))
                {
                    virt.CloudProvider = "AWS";
                    virt.InstanceId = awsInstanceId.Trim();

                    var awsType = RunCommand("curl", "-s -m 2 http://169.254.169.254/latest/meta-data/instance-type");
                    if (!string.IsNullOrWhiteSpace(awsType))
                        virt.InstanceType = awsType.Trim();

                    var awsRegion = RunCommand("curl",
                        "-s -m 2 http://169.254.169.254/latest/meta-data/placement/availability-zone");
                    if (!string.IsNullOrWhiteSpace(awsRegion))
                        virt.Region = awsRegion.Trim().TrimEnd('a', 'b', 'c', 'd', 'e', 'f');
                }
            }
            catch { /* AWS metadata not available */ }

            // Azure
            if (string.IsNullOrWhiteSpace(virt.CloudProvider))
            {
                try
                {
                    var azureOutput = RunCommand("curl",
                        "-s -m 2 -H \"Metadata:true\" \"http://169.254.169.254/metadata/instance?api-version=2021-02-01\"");
                    if (!string.IsNullOrWhiteSpace(azureOutput) && azureOutput.Contains("vmId"))
                    {
                        virt.CloudProvider = "Azure";
                        using var azDoc = JsonDocument.Parse(azureOutput);
                        var compute = azDoc.RootElement.GetProperty("compute");

                        virt.InstanceId = GetJsonString(compute, "vmId");
                        virt.InstanceType = GetJsonString(compute, "vmSize");
                        virt.Region = GetJsonString(compute, "location");
                        virt.VmName = GetJsonString(compute, "name");
                    }
                }
                catch { /* Azure metadata not available */ }
            }

            // GCP
            if (string.IsNullOrWhiteSpace(virt.CloudProvider))
            {
                try
                {
                    var gcpInstanceId = RunCommand("curl",
                        "-s -m 2 -H \"Metadata-Flavor: Google\" http://metadata.google.internal/computeMetadata/v1/instance/id");
                    if (!string.IsNullOrWhiteSpace(gcpInstanceId) && gcpInstanceId.All(char.IsDigit))
                    {
                        virt.CloudProvider = "GCP";
                        virt.InstanceId = gcpInstanceId.Trim();

                        var gcpType = RunCommand("curl",
                            "-s -m 2 -H \"Metadata-Flavor: Google\" http://metadata.google.internal/computeMetadata/v1/instance/machine-type");
                        if (!string.IsNullOrWhiteSpace(gcpType))
                            virt.InstanceType = gcpType.Trim().Split('/').Last();

                        var gcpZone = RunCommand("curl",
                            "-s -m 2 -H \"Metadata-Flavor: Google\" http://metadata.google.internal/computeMetadata/v1/instance/zone");
                        if (!string.IsNullOrWhiteSpace(gcpZone))
                        {
                            var zone = gcpZone.Trim().Split('/').Last();
                            // Remove zone suffix to get region (e.g., us-central1-a -> us-central1)
                            var lastDash = zone.LastIndexOf('-');
                            virt.Region = lastDash > 0 ? zone[..lastDash] : zone;
                        }
                    }
                }
                catch { /* GCP metadata not available */ }
            }
        }

        return virt;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    private static string ReadSysFile(string path)
    {
        try
        {
            return File.Exists(path) ? File.ReadAllText(path).Trim() : "";
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
            process.WaitForExit(10000);
            return output;
        }
        catch
        {
            return "";
        }
    }

    private static Dictionary<string, string> ParseKeyValueFile(string path)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in File.ReadAllLines(path))
        {
            var eqIdx = line.IndexOf('=');
            if (eqIdx > 0)
            {
                var key = line[..eqIdx].Trim();
                var val = line[(eqIdx + 1)..].Trim().Trim('"');
                dict[key] = val;
            }
        }

        return dict;
    }

    private record struct DfEntry(long Size, long Available);

    private static Dictionary<string, DfEntry> ParseDfOutput()
    {
        var result = new Dictionary<string, DfEntry>(StringComparer.Ordinal);
        var dfOutput = RunCommand("df", "-B1 --output=target,size,avail");
        if (string.IsNullOrWhiteSpace(dfOutput))
            return result;

        foreach (var line in dfOutput.Split('\n').Skip(1)) // Skip header
        {
            var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 3)
            {
                var mount = parts[0];
                if (long.TryParse(parts[1], out var size) && long.TryParse(parts[2], out var avail))
                    result[mount] = new DfEntry(size, avail);
            }
        }

        return result;
    }

    private static (long Total, long Idle)? ReadCpuStat()
    {
        if (!File.Exists("/proc/stat"))
            return null;

        var firstLine = File.ReadAllLines("/proc/stat").FirstOrDefault(l => l.StartsWith("cpu "));
        if (firstLine == null)
            return null;

        var parts = firstLine.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 5)
            return null;

        // cpu user nice system idle iowait irq softirq steal guest guest_nice
        long total = 0;
        for (int i = 1; i < parts.Length; i++)
        {
            if (long.TryParse(parts[i], out var val))
                total += val;
        }

        long idle = long.TryParse(parts[4], out var idleVal) ? idleVal : 0;
        // Include iowait as idle time
        if (parts.Length > 5 && long.TryParse(parts[5], out var iowait))
            idle += iowait;

        return (total, idle);
    }

    private static string CidrToSubnetMask(int prefix)
    {
        if (prefix < 0 || prefix > 32) return "";
        uint mask = prefix == 0 ? 0 : uint.MaxValue << (32 - prefix);
        return $"{(mask >> 24) & 0xFF}.{(mask >> 16) & 0xFF}.{(mask >> 8) & 0xFF}.{mask & 0xFF}";
    }

    private static string GetJsonString(JsonElement element, string property)
    {
        if (element.TryGetProperty(property, out var prop))
        {
            return prop.ValueKind switch
            {
                JsonValueKind.String => prop.GetString() ?? "",
                JsonValueKind.Number => prop.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => ""
            };
        }

        return "";
    }
}

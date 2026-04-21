namespace InvAgent.Privacy;

using System.Security.Cryptography;
using System.Text;
using InvAgent.Models;

/// <summary>
/// Privacy filter that applies data tier policies to inventory payloads before transmission.
/// Tiers: full (no filtering), restricted (remove PII), anonymized (hash identifiers).
/// </summary>
public static class PrivacyFilter
{
    public static InventoryPayload Apply(InventoryPayload payload, string tier)
    {
        return tier switch
        {
            "full" => payload,
            "restricted" => ApplyRestricted(payload),
            "anonymized" => ApplyAnonymized(payload),
            _ => payload,
        };
    }

    private static InventoryPayload ApplyRestricted(InventoryPayload payload)
    {
        var filtered = ShallowCopy(payload);

        // Remove local users entirely
        filtered.LocalUsers = [];

        // Remove sensitive hardware identifiers
        filtered.Hardware = new HardwareInfo
        {
            Manufacturer = payload.Hardware.Manufacturer,
            Model = payload.Hardware.Model,
            SerialNumber = "",
            UUID = "",
            SystemType = payload.Hardware.SystemType,
            BiosVendor = payload.Hardware.BiosVendor,
            BiosVersion = payload.Hardware.BiosVersion,
            BiosDate = payload.Hardware.BiosDate,
            BoardManufacturer = payload.Hardware.BoardManufacturer,
            BoardModel = payload.Hardware.BoardModel,
            BoardSerialNumber = "",
            TpmPresent = payload.Hardware.TpmPresent,
            TpmVersion = payload.Hardware.TpmVersion,
            SecureBootEnabled = payload.Hardware.SecureBootEnabled,
            Cpus = payload.Hardware.Cpus.Select(c => new CpuInfo
            {
                Name = c.Name,
                Manufacturer = c.Manufacturer,
                Cores = c.Cores,
                Threads = c.Threads,
                SpeedMhz = c.SpeedMhz,
                MaxSpeedMhz = c.MaxSpeedMhz,
                Socket = c.Socket,
                L2CacheKb = c.L2CacheKb,
                L3CacheKb = c.L3CacheKb,
                Architecture = c.Architecture,
                PartNumber = "",
                SerialNumber = "",
            }).ToList(),
            TotalMemoryBytes = payload.Hardware.TotalMemoryBytes,
            AvailableMemoryBytes = payload.Hardware.AvailableMemoryBytes,
            MemoryModules = payload.Hardware.MemoryModules.Select(m => new MemoryModule
            {
                DeviceLocator = m.DeviceLocator,
                Manufacturer = m.Manufacturer,
                CapacityBytes = m.CapacityBytes,
                SpeedMhz = m.SpeedMhz,
                MemoryType = m.MemoryType,
                FormFactor = m.FormFactor,
                PartNumber = "",
                SerialNumber = "",
            }).ToList(),
            Disks = payload.Hardware.Disks.Select(d => new DiskInfo
            {
                DeviceName = d.DeviceName,
                Model = d.Model,
                SizeBytes = d.SizeBytes,
                Type = d.Type,
                BusType = d.BusType,
                MediaType = d.MediaType,
                SmartStatus = d.SmartStatus,
                Volumes = d.Volumes,
                SerialNumber = "",
                FirmwareVersion = d.FirmwareVersion,
            }).ToList(),
            Gpus = payload.Hardware.Gpus,
            Battery = payload.Hardware.Battery,
            Monitors = payload.Hardware.Monitors.Select(m => new MonitorInfo
            {
                Name = m.Name,
                Manufacturer = m.Manufacturer,
                Resolution = m.Resolution,
                SizeInches = m.SizeInches,
                ConnectionType = m.ConnectionType,
                SerialNumber = "",
            }).ToList(),
        };

        // Remove software publishers
        filtered.Software = payload.Software.Select(s => new SoftwareEntry
        {
            Name = s.Name,
            Version = s.Version,
            Publisher = "",
            InstalledDate = s.InstalledDate,
            Architecture = s.Architecture,
            InstallSource = s.InstallSource,
        }).ToList();

        // Remove process names
        filtered.Processes = payload.Processes.Select(p => new ProcessEntry
        {
            Pid = p.Pid,
            Name = "",
            CpuPercent = p.CpuPercent,
            MemoryBytes = p.MemoryBytes
        }).ToList();

        // Remove BitLocker recovery keys
        filtered.BitLockerVolumes = payload.BitLockerVolumes.Select(b => new BitLockerVolume
        {
            DriveLetter = b.DriveLetter,
            ProtectionStatus = b.ProtectionStatus,
            EncryptionMethod = b.EncryptionMethod,
            LockStatus = b.LockStatus,
            EncryptionPercentage = b.EncryptionPercentage,
            RecoveryKeyId = "",
            RecoveryKey = "",
        }).ToList();

        // Remove security-sensitive local admin list
        filtered.Security = new SecurityPosture
        {
            AntivirusProduct = payload.Security.AntivirusProduct,
            AntivirusVersion = payload.Security.AntivirusVersion,
            RealTimeProtectionEnabled = payload.Security.RealTimeProtectionEnabled,
            FirewallEnabled = payload.Security.FirewallEnabled,
            DiskEncryptionEnabled = payload.Security.DiskEncryptionEnabled,
            EncryptionProduct = payload.Security.EncryptionProduct,
            SecureBootEnabled = payload.Security.SecureBootEnabled,
            TpmReady = payload.Security.TpmReady,
            LastSecurityUpdate = payload.Security.LastSecurityUpdate,
            RebootRequired = payload.Security.RebootRequired,
            PendingUpdateCount = payload.Security.PendingUpdateCount,
            LocalAdminAccounts = [],
        };

        // Remove directory sensitive data
        filtered.Directory = new DirectoryStatus
        {
            AdJoined = payload.Directory.AdJoined,
            AzureAdJoined = payload.Directory.AzureAdJoined,
            MdmEnrolled = payload.Directory.MdmEnrolled,
            MdmProvider = payload.Directory.MdmProvider,
            ComplianceState = payload.Directory.ComplianceState,
        };

        return filtered;
    }

    private static InventoryPayload ApplyAnonymized(InventoryPayload payload)
    {
        var filtered = ApplyRestricted(payload);

        // Hash hostname and FQDN
        filtered.Hostname = HashValue(payload.Hostname);
        filtered.Fqdn = HashValue(payload.Fqdn);

        // Hash MAC addresses and IP addresses
        filtered.Network = payload.Network.Select(n => new NetworkInterface
        {
            Name = n.Name,
            Description = n.Description,
            MacAddress = string.IsNullOrEmpty(n.MacAddress) ? "" : HashValue(n.MacAddress),
            IpAddresses = n.IpAddresses.Select(HashValue).ToList(),
            SubnetMasks = n.SubnetMasks,
            DefaultGateways = n.DefaultGateways.Select(HashValue).ToList(),
            DnsServers = n.DnsServers.Select(HashValue).ToList(),
            SpeedMbps = n.SpeedMbps,
            AdapterType = n.AdapterType,
            Status = n.Status,
        }).ToList();

        return filtered;
    }

    private static string HashValue(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes)[..12].ToLowerInvariant();
    }

    private static InventoryPayload ShallowCopy(InventoryPayload original)
    {
        return new InventoryPayload
        {
            Hostname = original.Hostname,
            Fqdn = original.Fqdn,
            Platform = original.Platform,
            DeviceType = original.DeviceType,
            DomainWorkgroup = original.DomainWorkgroup,
            OuPath = original.OuPath,
            Os = original.Os,
            Hardware = original.Hardware,
            Software = new List<SoftwareEntry>(original.Software),
            WindowsUpdates = new List<WindowsUpdate>(original.WindowsUpdates),
            Services = new List<ServiceEntry>(original.Services),
            Processes = new List<ProcessEntry>(original.Processes),
            Network = new List<NetworkInterface>(original.Network),
            LocalUsers = new List<LocalUser>(original.LocalUsers),
            Security = original.Security,
            Directory = original.Directory,
            BitLockerVolumes = new List<BitLockerVolume>(original.BitLockerVolumes),
            Uptime = original.Uptime,
            Performance = original.Performance,
            Virtualization = original.Virtualization,
            CollectedAt = original.CollectedAt,
            ScanDurationMs = original.ScanDurationMs,
        };
    }
}

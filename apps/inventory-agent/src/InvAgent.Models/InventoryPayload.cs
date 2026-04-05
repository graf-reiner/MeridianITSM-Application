namespace InvAgent.Models;

/// <summary>
/// Complete inventory payload sent from agent to server.
/// Organized in tiers: Identity → Hardware → OS → Network → Security → Software → Health → Lifecycle.
/// </summary>
public class InventoryPayload
{
    // ─── Tier 1: Identity & Inventory ────────────────────────────────────────

    public string Hostname { get; set; } = "";
    public string Fqdn { get; set; } = "";
    public string Platform { get; set; } = "";          // WINDOWS, LINUX, MACOS
    public string DeviceType { get; set; } = "";         // Desktop, Laptop, Server, VM, ThinClient
    public string DomainWorkgroup { get; set; } = "";
    public string OuPath { get; set; } = "";             // OU/directory placement

    public OsInfo Os { get; set; } = new();
    public HardwareInfo Hardware { get; set; } = new();
    public List<SoftwareEntry> Software { get; set; } = [];
    public List<WindowsUpdate> WindowsUpdates { get; set; } = [];
    public List<ServiceEntry> Services { get; set; } = [];
    public List<ProcessEntry> Processes { get; set; } = [];
    public List<NetworkInterface> Network { get; set; } = [];
    public List<LocalUser> LocalUsers { get; set; } = [];

    // ─── Tier 2: Security & Compliance ───────────────────────────────────────

    public SecurityPosture Security { get; set; } = new();
    public DirectoryStatus Directory { get; set; } = new();
    public List<BitLockerVolume> BitLockerVolumes { get; set; } = [];

    // ─── Tier 3: Operational Health ──────────────────────────────────────────

    public UptimeInfo Uptime { get; set; } = new();
    public PerformanceSnapshot Performance { get; set; } = new();
    public VirtualizationInfo Virtualization { get; set; } = new();

    // ─── Agent Metadata ──────────────────────────────────────────────────────

    public DateTime CollectedAt { get; set; } = DateTime.UtcNow;
    public double ScanDurationMs { get; set; }
}

// ─── Operating System ────────────────────────────────────────────────────────

public class OsInfo
{
    public string Name { get; set; } = "";
    public string Edition { get; set; } = "";
    public string Version { get; set; } = "";
    public string BuildNumber { get; set; } = "";
    public string KernelVersion { get; set; } = "";
    public string Architecture { get; set; } = "";
    public string InstallDate { get; set; } = "";
    public string LastBootTime { get; set; } = "";
    public string RegisteredUser { get; set; } = "";
    public string SystemDirectory { get; set; } = "";
    public string Locale { get; set; } = "";
    public string TimeZone { get; set; } = "";
    public string ProductKey { get; set; } = "";
}

// ─── Hardware ────────────────────────────────────────────────────────────────

public class HardwareInfo
{
    // System board / chassis
    public string Manufacturer { get; set; } = "";
    public string Model { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public string UUID { get; set; } = "";
    public string SystemType { get; set; } = "";         // Physical, Virtual

    // BIOS / UEFI
    public string BiosVendor { get; set; } = "";
    public string BiosVersion { get; set; } = "";
    public string BiosDate { get; set; } = "";

    // Motherboard
    public string BoardManufacturer { get; set; } = "";
    public string BoardModel { get; set; } = "";
    public string BoardSerialNumber { get; set; } = "";

    // TPM
    public bool TpmPresent { get; set; }
    public string TpmVersion { get; set; } = "";
    public bool SecureBootEnabled { get; set; }

    // CPU
    public List<CpuInfo> Cpus { get; set; } = [];

    // Memory
    public long TotalMemoryBytes { get; set; }
    public long AvailableMemoryBytes { get; set; }
    public List<MemoryModule> MemoryModules { get; set; } = [];

    // Storage
    public List<DiskInfo> Disks { get; set; } = [];

    // GPU
    public List<GpuInfo> Gpus { get; set; } = [];

    // Battery (laptops)
    public BatteryInfo? Battery { get; set; }

    // Monitors
    public List<MonitorInfo> Monitors { get; set; } = [];
}

public class CpuInfo
{
    public string Name { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string PartNumber { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public int Cores { get; set; }
    public int Threads { get; set; }
    public double SpeedMhz { get; set; }
    public double MaxSpeedMhz { get; set; }
    public string Socket { get; set; } = "";
    public int L2CacheKb { get; set; }
    public int L3CacheKb { get; set; }
    public string Architecture { get; set; } = "";
}

public class MemoryModule
{
    public string DeviceLocator { get; set; } = "";
    public string BankLabel { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string PartNumber { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public long CapacityBytes { get; set; }
    public int SpeedMhz { get; set; }
    public int ConfiguredSpeedMhz { get; set; }
    public string MemoryType { get; set; } = "";         // DDR4, DDR5, LPDDR5
    public string FormFactor { get; set; } = "";          // DIMM, SODIMM
    public int DataWidth { get; set; }
}

public class DiskInfo
{
    public string DeviceName { get; set; } = "";
    public string Model { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public string FirmwareVersion { get; set; } = "";
    public long SizeBytes { get; set; }
    public string Type { get; set; } = "";                // SSD, HDD, NVMe, USB
    public string BusType { get; set; } = "";             // SATA, NVMe, USB, SAS, SCSI, iSCSI, FibreChannel
    public string MediaType { get; set; } = "";           // Fixed, Removable, External
    public string PartitionStyle { get; set; } = "";      // GPT, MBR
    public string SmartStatus { get; set; } = "";         // Healthy, Warning, Critical
    public List<VolumeInfo> Volumes { get; set; } = [];
}

public class VolumeInfo
{
    public string DriveLetter { get; set; } = "";
    public string MountPoint { get; set; } = "";
    public string FileSystem { get; set; } = "";
    public string Label { get; set; } = "";
    public long SizeBytes { get; set; }
    public long FreeBytes { get; set; }
    public bool IsEncrypted { get; set; }
}

public class GpuInfo
{
    public string Name { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public long VramBytes { get; set; }
    public string DriverVersion { get; set; } = "";
    public string DriverDate { get; set; } = "";
}

public class BatteryInfo
{
    public int DesignCapacityMwh { get; set; }
    public int FullChargeCapacityMwh { get; set; }
    public int CurrentChargeMwh { get; set; }
    public int CycleCount { get; set; }
    public string ChargingState { get; set; } = "";      // Charging, Discharging, FullyCharged
    public double HealthPercent { get; set; }             // FullCharge / DesignCapacity * 100
    public string Chemistry { get; set; } = "";           // LiIon, LiPo, etc.
}

public class MonitorInfo
{
    public string Name { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public string Resolution { get; set; } = "";
    public int SizeInches { get; set; }
    public string ConnectionType { get; set; } = "";      // HDMI, DP, USB-C, Internal
}

// ─── Software & Updates ──────────────────────────────────────────────────────

public class SoftwareEntry
{
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string Publisher { get; set; } = "";
    public DateTime? InstalledDate { get; set; }
    public DateTime? LastUpdated { get; set; }
    public string InstallLocation { get; set; } = "";
    public string Architecture { get; set; } = "";
    public string InstallSource { get; set; } = "";       // MSI, Store, apt, rpm, brew
    public string Description { get; set; } = "";
}

public class WindowsUpdate
{
    public string HotFixId { get; set; } = "";            // KB number
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public DateTime? InstalledDate { get; set; }
    public string InstalledBy { get; set; } = "";
}

// ─── Services ────────────────────────────────────────────────────────────────

public class ServiceEntry
{
    public string Name { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Status { get; set; } = "";
    public string StartType { get; set; } = "";
    public string Account { get; set; } = "";
    public string BinaryPath { get; set; } = "";
    public int Pid { get; set; }
    public string Description { get; set; } = "";
}

// ─── Processes ───────────────────────────────────────────────────────────────

public class ProcessEntry
{
    public int Pid { get; set; }
    public string Name { get; set; } = "";
    public double CpuPercent { get; set; }
    public long MemoryBytes { get; set; }
}

// ─── Network ─────────────────────────────────────────────────────────────────

public class NetworkInterface
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string MacAddress { get; set; } = "";
    public List<string> IpAddresses { get; set; } = [];
    public List<string> SubnetMasks { get; set; } = [];
    public List<string> DefaultGateways { get; set; } = [];
    public List<string> DnsServers { get; set; } = [];
    public long SpeedMbps { get; set; }
    public string AdapterType { get; set; } = "";
    public string Status { get; set; } = "";
    public bool DhcpEnabled { get; set; }
    public string DhcpServer { get; set; } = "";
    public string WirelessSsid { get; set; } = "";
    public string NetworkProfile { get; set; } = "";      // Domain, Private, Public
}

// ─── Security Posture ────────────────────────────────────────────────────────

public class SecurityPosture
{
    // Antivirus / EDR
    public string AntivirusProduct { get; set; } = "";
    public string AntivirusVersion { get; set; } = "";
    public string SignatureVersion { get; set; } = "";
    public DateTime? SignatureDate { get; set; }
    public bool RealTimeProtectionEnabled { get; set; }

    // Firewall
    public bool FirewallEnabled { get; set; }
    public string FirewallProfile { get; set; } = "";

    // Encryption
    public bool DiskEncryptionEnabled { get; set; }
    public string EncryptionProduct { get; set; } = "";    // BitLocker, FileVault, LUKS

    // Boot security
    public bool SecureBootEnabled { get; set; }
    public bool TpmReady { get; set; }

    // Patching
    public DateTime? LastSecurityUpdate { get; set; }
    public bool RebootRequired { get; set; }
    public int PendingUpdateCount { get; set; }

    // Local admin accounts
    public List<string> LocalAdminAccounts { get; set; } = [];
}

// ─── Directory & MDM Status ──────────────────────────────────────────────────

public class DirectoryStatus
{
    public bool AdJoined { get; set; }
    public string AdDomainName { get; set; } = "";
    public bool AzureAdJoined { get; set; }
    public string AzureAdDeviceId { get; set; } = "";
    public bool MdmEnrolled { get; set; }
    public string MdmProvider { get; set; } = "";
    public string ComplianceState { get; set; } = "";
    public DateTime? LastSyncTime { get; set; }
}

// ─── BitLocker ───────────────────────────────────────────────────────────────

public class BitLockerVolume
{
    public string DriveLetter { get; set; } = "";
    public string ProtectionStatus { get; set; } = "";
    public string EncryptionMethod { get; set; } = "";
    public string LockStatus { get; set; } = "";
    public double EncryptionPercentage { get; set; }
    public string RecoveryKeyId { get; set; } = "";
    public string RecoveryKey { get; set; } = "";
}

// ─── Users ───────────────────────────────────────────────────────────────────

public class LocalUser
{
    public string Username { get; set; } = "";
    public bool IsAdmin { get; set; }
    public DateTime? LastLogon { get; set; }
}

// ─── Uptime ──────────────────────────────────────────────────────────────────

public class UptimeInfo
{
    public DateTime LastBootTime { get; set; }
    public TimeSpan Uptime { get; set; }
    public string UptimeFormatted { get; set; } = "";
}

// ─── Performance Snapshot ────────────────────────────────────────────────────

public class PerformanceSnapshot
{
    public double CpuUtilizationPercent { get; set; }
    public double MemoryUtilizationPercent { get; set; }
    public long MemoryUsedBytes { get; set; }
    public long MemoryAvailableBytes { get; set; }
    public List<DiskUsage> DiskUsages { get; set; } = [];
}

public class DiskUsage
{
    public string MountPoint { get; set; } = "";
    public double UsagePercent { get; set; }
    public long UsedBytes { get; set; }
    public long FreeBytes { get; set; }
}

// ─── Virtualization ──────────────────────────────────────────────────────────

public class VirtualizationInfo
{
    public bool IsVirtual { get; set; }
    public string HypervisorType { get; set; } = "";      // VMware, Hyper-V, KVM, Xen, VirtualBox
    public string VmName { get; set; } = "";
    public string HostName { get; set; } = "";
    public string CloudProvider { get; set; } = "";        // AWS, Azure, GCP
    public string InstanceId { get; set; } = "";
    public string InstanceType { get; set; } = "";
    public string Region { get; set; } = "";
    public int AllocatedVcpus { get; set; }
    public long AllocatedRamBytes { get; set; }
}

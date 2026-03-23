namespace InvAgent.Models;

public class InventoryPayload
{
    public string Hostname { get; set; } = "";
    public string Platform { get; set; } = "";  // WINDOWS, LINUX, MACOS
    public OsInfo Os { get; set; } = new();
    public HardwareInfo Hardware { get; set; } = new();
    public List<SoftwareEntry> Software { get; set; } = [];
    public List<ServiceEntry> Services { get; set; } = [];
    public List<ProcessEntry> Processes { get; set; } = [];
    public List<NetworkInterface> Network { get; set; } = [];
    public List<LocalUser> LocalUsers { get; set; } = [];
    public DateTime CollectedAt { get; set; } = DateTime.UtcNow;
}

public class OsInfo
{
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string Architecture { get; set; } = "";
    public string BuildNumber { get; set; } = "";
}

public class HardwareInfo
{
    public string Manufacturer { get; set; } = "";
    public string Model { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public List<CpuInfo> Cpus { get; set; } = [];
    public long TotalMemoryBytes { get; set; }
    public List<DiskInfo> Disks { get; set; } = [];
}

public class CpuInfo
{
    public string Name { get; set; } = "";
    public int Cores { get; set; }
    public int Threads { get; set; }
    public double SpeedMhz { get; set; }
}

public class DiskInfo
{
    public string DeviceName { get; set; } = "";
    public long SizeBytes { get; set; }
    public string Type { get; set; } = "";
}

public class SoftwareEntry
{
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string Publisher { get; set; } = "";
    public DateTime? InstalledDate { get; set; }
}

public class ServiceEntry
{
    public string Name { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Status { get; set; } = "";
    public string StartType { get; set; } = "";
}

public class ProcessEntry
{
    public int Pid { get; set; }
    public string Name { get; set; } = "";
    public double CpuPercent { get; set; }
    public long MemoryBytes { get; set; }
}

public class NetworkInterface
{
    public string Name { get; set; } = "";
    public string MacAddress { get; set; } = "";
    public List<string> IpAddresses { get; set; } = [];
    public long SpeedMbps { get; set; }
}

public class LocalUser
{
    public string Username { get; set; } = "";
    public bool IsAdmin { get; set; }
    public DateTime? LastLogon { get; set; }
}

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
        // Deep-copy to avoid mutating the original
        var filtered = ShallowCopy(payload);

        // Remove local users entirely
        filtered.LocalUsers = [];

        // Remove serial number
        filtered.Hardware = new HardwareInfo
        {
            Manufacturer = payload.Hardware.Manufacturer,
            Model = payload.Hardware.Model,
            SerialNumber = "",  // Removed
            Cpus = payload.Hardware.Cpus,
            TotalMemoryBytes = payload.Hardware.TotalMemoryBytes,
            Disks = payload.Hardware.Disks
        };

        // Remove software publishers
        filtered.Software = payload.Software.Select(s => new SoftwareEntry
        {
            Name = s.Name,
            Version = s.Version,
            Publisher = "",  // Removed
            InstalledDate = s.InstalledDate
        }).ToList();

        // Remove process names (keep PIDs and resource usage only)
        filtered.Processes = payload.Processes.Select(p => new ProcessEntry
        {
            Pid = p.Pid,
            Name = "",  // Removed
            CpuPercent = p.CpuPercent,
            MemoryBytes = p.MemoryBytes
        }).ToList();

        return filtered;
    }

    private static InventoryPayload ApplyAnonymized(InventoryPayload payload)
    {
        // Start with restricted filtering
        var filtered = ApplyRestricted(payload);

        // Hash hostname
        filtered.Hostname = HashValue(payload.Hostname);

        // Hash MAC addresses and IP addresses in network interfaces
        filtered.Network = payload.Network.Select(n => new NetworkInterface
        {
            Name = n.Name,
            MacAddress = string.IsNullOrEmpty(n.MacAddress) ? "" : HashValue(n.MacAddress),
            IpAddresses = n.IpAddresses.Select(ip => HashValue(ip)).ToList(),
            SpeedMbps = n.SpeedMbps
        }).ToList();

        return filtered;
    }

    /// <summary>
    /// SHA-256 hash of the value, returning the first 12 hex characters.
    /// </summary>
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
            Platform = original.Platform,
            Os = original.Os,
            Hardware = original.Hardware,
            Software = new List<SoftwareEntry>(original.Software),
            Services = new List<ServiceEntry>(original.Services),
            Processes = new List<ProcessEntry>(original.Processes),
            Network = new List<NetworkInterface>(original.Network),
            LocalUsers = new List<LocalUser>(original.LocalUsers),
            CollectedAt = original.CollectedAt
        };
    }
}

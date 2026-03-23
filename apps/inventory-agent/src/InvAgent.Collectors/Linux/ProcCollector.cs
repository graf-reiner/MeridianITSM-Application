namespace InvAgent.Collectors.Linux;

using InvAgent.Models;

/// <summary>
/// Linux inventory collector using /proc filesystem and standard Linux utilities.
/// </summary>
public class ProcCollector : ICollector
{
    public async Task<InventoryPayload> CollectAsync(CancellationToken ct = default)
    {
        var payload = new InventoryPayload
        {
            Hostname = Environment.MachineName,
            Platform = "LINUX",
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
            // Parse /etc/os-release
            if (File.Exists("/etc/os-release"))
            {
                var lines = File.ReadAllLines("/etc/os-release");
                foreach (var line in lines)
                {
                    if (line.StartsWith("NAME="))
                        info.Name = line[5..].Trim('"');
                    else if (line.StartsWith("VERSION_ID="))
                        info.Version = line[11..].Trim('"');
                }
            }

            // Architecture via uname
            var arch = RunCommand("uname", "-m");
            info.Architecture = arch.Trim();

            // Kernel version
            var kernel = RunCommand("uname", "-r");
            info.BuildNumber = kernel.Trim();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] OS info collection failed: {ex.Message}");
        }
        return info;
    }

    private static HardwareInfo CollectHardwareInfo()
    {
        var hardware = new HardwareInfo();
        try
        {
            // DMI info from sysfs
            hardware.Manufacturer = ReadSysFile("/sys/class/dmi/id/sys_vendor");
            hardware.Model = ReadSysFile("/sys/class/dmi/id/product_name");
            hardware.SerialNumber = ReadSysFile("/sys/class/dmi/id/product_serial");

            // CPU info from /proc/cpuinfo
            if (File.Exists("/proc/cpuinfo"))
            {
                var cpuInfo = File.ReadAllText("/proc/cpuinfo");
                var blocks = cpuInfo.Split("\n\n", StringSplitOptions.RemoveEmptyEntries);
                var processedCpus = new HashSet<string>();

                foreach (var block in blocks)
                {
                    var lines = block.Split('\n');
                    string cpuName = "";
                    int cores = 0;

                    foreach (var line in lines)
                    {
                        if (line.StartsWith("model name"))
                            cpuName = line.Split(':')[1].Trim();
                        else if (line.StartsWith("cpu cores"))
                            int.TryParse(line.Split(':')[1].Trim(), out cores);
                    }

                    if (!string.IsNullOrEmpty(cpuName) && processedCpus.Add(cpuName))
                    {
                        hardware.Cpus.Add(new CpuInfo
                        {
                            Name = cpuName,
                            Cores = cores
                        });
                    }
                }
            }

            // Memory from /proc/meminfo
            if (File.Exists("/proc/meminfo"))
            {
                var memLines = File.ReadAllLines("/proc/meminfo");
                foreach (var line in memLines)
                {
                    if (line.StartsWith("MemTotal:"))
                    {
                        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2 && long.TryParse(parts[1], out long kb))
                            hardware.TotalMemoryBytes = kb * 1024;
                        break;
                    }
                }
            }

            // Disks from /proc/partitions
            if (File.Exists("/proc/partitions"))
            {
                var partLines = File.ReadAllLines("/proc/partitions");
                foreach (var line in partLines.Skip(2)) // Skip header
                {
                    var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 4)
                    {
                        var devName = parts[3];
                        // Only include whole disks (no partition numbers at end)
                        if (!string.IsNullOrEmpty(devName) && !char.IsDigit(devName[^1]))
                        {
                            if (long.TryParse(parts[2], out long blocks))
                            {
                                hardware.Disks.Add(new DiskInfo
                                {
                                    DeviceName = $"/dev/{devName}",
                                    SizeBytes = blocks * 1024
                                });
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Hardware info collection failed: {ex.Message}");
        }
        return hardware;
    }

    private static List<SoftwareEntry> CollectSoftware()
    {
        var list = new List<SoftwareEntry>();
        try
        {
            // Try dpkg (Debian/Ubuntu)
            var dpkgOutput = RunCommand("dpkg-query", "-W -f '${Package}\\t${Version}\\t${Maintainer}\\n'");
            if (!string.IsNullOrWhiteSpace(dpkgOutput))
            {
                foreach (var line in dpkgOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    var parts = line.Split('\t');
                    if (parts.Length >= 2)
                    {
                        list.Add(new SoftwareEntry
                        {
                            Name = parts[0].Trim('\''),
                            Version = parts.Length > 1 ? parts[1] : "",
                            Publisher = parts.Length > 2 ? parts[2] : ""
                        });
                    }
                }
                return list;
            }

            // Try rpm (RHEL/CentOS/Fedora)
            var rpmOutput = RunCommand("rpm", "-qa --qf '%{NAME}\\t%{VERSION}\\t%{VENDOR}\\n'");
            if (!string.IsNullOrWhiteSpace(rpmOutput))
            {
                foreach (var line in rpmOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    var parts = line.Split('\t');
                    if (parts.Length >= 1)
                    {
                        list.Add(new SoftwareEntry
                        {
                            Name = parts[0],
                            Version = parts.Length > 1 ? parts[1] : "",
                            Publisher = parts.Length > 2 ? parts[2] : ""
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Software collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<ServiceEntry> CollectServices()
    {
        var list = new List<ServiceEntry>();
        try
        {
            var output = RunCommand("systemctl", "list-units --type=service --all --no-legend");
            foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 4)
                {
                    var name = parts[0].TrimEnd(".service".ToCharArray());
                    list.Add(new ServiceEntry
                    {
                        Name = name,
                        DisplayName = name,
                        Status = parts[3],
                        StartType = parts[1]
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Service collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<ProcessEntry> CollectProcesses()
    {
        var list = new List<ProcessEntry>();
        try
        {
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
                    // Process may have exited — skip
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Process collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<NetworkInterface> CollectNetwork()
    {
        var list = new List<NetworkInterface>();
        try
        {
            var netDir = "/sys/class/net";
            if (!Directory.Exists(netDir))
                return list;

            foreach (var iface in Directory.GetDirectories(netDir))
            {
                var name = Path.GetFileName(iface);
                var macPath = $"{iface}/address";
                var mac = File.Exists(macPath) ? File.ReadAllText(macPath).Trim() : "";

                var ips = new List<string>();
                try
                {
                    // Use ip addr to get IP addresses for this interface
                    var ipOutput = RunCommand("ip", $"addr show {name}");
                    foreach (var line in ipOutput.Split('\n'))
                    {
                        var trimmed = line.Trim();
                        if (trimmed.StartsWith("inet ") || trimmed.StartsWith("inet6 "))
                        {
                            var parts = trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                            if (parts.Length >= 2)
                                ips.Add(parts[1].Split('/')[0]);
                        }
                    }
                }
                catch { /* ip command unavailable */ }

                list.Add(new NetworkInterface
                {
                    Name = name,
                    MacAddress = mac,
                    IpAddresses = ips
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Network collection failed: {ex.Message}");
        }
        return list;
    }

    private static List<LocalUser> CollectLocalUsers()
    {
        var list = new List<LocalUser>();
        try
        {
            if (!File.Exists("/etc/passwd"))
                return list;

            // Determine sudo/wheel group members
            var adminUsers = new HashSet<string>(StringComparer.Ordinal);
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

            foreach (var line in File.ReadAllLines("/etc/passwd"))
            {
                var parts = line.Split(':');
                if (parts.Length < 7) continue;

                var username = parts[0];
                var uid = int.TryParse(parts[2], out int u) ? u : -1;

                // Skip system accounts (UID < 1000), except root (UID 0)
                if (uid != 0 && uid < 1000) continue;

                list.Add(new LocalUser
                {
                    Username = username,
                    IsAdmin = uid == 0 || adminUsers.Contains(username)
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ProcCollector] Local users collection failed: {ex.Message}");
        }
        return list;
    }

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
            process.WaitForExit(10000);
            return output;
        }
        catch
        {
            return "";
        }
    }
}

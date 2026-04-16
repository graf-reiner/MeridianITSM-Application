---
phase: 05-agent-mobile-and-integrations
plan: "04"
subsystem: inventory-agent
tags: [dotnet, collectors, wmi, linux-proc, macos-system-profiler, privacy-filter, unit-tests]
dependency_graph:
  requires: []
  provides: [inventory-agent-solution, ICollector-interface, InventoryPayload-model, AgentConfig, PrivacyFilter]
  affects: [05-05-worker-http-queue]
tech_stack:
  added:
    - .NET 9 (dotnet new sln + 10 projects)
    - System.CommandLine 2.0.0-beta4.22272.1
    - Microsoft.Extensions.Hosting 9.0.0
    - Microsoft.Extensions.Configuration.Json/EnvironmentVariables/CommandLine 9.0.0
    - System.Management 9.0.0 (Windows only, conditional)
    - xUnit 2.9.3
    - FluentAssertions 6.12.2
    - Microsoft.NET.Test.Sdk 17.12.0
  patterns:
    - Platform detection via RuntimeInformation.IsOSPlatform at DI registration time
    - Conditional compilation (#if WINDOWS) for WMI code in cross-platform project
    - Per-section try/catch in collectors — individual failures don't abort collection
    - SHA-256 12-char hex prefix for anonymized hashing (hostname, MAC, IP)
    - Three-tier privacy model: full -> restricted -> anonymized (cumulative)
key_files:
  created:
    - apps/inventory-agent/.gitignore
    - apps/inventory-agent/InvAgent.sln
    - apps/inventory-agent/src/InvAgent.Models/InventoryPayload.cs
    - apps/inventory-agent/src/InvAgent.Models/HeartbeatPayload.cs
    - apps/inventory-agent/src/InvAgent.Models/EnrollmentResult.cs
    - apps/inventory-agent/src/InvAgent.Models/InvAgent.Models.csproj
    - apps/inventory-agent/src/InvAgent.Config/AgentConfig.cs
    - apps/inventory-agent/src/InvAgent.Config/InvAgent.Config.csproj
    - apps/inventory-agent/src/InvAgent.CLI/Program.cs
    - apps/inventory-agent/src/InvAgent.CLI/InvAgent.CLI.csproj
    - apps/inventory-agent/src/InvAgent.Collectors/ICollector.cs
    - apps/inventory-agent/src/InvAgent.Collectors/InvAgent.Collectors.csproj
    - apps/inventory-agent/src/InvAgent.Collectors/Windows/WmiCollector.cs
    - apps/inventory-agent/src/InvAgent.Collectors/Linux/ProcCollector.cs
    - apps/inventory-agent/src/InvAgent.Collectors/MacOs/MacOsCollector.cs
    - apps/inventory-agent/src/InvAgent.Privacy/PrivacyFilter.cs
    - apps/inventory-agent/src/InvAgent.Privacy/InvAgent.Privacy.csproj
    - apps/inventory-agent/src/InvAgent.Tests/CollectorTests.cs
    - apps/inventory-agent/src/InvAgent.Tests/PrivacyFilterTests.cs
    - apps/inventory-agent/src/InvAgent.Tests/InvAgent.Tests.csproj
    - apps/inventory-agent/src/InvAgent.Http/AgentHttpClient.cs (stub)
    - apps/inventory-agent/src/InvAgent.Queue/LocalQueue.cs (stub)
    - apps/inventory-agent/src/InvAgent.Api/LocalWebUi.cs (stub)
    - apps/inventory-agent/src/InvAgent.Worker/AgentWorker.cs (stub)
  modified: []
decisions:
  - "[05-04]: Microsoft.Extensions.Configuration.Json/EnvironmentVariables/CommandLine added explicitly to InvAgent.CLI.csproj — Microsoft.Extensions.Hosting does not pull these extension methods into scope by default; explicit package refs required for AddJsonFile/AddEnvironmentVariables/AddInMemoryCollection"
  - "[05-04]: WmiCollector uses #if WINDOWS conditional compilation guards around System.Management calls — allows cross-platform dotnet build without runtime guard failures while keeping WMI code colocated with the collector class"
  - "[05-04]: ProcCollector skips system accounts (UID < 1000) but includes root (UID 0) in LocalUsers output — standard Linux convention for interactive user accounts"
  - "[05-04]: PrivacyFilter.Apply uses SHA256.HashData (static, allocation-free) returning first 12 hex chars — sufficient collision resistance for pseudonymization without storing full 64-char hashes"
metrics:
  duration: "~8 minutes (453 seconds)"
  completed: "2026-03-23"
  tasks: 2
  files: 24
---

# Phase 5 Plan 4: Inventory Agent Solution Summary

.NET 9 inventory agent solution from scratch: 10-project solution with WMI/proc/system_profiler collectors, shared DTOs, layered config, privacy filter with 3 tiers, and 16 passing unit tests.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | .NET solution structure + models + config + CLI entry point | b570d29 | InvAgent.sln, 10 .csproj files, InventoryPayload.cs, AgentConfig.cs, Program.cs |
| 2 | Platform collectors + privacy filter + unit tests | d1769b2 | ICollector.cs, WmiCollector.cs, ProcCollector.cs, MacOsCollector.cs, PrivacyFilter.cs, CollectorTests.cs, PrivacyFilterTests.cs |

## What Was Built

### Solution Structure (10 Projects)

- **InvAgent.CLI** — Console entry point with `System.CommandLine` (--enroll, --run-once, --server-url, --config, --agent-key, --privacy-tier), layered config (appsettings.json -> platform config path -> MERIDIAN_ env vars -> in-memory CLI overrides), `RuntimeInformation.IsOSPlatform` for DI registration
- **InvAgent.Models** — `InventoryPayload` with all 7 data categories: OS, hardware (CPUs, disks, serial), software, services, processes, network interfaces, local users; `HeartbeatPayload`; `EnrollmentResult`
- **InvAgent.Config** — `AgentConfig` POCO: ServerUrl, AgentKey, EnrollmentToken, PrivacyTier, HeartbeatIntervalSeconds (300), InventoryIntervalSeconds (14400), LocalWebUiPort (8787), HttpProxy, LogLevel
- **InvAgent.Collectors** — `ICollector` interface + 3 platform implementations
- **InvAgent.Privacy** — `PrivacyFilter.Apply(payload, tier)` static method
- **InvAgent.Worker/Http/Queue/Api** — Stub projects, full implementation in Plan 05-05
- **InvAgent.Tests** — 16 passing unit tests

### Collector Implementations

**WmiCollector (Windows)**
- Win32_OperatingSystem, Win32_ComputerSystem, Win32_BIOS, Win32_Processor, Win32_PhysicalMemory, Win32_DiskDrive, Win32_NetworkAdapterConfiguration (IPEnabled=True), Win32_Product, Win32_Service, Win32_Process, Win32_UserAccount (LocalAccount=True)
- System.Management package conditionally included: `<PackageReference Condition="'$(OS)' == 'Windows_NT'" ...>`
- `#if WINDOWS` guards inside C# code for WMI calls
- All WMI sections wrapped in individual try/catch — partial failure doesn't abort collection

**ProcCollector (Linux)**
- /etc/os-release (NAME, VERSION_ID), uname -m/-r for arch/kernel
- /sys/class/dmi/id/* for Manufacturer/Model/Serial
- /proc/cpuinfo for CPU name/cores (deduped by name)
- /proc/meminfo for MemTotal
- /proc/partitions for disk devices (whole-disk filter: non-numeric last char)
- /sys/class/net/*/address + ip addr for network
- dpkg-query (Debian) or rpm (RHEL) for software
- systemctl list-units for services
- /proc/[pid]/status for processes (name + VmRSS)
- /etc/passwd for users (skips UID < 1000 except root), /etc/group for wheel/sudo admin check

**MacOsCollector (macOS)**
- sw_vers for OS name/version/build
- system_profiler SPHardwareDataType -json for model/serial/CPU/memory
- system_profiler SPStorageDataType -json for disks
- system_profiler SPNetworkDataType -json for network
- system_profiler SPApplicationsDataType -json for software
- launchctl list for services
- ps aux for processes
- dscl . -list /Users + dscacheutil -q group -a name admin for users

### Privacy Filter

| Tier | LocalUsers | SerialNumber | Software Publisher | Process Names | Hostname | MACs/IPs |
|------|-----------|-------------|-------------------|--------------|---------|---------|
| full | kept | kept | kept | kept | kept | kept |
| restricted | removed | removed | removed | removed | kept | kept |
| anonymized | removed | removed | removed | removed | SHA-256[12] | SHA-256[12] |

### Test Coverage (16 tests)

**CollectorTests (4):** Current-platform collector returns valid payload, hostname non-empty, OS name populated, all collection lists non-null

**PrivacyFilterTests (12):** full tier returns same reference, restricted removes localUsers/serialNumber/publishers/processNames while preserving PIDs, anonymized hashes hostname/MACs/IPs and inherits restricted, unknown tier is no-op, hashing is deterministic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing configuration extension method packages for InvAgent.CLI**
- **Found during:** Task 1 build
- **Issue:** `builder.Configuration.AddJsonFile()`, `AddEnvironmentVariables()`, and `AddInMemoryCollection()` extension methods not found — `Microsoft.Extensions.Hosting` does not transitively expose these extension methods in the compilation context
- **Fix:** Added three explicit NuGet package references to InvAgent.CLI.csproj: `Microsoft.Extensions.Configuration.Json 9.0.0`, `Microsoft.Extensions.Configuration.EnvironmentVariables 9.0.0`, `Microsoft.Extensions.Configuration.CommandLine 9.0.0`; added `using Microsoft.Extensions.Configuration;` to Program.cs
- **Files modified:** `apps/inventory-agent/src/InvAgent.CLI/InvAgent.CLI.csproj`, `apps/inventory-agent/src/InvAgent.CLI/Program.cs`
- **Commit:** b570d29 (resolved before commit)

## Self-Check: PASSED

Files verified:
- apps/inventory-agent/InvAgent.sln: FOUND
- apps/inventory-agent/src/InvAgent.Collectors/ICollector.cs: FOUND
- apps/inventory-agent/src/InvAgent.Models/InventoryPayload.cs: FOUND
- apps/inventory-agent/src/InvAgent.Config/AgentConfig.cs: FOUND
- apps/inventory-agent/src/InvAgent.Privacy/PrivacyFilter.cs: FOUND
- apps/inventory-agent/src/InvAgent.Tests/PrivacyFilterTests.cs: FOUND

Commits verified:
- b570d29: feat(05-04): .NET 9 inventory agent solution structure + models + config + CLI
- d1769b2: feat(05-04): platform collectors + privacy filter + 16 unit tests

Build: dotnet build — 0 errors, 0 warnings
Tests: dotnet test — 16 passed, 0 failed

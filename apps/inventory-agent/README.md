# MeridianITSM Inventory Agent

A cross-platform endpoint inventory collector for MeridianITSM. The agent runs as a background daemon, collecting hardware and software inventory from managed endpoints and submitting it to a MeridianITSM server.

Built with .NET 9, distributed as a self-contained binary — no runtime installation required.

**Supported platforms:** Windows (x64), Linux (x64), macOS (x64/arm64)

---

## Quick Start

```bash
# 1. Download the binary for your platform (see Releases)

# 2. Enroll the agent with your MeridianITSM server
./InvAgent --enroll <token> --server-url https://your-meridian.com

# 3. The agent enrolls, then begins collecting and submitting automatically
```

After enrollment the agent key is persisted in the platform config file. Subsequent runs require no additional flags.

---

## Installation

### Windows

1. Download `InvAgent-win-x64.exe` from Releases.
2. Rename to `InvAgent.exe` and place in a permanent directory (e.g. `C:\Program Files\Meridian\Agent`).
3. Open an elevated command prompt and enroll:

   ```cmd
   InvAgent.exe --enroll <token> --server-url https://your-meridian.com
   ```

4. Install as a Windows Service:

   ```cmd
   InvAgent.exe --install
   ```

   Service name: `MeridianAgent`. Start/stop via `services.msc` or `sc`.

5. For a one-off collection without installing a service:

   ```cmd
   InvAgent.exe --run-once
   ```

**Config location:** `%ProgramData%\Meridian\config.json`  
**Log location:** `%ProgramData%\Meridian\logs\agent.log`

---

### Linux

1. Download `InvAgent-linux-x64` from Releases.
2. Make executable and move to the installation directory:

   ```bash
   chmod +x InvAgent-linux-x64
   sudo mv InvAgent-linux-x64 /opt/meridian-agent/InvAgent
   ```

3. Enroll:

   ```bash
   sudo /opt/meridian-agent/InvAgent --enroll <token> --server-url https://your-meridian.com
   ```

4. Create a systemd service:

   ```bash
   sudo nano /etc/systemd/system/meridian-agent.service
   ```

   ```ini
   [Unit]
   Description=Meridian ITSM Inventory Agent
   After=network.target

   [Service]
   Type=simple
   ExecStart=/opt/meridian-agent/InvAgent
   WorkingDirectory=/opt/meridian-agent
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

5. Enable and start:

   ```bash
   sudo systemctl enable meridian-agent
   sudo systemctl start meridian-agent
   ```

**Config location:** `/etc/meridian-agent/config.json`  
**Log location:** `/var/log/meridian-agent/agent.log`

---

### macOS

1. Download `InvAgent-osx-x64` (Intel) or `InvAgent-osx-arm64` (Apple Silicon) from Releases.
2. Make executable:

   ```bash
   chmod +x InvAgent-osx-x64
   ```

3. Enroll:

   ```bash
   ./InvAgent-osx-x64 --enroll <token> --server-url https://your-meridian.com
   ```

4. For continuous background operation, create a LaunchDaemon plist at `/Library/LaunchDaemons/com.meridian.agent.plist`:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
     "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>Label</key>
     <string>com.meridian.agent</string>
     <key>ProgramArguments</key>
     <array>
       <string>/usr/local/bin/InvAgent</string>
     </array>
     <key>RunAtLoad</key>
     <true/>
     <key>KeepAlive</key>
     <true/>
   </dict>
   </plist>
   ```

   Load it: `sudo launchctl load /Library/LaunchDaemons/com.meridian.agent.plist`

**Config location:** `~/Library/Application Support/Meridian/config.json`

---

## Configuration

The agent configuration is stored as JSON. All fields are optional — defaults apply when omitted.

| Field | Default | Description |
|---|---|---|
| `ServerUrl` | `https://localhost:3000` | Base URL of the MeridianITSM server |
| `AgentKey` | *(set by enrollment)* | API key assigned after successful enrollment |
| `EnrollmentToken` | — | One-time token used to enroll a new agent |
| `PrivacyTier` | `full` | Controls what data is collected (see Privacy Tiers) |
| `HeartbeatIntervalSeconds` | `300` | How often the agent sends a heartbeat (5 minutes) |
| `InventoryIntervalSeconds` | `14400` | How often a full inventory is collected (4 hours) |
| `LocalWebUiPort` | `8787` | Port for the local diagnostic web UI |
| `HttpProxy` | — | HTTP proxy URL (e.g. `http://proxy.corp:3128`) |
| `LocalQueueMaxSizeMb` | `100` | Maximum size of the offline queue before oldest entries are dropped |
| `LogLevel` | `Information` | Log verbosity: `Trace`, `Debug`, `Information`, `Warning`, `Error` |

### Example config.json

```json
{
  "AgentConfig": {
    "ServerUrl": "https://itsm.example.com",
    "AgentKey": "ak_xxxxxxxxxxxx",
    "PrivacyTier": "full",
    "HeartbeatIntervalSeconds": 300,
    "InventoryIntervalSeconds": 14400,
    "LocalWebUiPort": 8787,
    "LocalQueueMaxSizeMb": 100,
    "LogLevel": "Information"
  }
}
```

### Configuration Priority

Settings are merged from multiple sources. Higher entries win:

| Priority | Source |
|---|---|
| 1 (highest) | CLI flags |
| 2 | Environment variables (prefix: `MERIDIAN_`) |
| 3 | Platform config file (`config.json`) |
| 4 (lowest) | `appsettings.json` (binary directory) |

**Environment variable examples:**

```bash
MERIDIAN_AgentConfig__ServerUrl=https://itsm.example.com
MERIDIAN_AgentConfig__PrivacyTier=restricted
MERIDIAN_AgentConfig__LogLevel=Debug
```

### Custom Config File Path

```bash
./InvAgent --config /path/to/my-config.json
```

---

## CLI Commands

| Flag | Description |
|---|---|
| `--enroll <token>` | Enroll this agent with the server using the provided one-time token |
| `--run-once` | Collect inventory once and submit, then exit |
| `--install` | Install the agent as a system service (Windows only) |
| `--server-url <url>` | Override the server URL for this invocation |
| `--agent-key <key>` | Override the agent API key for this invocation |
| `--privacy-tier <tier>` | Override the privacy tier (`full`, `restricted`, `anonymized`) |
| `--config <path>` | Use a custom config file path instead of the platform default |

### Examples

```bash
# Enroll and set server URL in one command
./InvAgent --enroll eyJ... --server-url https://itsm.example.com

# One-time collection with a specific privacy tier
./InvAgent --run-once --privacy-tier restricted

# Run with a debug log level override
MERIDIAN_AgentConfig__LogLevel=Debug ./InvAgent --run-once
```

---

## What's Collected

| Category | Examples |
|---|---|
| Operating System | Name, version, build number, architecture, install date, timezone |
| Hardware — CPU | Model, core count, logical processors, clock speed |
| Hardware — Memory | Total RAM, available RAM |
| Hardware — Disks | Drive letters/mount points, total size, free space, filesystem |
| Software | Installed applications with name, version, publisher, install date |
| Services | Service name, display name, start type, current state |
| Processes | Running process names and PIDs |
| Network Interfaces | Interface name, MAC address, IPv4/IPv6 addresses |
| Local Users | Username, display name, enabled state, last login |

Platform-specific collection backends:

| Platform | Backend |
|---|---|
| Windows | WMI (Windows Management Instrumentation) |
| Linux | `/proc` filesystem, `dpkg`/`rpm` package databases |
| macOS | IOKit, `system_profiler` |

---

## Privacy Tiers

The privacy tier controls which data categories are included in inventory submissions.

| Data Category | `full` | `restricted` | `anonymized` |
|---|---|---|---|
| Hardware specs (CPU, RAM, disk sizes) | Yes | Yes | Yes |
| OS name and version | Yes | Yes | Yes |
| Installed software names and versions | Yes | Yes | Hashed |
| Running processes | Yes | Excluded | Excluded |
| Local user accounts | Yes | Excluded | Excluded |
| Network interface details (MAC, IPs) | Yes | Yes (MACs hashed) | Hashed |
| Service names and states | Yes | Yes | Excluded |

**`full`** — All data is collected and submitted verbatim. Suitable for fully managed corporate endpoints.

**`restricted`** — Sensitive personal data (users, processes) is excluded. Network MAC addresses are hashed. Suitable for shared or partially managed devices.

**`anonymized`** — Only hardware and OS data is transmitted. Software names and network addresses are hashed. Suitable for privacy-regulated environments or BYOD policies.

Set the tier in `config.json`, via environment variable, or at runtime:

```bash
./InvAgent --privacy-tier restricted
```

---

## Local Diagnostic UI

When running as a daemon, the agent exposes a read-only diagnostic interface accessible from the local machine only.

**URL:** `http://127.0.0.1:8787`

The UI is served from the loopback interface and is not accessible from the network.

### Available Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Static dashboard UI (HTML) |
| `/api/status` | GET | Enrollment state, connectivity, server latency, platform, agent version |
| `/api/hardware` | GET | Live hardware snapshot from the current collector |
| `/api/config` | GET | Active configuration (agent key is not exposed) |
| `/api/queue` | GET | Offline queue depth, size in bytes, and queued item list |
| `/api/logs` | GET | Last 100 lines from the platform log file |
| `/api/collect` | POST | Trigger a manual inventory collection immediately |
| `/api/network-test` | POST | Test connectivity to the configured server, return latency |

Change the port via `LocalWebUiPort` in config if 8787 conflicts with another service.

---

## Offline Mode

The agent buffers inventory payloads locally when the server is unreachable.

- Data is stored in a SQLite queue on disk, surviving agent restarts.
- The queue is automatically flushed when connectivity is restored.
- Queue depth and size are visible in the local UI at `/api/queue`.
- The maximum queue size is controlled by `LocalQueueMaxSizeMb` (default 100 MB). When the limit is reached, the oldest entries are dropped to make room for new ones.

The HTTP client uses an exponential backoff retry policy (up to 10 retries, starting at 30 seconds) and a circuit breaker to avoid hammering an unreachable server.

---

## Troubleshooting

### Agent won't enroll

- Verify the enrollment token is valid and has not been used already (tokens are single-use).
- Confirm the `--server-url` is reachable from the endpoint: `curl https://your-meridian.com/api/v1/agents/enroll`
- Check that no firewall is blocking outbound HTTPS (port 443).
- If using a proxy, set `HttpProxy` in config or `MERIDIAN_AgentConfig__HttpProxy`.

### No data appearing in MeridianITSM

- Check that the agent is enrolled: open `http://127.0.0.1:8787/api/status` and confirm `enrolled: true`.
- The first full inventory runs at startup and then every `InventoryIntervalSeconds` (default 4 hours). Trigger a manual collection from the UI or with `--run-once`.
- Verify `PrivacyTier` is not set to `anonymized` if you need software/user data.

### High memory or disk usage

- Reduce `LocalQueueMaxSizeMb` if the queue is growing unbounded (server unreachable for a long period).
- Increase `InventoryIntervalSeconds` to reduce collection frequency on endpoints where resource usage matters.

### Connection refused or timeout

- Confirm the MeridianITSM server is running and the URL in config is correct.
- Check whether an HTTP proxy is required in your network and set `HttpProxy` accordingly.
- Review the agent log for circuit breaker or retry messages.

### Checking logs

| Method | Location |
|---|---|
| Local UI | `http://127.0.0.1:8787` — Logs tab |
| Windows log file | `%ProgramData%\Meridian\logs\agent.log` |
| Linux log file | `/var/log/meridian-agent/agent.log` |
| systemd journal | `journalctl -u meridian-agent -f` |

Increase verbosity for diagnostics:

```bash
./InvAgent --run-once
# or set in config:
# "LogLevel": "Debug"
```

---

## Building from Source

Prerequisites: .NET 9 SDK

```bash
cd apps/inventory-agent

# Build (debug)
dotnet build

# Run tests
dotnet test

# Publish self-contained binaries
dotnet publish -c Release -r win-x64   --self-contained -o publish/win-x64
dotnet publish -c Release -r linux-x64 --self-contained -o publish/linux-x64
dotnet publish -c Release -r osx-x64   --self-contained -o publish/osx-x64
dotnet publish -c Release -r osx-arm64 --self-contained -o publish/osx-arm64
```

Output binaries will be in the `publish/` subdirectories. The resulting executables have no external runtime dependency.

### Project Structure

```
src/
  InvAgent.CLI/        — Entry point, CLI parsing, dependency injection, host setup
  InvAgent.Api/        — Local diagnostic web UI (ASP.NET Minimal API on 127.0.0.1:8787)
  InvAgent.Config/     — AgentConfig model
  InvAgent.Collectors/ — Platform-specific collectors (Windows/Linux/macOS)
  InvAgent.Http/       — MeridianApiClient (enrollment, heartbeat, inventory submission)
  InvAgent.Queue/      — LocalQueue (SQLite offline buffer)
  InvAgent.Worker/     — AgentWorker (background service loop)
```

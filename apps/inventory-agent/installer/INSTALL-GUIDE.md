# Meridian ITSM Inventory Agent - Installation Guide

## Overview

The Meridian Inventory Agent is a lightweight service that runs on Windows, Linux, and macOS endpoints. It collects hardware and software inventory, sends it to the Meridian ITSM server, and automatically creates/updates CMDB Configuration Items.

**What it does:**
- Collects hardware specs (CPU, RAM, disks, network interfaces, BIOS, TPM)
- Collects software inventory and security posture (antivirus, firewall, disk encryption)
- Sends a heartbeat every 5 minutes
- Runs a full inventory scan every 4 hours (configurable)
- Queues data locally (SQLite) when the server is unreachable and retries automatically
- Provides a local diagnostic web UI at `http://127.0.0.1:8787`

---

## Prerequisites

### Server-Side

Before installing the agent, you need an **enrollment token** from the Meridian ITSM web app:

1. Log in as an admin to the Meridian ITSM dashboard
2. Go to **Settings > Agents**
3. Click **Create Enrollment Token**
4. Set a name, max enrollments (or -1 for unlimited), and optional expiry date
5. Copy the generated token - you will need it during agent installation

You also need the **server URL** (e.g., `https://meridian.yourcompany.com`).

### Endpoint

- .NET 8+ runtime (included if using self-contained builds)
- Network access to the Meridian ITSM server (HTTPS, port 443 or your configured port)
- Administrator/root privileges for service installation

---

## Building the Agent

From the `apps/inventory-agent/` directory:

### Build all platforms at once

```bash
./build-all.sh
```

This produces self-contained binaries in:
- `publish/win-x64/` (Windows)
- `publish/linux-x64/` (Linux)
- `publish/osx-x64/` (macOS Intel)
- `publish/osx-arm64/` (macOS Apple Silicon)

### Build a single platform

```bash
# Windows
dotnet publish src/InvAgent.CLI/InvAgent.CLI.csproj -c Release -r win-x64 --self-contained -o publish/win-x64

# Linux
dotnet publish src/InvAgent.CLI/InvAgent.CLI.csproj -c Release -r linux-x64 --self-contained -o publish/linux-x64

# macOS (Apple Silicon)
dotnet publish src/InvAgent.CLI/InvAgent.CLI.csproj -c Release -r osx-arm64 --self-contained -o publish/osx-arm64

# macOS (Intel)
dotnet publish src/InvAgent.CLI/InvAgent.CLI.csproj -c Release -r osx-x64 --self-contained -o publish/osx-x64
```

---

## Windows Installation

### Automated (Recommended)

Run PowerShell **as Administrator**:

```powershell
powershell -ExecutionPolicy Bypass -File packaging\windows\install.ps1 `
    -ServerUrl "https://meridian.yourcompany.com" `
    -Token "your-enrollment-token"
```

Optional parameters:
- `-PrivacyTier full|restricted|anonymized` (default: `full`)
- `-InstallDir "C:\Custom\Path"` (default: `C:\Program Files\MeridianAgent`)

The installer will:
1. Copy the agent binaries to `C:\Program Files\MeridianAgent`
2. Write config to `%ProgramData%\Meridian\config.json`
3. Register and start the `MeridianAgent` Windows Service (auto-start)

### Manual

1. Copy the `publish/win-x64/` contents to `C:\Program Files\MeridianAgent`
2. Create `%ProgramData%\Meridian\config.json`:

```json
{
  "AgentConfig": {
    "ServerUrl": "https://meridian.yourcompany.com",
    "EnrollmentToken": "your-enrollment-token",
    "PrivacyTier": "full",
    "HeartbeatIntervalSeconds": 300,
    "InventoryIntervalSeconds": 14400,
    "LocalWebUiPort": 8787,
    "LocalQueueMaxSizeMb": 100,
    "LogLevel": "Information"
  }
}
```

3. Install the service:

```powershell
New-Service -Name "MeridianAgent" `
    -BinaryPathName "C:\Program Files\MeridianAgent\InvAgent.exe" `
    -DisplayName "Meridian ITSM Inventory Agent" `
    -StartupType Automatic

Start-Service -Name MeridianAgent
```

### Verify

```powershell
Get-Service MeridianAgent
# Status should be: Running
```

Check the local diagnostic UI: http://127.0.0.1:8787

### Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File packaging\windows\uninstall.ps1
```

This stops and removes the service and deletes the program files. Config is preserved at `%ProgramData%\Meridian\` -- delete manually if no longer needed.

---

## Linux Installation

### Automated (Recommended)

```bash
sudo ./packaging/linux/install.sh \
    --server-url "https://meridian.yourcompany.com" \
    --token "your-enrollment-token"
```

Optional: `--privacy-tier full|restricted|anonymized`

The installer will:
1. Create a dedicated `meridian-agent` system user (no login shell)
2. Copy binaries to `/opt/meridian-agent/`
3. Write config to `/etc/meridian-agent/config.json`
4. Install and enable a `meridian-agent` systemd service
5. Start the service

### Manual

1. Copy `publish/linux-x64/` contents to `/opt/meridian-agent/`
2. Make the binary executable: `chmod +x /opt/meridian-agent/InvAgent`
3. Create `/etc/meridian-agent/config.json` (same JSON format as Windows above)
4. Create a systemd service file at `/etc/systemd/system/meridian-agent.service`:

```ini
[Unit]
Description=Meridian ITSM Inventory Agent
After=network.target

[Service]
Type=simple
User=meridian-agent
Group=meridian-agent
ExecStart=/opt/meridian-agent/InvAgent
WorkingDirectory=/opt/meridian-agent
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=meridian-agent

[Install]
WantedBy=multi-user.target
```

5. Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable meridian-agent
sudo systemctl start meridian-agent
```

### Verify

```bash
sudo systemctl status meridian-agent
# Should show: active (running)

# View logs
journalctl -u meridian-agent -f
```

### Uninstall

```bash
sudo systemctl stop meridian-agent
sudo systemctl disable meridian-agent
sudo rm /etc/systemd/system/meridian-agent.service
sudo systemctl daemon-reload
sudo rm -rf /opt/meridian-agent
# Config preserved at /etc/meridian-agent/ -- delete manually if desired
```

---

## macOS Installation

### Automated (Recommended)

```bash
sudo ./packaging/macos/install.sh \
    --server-url "https://meridian.yourcompany.com" \
    --token "your-enrollment-token"
```

The installer will:
1. Copy binaries to `/usr/local/meridian-agent/` (auto-detects Intel vs Apple Silicon)
2. Write config to `/etc/meridian-agent/config.json`
3. Install a `com.meridian.agent` launchd daemon (runs at boot, auto-restarts)

### Verify

```bash
sudo launchctl list | grep meridian
# Should show com.meridian.agent with a PID

# View logs
tail -f /var/log/meridian-agent/agent.log
```

### Uninstall

```bash
sudo launchctl unload /Library/LaunchDaemons/com.meridian.agent.plist
sudo rm /Library/LaunchDaemons/com.meridian.agent.plist
sudo rm -rf /usr/local/meridian-agent
# Config preserved at /etc/meridian-agent/ -- delete manually if desired
```

---

## Configuration Reference

The agent reads configuration from multiple sources in this priority order (highest wins):

1. **CLI flags** (`--server-url`, `--agent-key`, `--privacy-tier`, etc.)
2. **Environment variables** (prefixed with `MERIDIAN_`, e.g. `MERIDIAN_AgentConfig__ServerUrl`)
3. **Platform config file** (`%ProgramData%\Meridian\config.json` on Windows, `/etc/meridian-agent/config.json` on Linux/macOS)
4. **Built-in defaults**

### Config Options

| Key | Default | Description |
|-----|---------|-------------|
| `ServerUrl` | `https://localhost:3000` | Meridian ITSM server URL |
| `AgentKey` | *(set after enrollment)* | Agent authentication key (auto-populated) |
| `EnrollmentToken` | *(none)* | One-time token for initial enrollment |
| `PrivacyTier` | `full` | Data collection level: `full`, `restricted`, or `anonymized` |
| `HeartbeatIntervalSeconds` | `300` | Heartbeat frequency (5 minutes) |
| `InventoryIntervalSeconds` | `14400` | Full inventory scan frequency (4 hours) |
| `LocalWebUiPort` | `8787` | Port for local diagnostic web UI |
| `HttpProxy` | *(none)* | HTTP proxy URL (e.g. `http://proxy:8080`) |
| `LocalQueueMaxSizeMb` | `100` | Max size of offline SQLite queue |
| `LogLevel` | `Information` | Log level: `Debug`, `Information`, `Warning`, `Error` |

### Privacy Tiers

| Tier | What is collected |
|------|-------------------|
| `full` | All hardware, software, network, security, and user data |
| `restricted` | Hardware and OS info only. No software inventory, no usernames, no IP addresses |
| `anonymized` | Hardware model and OS type only. Hostnames hashed, all PII stripped |

---

## How It Works

### First Run (Enrollment)

1. Agent starts and reads the enrollment token from config
2. Sends `POST /api/v1/agents/enroll` with hostname, platform, and token
3. Server validates the token, creates (or reuses) an Agent record, returns an `agentKey`
4. Agent saves the `agentKey` to the config file for future authentication
5. Runs an immediate inventory scan and submits results

### Ongoing Operation

The agent runs two concurrent loops:

- **Heartbeat loop** (every 5 minutes): sends a lightweight status ping to `POST /api/v1/agents/heartbeat`
- **Inventory loop** (every 4 hours): runs a full hardware/software scan, submits to `POST /api/v1/agents/inventory`, which triggers CMDB reconciliation on the server

If the server is unreachable, inventory data is queued locally in a SQLite database (up to 100 MB). When connectivity is restored, the queue is flushed automatically.

### CMDB Integration

After each inventory submission, the server's CMDB reconciliation worker:
- Looks up an existing CI by agent ID or hostname
- Creates a new CI if none exists (with extension tables for server hardware)
- Updates changed fields if the CI already exists (respecting manual edits)
- Marks CIs as inactive if no heartbeat is received for 24 hours

---

## CLI Reference

### Run as service (default)

```bash
InvAgent
```

### Run once and exit

```bash
InvAgent --run-once
```

### Enroll and run

```bash
InvAgent --enroll "your-enrollment-token" --server-url "https://meridian.yourcompany.com"
```

### All flags

```
--enroll <token>        Enrollment token for first-time registration
--run-once              Run a single inventory collection and exit
--server-url <url>      Override the server URL
--config <path>         Path to configuration JSON file
--agent-key <key>       Override the agent API key
--privacy-tier <tier>   Privacy tier: full, restricted, or anonymized
```

---

## Troubleshooting

### Agent won't start

- **Windows**: Check Event Viewer > Windows Logs > Application for errors from `MeridianAgent`
- **Linux**: `journalctl -u meridian-agent -n 50 --no-pager`
- **macOS**: `cat /var/log/meridian-agent/agent-error.log`

### Agent enrolled but no CI appears

- Check that the CMDB reconciliation worker is running (`pm2 list` on the server)
- Check worker logs: `pm2 logs worker --lines 50`

### Agent creates duplicate CIs

This was fixed in the April 2026 update. The reconciliation worker now matches by hostname when the agent ID changes (e.g., after re-enrollment). Ensure both the API and worker are running the latest code.

### Network issues

- Verify the agent can reach the server: `curl -I https://meridian.yourcompany.com`
- If behind a proxy, set `HttpProxy` in config
- The agent retries with exponential backoff (up to 10 attempts) and uses a circuit breaker to avoid hammering a down server

### Local diagnostic UI

Browse to `http://127.0.0.1:8787` on the endpoint to see:
- Agent status and enrollment state
- Last inventory collection time
- Offline queue depth
- Manual trigger buttons for immediate collection

# Agent Auto-Update — Design Spec

**Date:** 2026-04-06
**Status:** Draft

## Problem

The Meridian Inventory Agent has no mechanism to update itself after deployment. Admins must manually redistribute new binaries to every endpoint when a new version is released. This doesn't scale.

## Goal

Enable the agent to discover, download, and install updates automatically or on admin command, with configurable update policies per tenant.

## User Flow

### Automatic Update
1. Agent sends heartbeat to server every 5 minutes.
2. Server responds with `latestVersion` and `updateUrl` (based on tenant policy).
3. Agent compares `latestVersion` to its own assembly version.
4. If newer and `updateUrl` is present, agent downloads the update package.
5. Agent verifies the download checksum.
6. Agent runs the MSI/EXE installer silently — the installer stops the service, swaps files, restarts.
7. New agent version heartbeats with the updated version number.

### Admin-Pushed Update
1. Admin uploads a new agent package in Settings > Agents.
2. Admin clicks "Deploy Update" targeting specific agents or all agents.
3. Server sets `forceUpdateUrl` on selected Agent records.
4. Next heartbeat for those agents includes the forced update URL.
5. Agent downloads and installs as above.
6. After successful heartbeat with new version, server clears `forceUpdateUrl`.

### Scheduled Update
1. Admin configures a maintenance window (e.g., Sunday 2:00 AM–4:00 AM).
2. Heartbeat only includes `updateUrl` during the configured window.
3. Agent processes the update normally within the window.

## Update Policies

Stored as `agentUpdatePolicy` on the Tenant model. Values:

| Policy | Behavior |
|--------|----------|
| `auto` | Heartbeat always includes `updateUrl` when a newer version exists |
| `manual` | `updateUrl` only sent when admin explicitly pushes via `forceUpdateUrl` |
| `scheduled` | `updateUrl` sent only during the configured maintenance window |

Default: `manual` (safest for new tenants).

Admin-pushed updates (`forceUpdateUrl`) override the policy — they always take effect on next heartbeat regardless of policy setting.

## Download Source

The `updateUrl` in the heartbeat response can point to:
- The Meridian server itself: `/api/v1/agents/update/win-x64` (default)
- An external CDN or storage URL (S3, Azure Blob, GitHub Releases)

Admin configures this in Settings > Agents > Update Source. The server stores the base URL template and appends the platform identifier.

## Installation Mechanism

The agent downloads the update package (MSI or setup EXE) to a temp directory and runs it silently:

- **MSI**: `msiexec /i <path> SERVER_URL="<current>" ENROLLMENT_TOKEN="" PRIVACY_TIER="<current>" /quiet`
- **EXE**: `MeridianAgentSetup.exe --server-url <current> --agent-key <current> --privacy-tier <current> --quiet`

The installer handles: stop service → replace files → write config (preserving existing agent key) → start service.

The agent does NOT pass the enrollment token during updates — it passes `--agent-key` with its existing key to skip re-enrollment.

### Pre-Update Checkpoint

Before triggering the installer, the agent writes a checkpoint file to `%ProgramData%\Meridian\update-checkpoint.json`:

```json
{
  "previousVersion": "1.0.0",
  "updateVersion": "1.1.0",
  "timestamp": "2026-04-06T14:00:00Z",
  "installerPath": "C:\\Temp\\MeridianAgentSetup.exe"
}
```

Server-side: if an agent that reported an update-in-progress fails to heartbeat with the new version within 10 minutes, the server flags it as `UPDATE_FAILED` in the dashboard for admin attention.

## Architecture

### Database Changes

**New model: `AgentUpdate`** — tracks available update packages.

```
model AgentUpdate {
  id          String   @id @default(uuid()) @db.Uuid
  version     String                          // e.g., "1.1.0"
  platform    AgentPlatform                   // WINDOWS, LINUX, MACOS
  downloadUrl String                          // URL to the package
  checksum    String                          // SHA-256 hash of the package
  fileSize    Int                             // bytes
  releaseNotes String?
  uploadedBy  String?  @db.Uuid              // OwnerUser who uploaded
  createdAt   DateTime @default(now())

  @@unique([version, platform])
  @@map("agent_updates")
}
```

**Modified model: `Agent`** — add `forceUpdateUrl` field.

```
forceUpdateUrl    String?    // Set by admin to force update on next heartbeat
updateInProgress  Boolean    @default(false)
updateStartedAt   DateTime?
```

**Modified model: `Tenant`** — add update policy fields.

```
agentUpdatePolicy       String   @default("manual")  // auto, manual, scheduled
agentUpdateWindowStart  String?                       // e.g., "02:00" (24h format)
agentUpdateWindowEnd    String?                       // e.g., "04:00"
agentUpdateWindowDay    String?                       // e.g., "sunday", or null for daily
```

### Server-Side API

**Modified: `POST /api/v1/agents/heartbeat` response**

Current response: `{ status: "ok" }`

New response:
```json
{
  "status": "ok",
  "update": {
    "latestVersion": "1.1.0",
    "updateUrl": "https://app.meridianitsm.com/api/v1/agents/update/win-x64?v=1.1.0",
    "checksum": "sha256:abc123...",
    "fileSize": 67000000
  }
}
```

The `update` field is `null` when no update is available or policy prevents it.

Logic:
1. Check if `agent.forceUpdateUrl` is set → return it (always, regardless of policy).
2. Else, look up latest `AgentUpdate` for this platform.
3. If `latestVersion > agent.agentVersion`:
   - Policy `auto` → include update info.
   - Policy `manual` → omit (update is null).
   - Policy `scheduled` → include only if current time is within the maintenance window.

**New: `GET /api/v1/agents/update/:platform`**

Serves the update binary. Requires agent key auth. Streams the file from local storage or redirects to external URL.

**New: `POST /api/v1/admin/agents/upload-update`** (Owner Admin)

Accepts multipart upload of agent package. Computes SHA-256 checksum, stores file, creates `AgentUpdate` record.

**New: `POST /api/v1/admin/agents/deploy-update`** (Owner Admin)

Body: `{ agentIds: string[] | "all", version: string }`

Sets `forceUpdateUrl` on selected agents.

### Agent-Side Changes

**New: `InvAgent.Worker/UpdateChecker.cs`**

Processes the heartbeat response. If `update` is non-null and `update.latestVersion > currentVersion`:
- Check local config `AutoUpdateEnabled` (default: true). If false, log and skip.
- Check if an update is already in progress (checkpoint file exists). If so, skip.
- Invoke `UpdateInstaller`.

**New: `InvAgent.Worker/UpdateInstaller.cs`**

1. Download the package from `updateUrl` to `%TEMP%\MeridianUpdate\`.
2. Verify SHA-256 checksum matches `checksum` from heartbeat.
3. Write pre-update checkpoint to `%ProgramData%\Meridian\update-checkpoint.json`.
4. Set `updateInProgress = true` via heartbeat or dedicated API call.
5. Launch the installer silently as a detached process:
   - `MeridianAgentSetup.exe --server-url <current> --agent-key <current> --privacy-tier <current> --quiet`
6. The installer stops the current service, swaps files, restarts. The old agent process exits as part of the service stop.

**Modified: `InvAgent.Config/AgentConfig.cs`**

Add:
```csharp
public bool AutoUpdateEnabled { get; set; } = true;
```

**Modified: `InvAgent.Worker/AgentWorker.cs`**

After each heartbeat response, pass the response to `UpdateChecker`. No change to heartbeat timing.

**Modified: `InvAgent.Http/MeridianApiClient.cs`**

Update `HeartbeatAsync` to deserialize the new response shape (with optional `update` object).

### Dashboard UI Changes

**Settings > Agents page** — add:
- "Upload Agent Update" button — file upload for MSI/EXE per platform
- "Deploy Update" button — select agents and version, triggers push
- Update policy dropdown (auto/manual/scheduled) with maintenance window fields
- Per-agent status column showing current version and update state

## Security

- Update packages are verified by SHA-256 checksum before installation.
- Download URLs served by the Meridian API require agent key authentication.
- External URLs are the admin's responsibility to secure (HTTPS required).
- The `forceUpdateUrl` field can only be set by authenticated owner admin users.
- Local `AutoUpdateEnabled = false` in config acts as a kill switch for any endpoint where auto-updates are unwanted.

## Edge Cases

- **Agent offline during scheduled window** — misses the window, gets the update at the next window.
- **Download fails** — logged, retried on next heartbeat cycle (5 minutes).
- **Checksum mismatch** — download is deleted, logged as error, retried on next heartbeat.
- **Installer fails** — service doesn't restart. Server detects via missing heartbeat after 10 minutes and flags `UPDATE_FAILED`.
- **Downgrade** — not supported. Version comparison is forward-only (semver).
- **Multiple platforms** — `AgentUpdate` is per-platform. Each platform has its own package and checksum.
- **Agent key preserved** — the installer receives `--agent-key` so it writes the existing key to config rather than re-enrolling.

## Multi-Tenancy

- `AgentUpdate` is a global table (packages are the same for all tenants).
- Update policy is per-tenant (on the Tenant model).
- `forceUpdateUrl` is per-agent (scoped to tenant via the Agent model).
- The heartbeat endpoint already authenticates by agent key and resolves tenant — no new tenant concerns.

## Out of Scope

- Rollback mechanism (if the new version is broken, admin must push the old version as a new update).
- Delta/patch updates (always full package replacement).
- Linux/macOS updater scripts (Windows first; Linux/macOS follow the same pattern with shell scripts instead of MSI/EXE).
- Code signing of update packages.

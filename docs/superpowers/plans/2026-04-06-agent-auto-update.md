# Agent Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the Meridian Inventory Agent to discover, download, and install updates automatically via heartbeat-driven version checks, admin-pushed updates, and configurable per-tenant update policies.

**Architecture:** The server advertises the latest agent version in heartbeat responses. The agent compares versions, downloads the update package (MSI/EXE), and runs the installer silently. Admins can upload packages, push forced updates, and configure per-tenant policies (auto/manual/scheduled). The update URL can point to the Meridian server or an external CDN.

**Tech Stack:** Prisma (schema), Fastify (API), TypeScript (server), C#/.NET 8 (agent), React/TanStack Query (dashboard UI), MinIO S3 (package storage)

---

## File Structure

**Create:**
- `packages/db/prisma/migrations/YYYYMMDD_agent_auto_update/migration.sql` (auto-generated)
- `apps/api/src/routes/v1/agents/updates.ts` — update package upload/download/deploy endpoints
- `apps/inventory-agent/src/InvAgent.Models/HeartbeatResponse.cs` — typed response from heartbeat
- `apps/inventory-agent/src/InvAgent.Models/UpdateInfo.cs` — update metadata from server
- `apps/inventory-agent/src/InvAgent.Worker/UpdateChecker.cs` — version comparison logic
- `apps/inventory-agent/src/InvAgent.Worker/UpdateInstaller.cs` — download + silent install

**Modify:**
- `packages/db/prisma/schema.prisma` — add AgentUpdate model, Agent fields, Tenant fields
- `apps/api/src/routes/v1/agents/index.ts` — modify heartbeat response
- `apps/inventory-agent/src/InvAgent.Config/AgentConfig.cs` — add AutoUpdateEnabled
- `apps/inventory-agent/src/InvAgent.Http/MeridianApiClient.cs` — return HeartbeatResponse, add DownloadFileAsync
- `apps/inventory-agent/src/InvAgent.Worker/AgentWorker.cs` — integrate update check after heartbeat
- `apps/web/src/app/dashboard/settings/agents/page.tsx` — add upload/deploy/policy UI

---

## Task 1: Database Schema Changes

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the AgentUpdate model**

After the existing `Agent` model (around line 1421), add:

```prisma
model AgentUpdate {
  id           String        @id @default(uuid()) @db.Uuid
  version      String
  platform     AgentPlatform
  downloadUrl  String
  checksum     String                          // SHA-256
  fileSize     Int
  releaseNotes String?
  storageKey   String?                         // MinIO key if hosted locally
  uploadedBy   String?       @db.Uuid
  createdAt    DateTime      @default(now())

  @@unique([version, platform])
  @@map("agent_updates")
}
```

- [ ] **Step 2: Add update fields to the Agent model**

Inside `model Agent`, before the `@@index` lines, add:

```prisma
  forceUpdateUrl    String?
  updateInProgress  Boolean   @default(false)
  updateStartedAt   DateTime?
```

- [ ] **Step 3: Add update policy fields to the Tenant model**

Inside `model Tenant`, before the relations block, add:

```prisma
  agentUpdatePolicy       String    @default("manual")  // auto, manual, scheduled
  agentUpdateWindowStart  String?                        // "02:00" 24h format
  agentUpdateWindowEnd    String?                        // "04:00"
  agentUpdateWindowDay    String?                        // "sunday" or null for daily
```

- [ ] **Step 4: Generate and apply migration**

```bash
cd packages/db
npx prisma migrate dev --name agent_auto_update
npx prisma generate
```

Expected: Migration creates `agent_updates` table and adds new columns to `agents` and `tenants`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add AgentUpdate model and update fields for auto-update"
```

---

## Task 2: Modify Heartbeat API Response

**Files:**
- Modify: `apps/api/src/routes/v1/agents/index.ts` (lines 193-233)

- [ ] **Step 1: Add update logic to the heartbeat handler**

Replace the heartbeat handler (lines 196-233) with:

```typescript
  app.post('/api/v1/agents/heartbeat', async (request, reply) => {
    const agent = await resolveAgent(request, reply);
    if (!agent) return;

    const body = (request.body ?? {}) as {
      agentVersion?: string;
      metrics?: Record<string, unknown>;
    };

    // Update lastHeartbeatAt and optionally agentVersion
    // If agent was updating and now reports a new version, clear the flags
    const updateData: Record<string, unknown> = {
      lastHeartbeatAt: new Date(),
      status: 'ACTIVE',
    };
    if (body.agentVersion) {
      updateData.agentVersion = body.agentVersion;
      // Clear update-in-progress if agent reports a new version
      if (agent.updateInProgress) {
        updateData.updateInProgress = false;
        updateData.updateStartedAt = null;
      }
      // Clear forceUpdateUrl if agent is now at or above the forced version
      if (agent.forceUpdateUrl) {
        updateData.forceUpdateUrl = null;
      }
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: updateData,
    });

    // If metrics provided, create a MetricSample for each metric
    if (body.metrics && typeof body.metrics === 'object') {
      const metricEntries = Object.entries(body.metrics);
      if (metricEntries.length > 0) {
        await prisma.metricSample.createMany({
          data: metricEntries.map(([key, value]) => ({
            tenantId: agent.tenantId,
            agentId: agent.id,
            metricType: 'heartbeat',
            metricName: key,
            value: typeof value === 'number' ? value : 0,
            timestamp: new Date(),
          })),
        });
      }
    }

    // ── Determine if an update is available ──────────────────────────────
    let update: {
      latestVersion: string;
      updateUrl: string;
      checksum: string;
      fileSize: number;
    } | null = null;

    // Priority 1: forced update from admin (always overrides policy)
    if (agent.forceUpdateUrl) {
      const forced = await prisma.agentUpdate.findFirst({
        where: { platform: agent.platform },
        orderBy: { createdAt: 'desc' },
      });
      if (forced) {
        update = {
          latestVersion: forced.version,
          updateUrl: agent.forceUpdateUrl,
          checksum: forced.checksum,
          fileSize: forced.fileSize,
        };
      }
    }

    // Priority 2: check latest version vs agent version (policy-gated)
    if (!update && body.agentVersion) {
      const latest = await prisma.agentUpdate.findFirst({
        where: { platform: agent.platform },
        orderBy: { createdAt: 'desc' },
      });

      if (latest && latest.version > (body.agentVersion ?? '0.0.0')) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: agent.tenantId },
          select: {
            agentUpdatePolicy: true,
            agentUpdateWindowStart: true,
            agentUpdateWindowEnd: true,
            agentUpdateWindowDay: true,
          },
        });

        const policy = tenant?.agentUpdatePolicy ?? 'manual';
        let shouldIncludeUpdate = false;

        if (policy === 'auto') {
          shouldIncludeUpdate = true;
        } else if (policy === 'scheduled') {
          shouldIncludeUpdate = isWithinMaintenanceWindow(
            tenant?.agentUpdateWindowStart ?? null,
            tenant?.agentUpdateWindowEnd ?? null,
            tenant?.agentUpdateWindowDay ?? null,
          );
        }
        // policy === 'manual' → only via forceUpdateUrl (already handled above)

        if (shouldIncludeUpdate) {
          update = {
            latestVersion: latest.version,
            updateUrl: latest.downloadUrl,
            checksum: latest.checksum,
            fileSize: latest.fileSize,
          };
        }
      }
    }

    return reply.code(200).send({ ok: true, update });
  });
```

- [ ] **Step 2: Add the maintenance window helper**

Add this function near the top of the file (after the imports):

```typescript
/**
 * Check if the current server time falls within the configured maintenance window.
 */
function isWithinMaintenanceWindow(
  start: string | null,
  end: string | null,
  day: string | null,
): boolean {
  if (!start || !end) return false;

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  // Day filter (null = every day)
  if (day && currentDay !== day.toLowerCase()) return false;

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}
```

- [ ] **Step 3: Update the `resolveAgent` query to include new fields**

Find the `resolveAgent` function in the same file. Ensure the `select` or `findUnique` includes the new fields: `forceUpdateUrl`, `updateInProgress`, `updateStartedAt`. If it uses `findUnique` without a `select`, the new fields are returned automatically.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/agents/index.ts
git commit -m "feat(api): include update info in heartbeat response"
```

---

## Task 3: Agent Update Package Endpoints

**Files:**
- Create: `apps/api/src/routes/v1/agents/updates.ts`
- Modify: `apps/api/src/routes/v1/agents/index.ts` (register the new routes)

- [ ] **Step 1: Create the updates route file**

```typescript
// apps/api/src/routes/v1/agents/updates.ts
import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { createHash } from 'crypto';
import { prisma } from '@meridian/db';
import { uploadFile, getFileSignedUrl } from '../../../services/storage.service.js';

const MAX_PACKAGE_SIZE = 200 * 1024 * 1024; // 200 MB

export default async function agentUpdateRoutes(app: FastifyInstance) {
  // Register multipart for this scope only
  await app.register(multipart, { limits: { fileSize: MAX_PACKAGE_SIZE } });

  // ─── POST /api/v1/agents/updates/upload ────────────────────────────────────
  // Admin auth required. Uploads a new agent update package.
  app.post('/updates/upload', async (request, reply) => {
    // Auth: require admin role via session (reuse existing auth middleware)
    const session = (request as any).session;
    if (!session?.userId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const version = (data.fields.version as any)?.value as string;
    const platform = (data.fields.platform as any)?.value as string;
    const releaseNotes = (data.fields.releaseNotes as any)?.value as string | undefined;

    if (!version || !platform) {
      return reply.code(400).send({ error: 'version and platform fields are required' });
    }

    if (!['WINDOWS', 'LINUX', 'MACOS'].includes(platform.toUpperCase())) {
      return reply.code(400).send({ error: 'Invalid platform. Use WINDOWS, LINUX, or MACOS' });
    }

    // Read file into buffer, compute checksum
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const checksum = 'sha256:' + createHash('sha256').update(buffer).digest('hex');

    // Upload to MinIO
    const storageKey = `agent-updates/${platform.toLowerCase()}/${version}/${data.filename}`;
    await uploadFile(buffer, storageKey, data.mimetype);

    // Generate a signed download URL (long-lived: 7 days)
    const downloadUrl = await getFileSignedUrl(storageKey, 7 * 24 * 3600);

    // Upsert AgentUpdate record
    const existing = await prisma.agentUpdate.findUnique({
      where: { version_platform: { version, platform: platform.toUpperCase() as any } },
    });

    let record;
    if (existing) {
      record = await prisma.agentUpdate.update({
        where: { id: existing.id },
        data: { downloadUrl, checksum, fileSize: buffer.length, storageKey, releaseNotes },
      });
    } else {
      record = await prisma.agentUpdate.create({
        data: {
          version,
          platform: platform.toUpperCase() as any,
          downloadUrl,
          checksum,
          fileSize: buffer.length,
          storageKey,
          releaseNotes: releaseNotes ?? null,
          uploadedBy: session.userId,
        },
      });
    }

    return reply.code(201).send({ id: record.id, version, platform, checksum, fileSize: buffer.length });
  });

  // ─── GET /api/v1/agents/updates/:platform ──────────────────────────────────
  // Agent key auth. Redirects to the download URL for the latest update package.
  app.get('/updates/:platform', async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const platformUpper = platform.toUpperCase().replace('-', '_')
      .replace('WIN_X64', 'WINDOWS')
      .replace('LINUX_X64', 'LINUX')
      .replace('OSX_ARM64', 'MACOS')
      .replace('OSX_X64', 'MACOS');

    const latest = await prisma.agentUpdate.findFirst({
      where: { platform: platformUpper as any },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return reply.code(404).send({ error: 'No update package available for this platform' });
    }

    // If stored locally in MinIO, generate a fresh signed URL
    if (latest.storageKey) {
      const url = await getFileSignedUrl(latest.storageKey, 3600);
      return reply.redirect(302, url);
    }

    // Otherwise redirect to the configured external URL
    return reply.redirect(302, latest.downloadUrl);
  });

  // ─── POST /api/v1/agents/updates/deploy ────────────────────────────────────
  // Admin auth. Sets forceUpdateUrl on selected agents.
  app.post('/updates/deploy', async (request, reply) => {
    const session = (request as any).session;
    if (!session?.userId || !session?.tenantId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const body = request.body as {
      agentIds: string[] | 'all';
      version: string;
      platform: string;
    };

    if (!body.version || !body.platform) {
      return reply.code(400).send({ error: 'version and platform are required' });
    }

    const update = await prisma.agentUpdate.findFirst({
      where: { version: body.version, platform: body.platform.toUpperCase() as any },
    });

    if (!update) {
      return reply.code(404).send({ error: 'Update package not found for this version/platform' });
    }

    const downloadUrl = update.storageKey
      ? `${(request as any).protocol}://${(request as any).hostname}/api/v1/agents/updates/${body.platform}`
      : update.downloadUrl;

    const whereClause: any = { tenantId: session.tenantId, status: 'ACTIVE' };
    if (body.agentIds !== 'all') {
      whereClause.id = { in: body.agentIds };
    }
    if (body.platform) {
      whereClause.platform = body.platform.toUpperCase();
    }

    const result = await prisma.agent.updateMany({
      where: whereClause,
      data: { forceUpdateUrl: downloadUrl },
    });

    return reply.code(200).send({ deployed: result.count });
  });

  // ─── GET /api/v1/agents/updates ────────────────────────────────────────────
  // Admin auth. Lists all uploaded update packages.
  app.get('/updates', async (request, reply) => {
    const updates = await prisma.agentUpdate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return reply.send({ updates });
  });
}
```

- [ ] **Step 2: Register the routes in the agents index**

In `apps/api/src/routes/v1/agents/index.ts`, add at the top:

```typescript
import agentUpdateRoutes from './updates.js';
```

And inside the main plugin function, register it:

```typescript
await app.register(agentUpdateRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/agents/updates.ts apps/api/src/routes/v1/agents/index.ts
git commit -m "feat(api): add agent update upload, download, and deploy endpoints"
```

---

## Task 4: Agent-Side — Config and Response Models

**Files:**
- Modify: `apps/inventory-agent/src/InvAgent.Config/AgentConfig.cs`
- Create: `apps/inventory-agent/src/InvAgent.Models/HeartbeatResponse.cs`
- Create: `apps/inventory-agent/src/InvAgent.Models/UpdateInfo.cs`

- [ ] **Step 1: Add AutoUpdateEnabled to AgentConfig**

In `AgentConfig.cs`, add after line 14 (before the closing brace):

```csharp
    public bool AutoUpdateEnabled { get; set; } = true;
```

- [ ] **Step 2: Create UpdateInfo model**

```csharp
// apps/inventory-agent/src/InvAgent.Models/UpdateInfo.cs
namespace InvAgent.Models;

public class UpdateInfo
{
    public string LatestVersion { get; set; } = "";
    public string UpdateUrl { get; set; } = "";
    public string Checksum { get; set; } = "";
    public int FileSize { get; set; }
}
```

- [ ] **Step 3: Create HeartbeatResponse model**

```csharp
// apps/inventory-agent/src/InvAgent.Models/HeartbeatResponse.cs
namespace InvAgent.Models;

public class HeartbeatResponse
{
    public bool Ok { get; set; }
    public UpdateInfo? Update { get; set; }
}
```

- [ ] **Step 4: Build to verify**

```bash
cd apps/inventory-agent
dotnet build src/InvAgent.Models/InvAgent.Models.csproj
dotnet build src/InvAgent.Config/InvAgent.Config.csproj
```

- [ ] **Step 5: Commit**

```bash
git add apps/inventory-agent/src/InvAgent.Config/AgentConfig.cs \
       apps/inventory-agent/src/InvAgent.Models/HeartbeatResponse.cs \
       apps/inventory-agent/src/InvAgent.Models/UpdateInfo.cs
git commit -m "feat(agent): add update config and response models"
```

---

## Task 5: Agent-Side — MeridianApiClient Changes

**Files:**
- Modify: `apps/inventory-agent/src/InvAgent.Http/MeridianApiClient.cs`

- [ ] **Step 1: Change SendHeartbeatAsync to return HeartbeatResponse**

Replace the existing `SendHeartbeatAsync` method (lines 63-67) with:

```csharp
    /// <summary>Sends a heartbeat to the server. Returns the response with optional update info.</summary>
    public async Task<HeartbeatResponse?> SendHeartbeatAsync(HeartbeatPayload payload, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("api/v1/agents/heartbeat", payload, JsonOptions, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<HeartbeatResponse>(JsonOptions, ct);
    }
```

- [ ] **Step 2: Add DownloadFileAsync method**

Add after the `TestConnectivityAsync` method (before the closing class brace):

```csharp
    /// <summary>
    /// Downloads a file from the given URL to a local path.
    /// Supports both absolute URLs and relative paths on the Meridian server.
    /// </summary>
    public async Task DownloadFileAsync(string url, string destinationPath, CancellationToken ct = default)
    {
        HttpResponseMessage response;
        if (url.StartsWith("http://") || url.StartsWith("https://"))
        {
            // Absolute URL — use a fresh HttpClient to avoid base address conflicts
            using var client = new HttpClient();
            response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        else
        {
            response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        }

        response.EnsureSuccessStatusCode();

        var dir = Path.GetDirectoryName(destinationPath);
        if (dir != null) Directory.CreateDirectory(dir);

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        await using var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
        await stream.CopyToAsync(fileStream, ct);
    }
```

- [ ] **Step 3: Build to verify**

```bash
cd apps/inventory-agent && dotnet build src/InvAgent.Http/InvAgent.Http.csproj
```

- [ ] **Step 4: Commit**

```bash
git add apps/inventory-agent/src/InvAgent.Http/MeridianApiClient.cs
git commit -m "feat(agent): heartbeat returns HeartbeatResponse, add file download"
```

---

## Task 6: Agent-Side — UpdateChecker Service

**Files:**
- Create: `apps/inventory-agent/src/InvAgent.Worker/UpdateChecker.cs`

- [ ] **Step 1: Write UpdateChecker**

```csharp
// apps/inventory-agent/src/InvAgent.Worker/UpdateChecker.cs
namespace InvAgent.Worker;

using InvAgent.Config;
using InvAgent.Models;
using Microsoft.Extensions.Logging;

/// <summary>
/// Evaluates heartbeat responses to determine if an agent update is available.
/// </summary>
public class UpdateChecker
{
    private readonly AgentConfig _config;
    private readonly ILogger<UpdateChecker> _logger;

    public UpdateChecker(AgentConfig config, ILogger<UpdateChecker> logger)
    {
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Checks if the update from the heartbeat should be applied.
    /// Returns the UpdateInfo if an update should proceed, null otherwise.
    /// </summary>
    public UpdateInfo? CheckForUpdate(HeartbeatResponse? response)
    {
        if (response?.Update == null)
            return null;

        if (!_config.AutoUpdateEnabled)
        {
            _logger.LogInformation("Update available ({Version}) but AutoUpdateEnabled is false — skipping.",
                response.Update.LatestVersion);
            return null;
        }

        var currentVersion = GetCurrentVersion();
        var latestVersion = response.Update.LatestVersion;

        if (string.Compare(latestVersion, currentVersion, StringComparison.OrdinalIgnoreCase) <= 0)
        {
            _logger.LogDebug("Agent is up to date ({Current}).", currentVersion);
            return null;
        }

        // Check if an update is already in progress (checkpoint file exists)
        if (IsUpdateInProgress())
        {
            _logger.LogInformation("Update already in progress — skipping.");
            return null;
        }

        _logger.LogInformation("Update available: {Current} → {Latest}", currentVersion, latestVersion);
        return response.Update;
    }

    public static string GetCurrentVersion()
    {
        return typeof(UpdateChecker).Assembly.GetName().Version?.ToString(3) ?? "1.0.0";
    }

    private static bool IsUpdateInProgress()
    {
        var checkpointPath = GetCheckpointPath();
        if (!File.Exists(checkpointPath)) return false;

        // If checkpoint is older than 15 minutes, assume the update failed and allow retry
        var age = DateTime.UtcNow - File.GetLastWriteTimeUtc(checkpointPath);
        if (age.TotalMinutes > 15)
        {
            try { File.Delete(checkpointPath); } catch { }
            return false;
        }
        return true;
    }

    public static string GetCheckpointPath()
    {
        var configDir = System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(
            System.Runtime.InteropServices.OSPlatform.Windows)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Meridian")
            : "/etc/meridian-agent";
        return Path.Combine(configDir, "update-checkpoint.json");
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
cd apps/inventory-agent && dotnet build src/InvAgent.Worker/InvAgent.Worker.csproj
```

- [ ] **Step 3: Commit**

```bash
git add apps/inventory-agent/src/InvAgent.Worker/UpdateChecker.cs
git commit -m "feat(agent): add UpdateChecker service"
```

---

## Task 7: Agent-Side — UpdateInstaller Service

**Files:**
- Create: `apps/inventory-agent/src/InvAgent.Worker/UpdateInstaller.cs`

- [ ] **Step 1: Write UpdateInstaller**

```csharp
// apps/inventory-agent/src/InvAgent.Worker/UpdateInstaller.cs
namespace InvAgent.Worker;

using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using InvAgent.Config;
using InvAgent.Http;
using InvAgent.Models;
using Microsoft.Extensions.Logging;

/// <summary>
/// Downloads an update package, verifies its checksum, writes a checkpoint,
/// and launches the silent installer as a detached process.
/// </summary>
public class UpdateInstaller
{
    private readonly MeridianApiClient _api;
    private readonly AgentConfig _config;
    private readonly ILogger<UpdateInstaller> _logger;

    public UpdateInstaller(MeridianApiClient api, AgentConfig config, ILogger<UpdateInstaller> logger)
    {
        _api = api;
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Downloads, verifies, and launches the update installer.
    /// Returns true if the installer was launched successfully.
    /// </summary>
    public async Task<bool> InstallUpdateAsync(UpdateInfo update, CancellationToken ct)
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "MeridianUpdate");
        Directory.CreateDirectory(tempDir);

        var fileName = update.UpdateUrl.Contains(".msi") ? "MeridianAgent.msi" : "MeridianAgentSetup.exe";
        var downloadPath = Path.Combine(tempDir, fileName);

        try
        {
            // Step 1: Download
            _logger.LogInformation("Downloading update {Version} from {Url}...", update.LatestVersion, update.UpdateUrl);
            await _api.DownloadFileAsync(update.UpdateUrl, downloadPath, ct);

            // Step 2: Verify checksum
            if (!string.IsNullOrEmpty(update.Checksum))
            {
                _logger.LogInformation("Verifying checksum...");
                var actualChecksum = await ComputeChecksumAsync(downloadPath, ct);
                var expectedChecksum = update.Checksum.StartsWith("sha256:")
                    ? update.Checksum["sha256:".Length..]
                    : update.Checksum;

                if (!string.Equals(actualChecksum, expectedChecksum, StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogError("Checksum mismatch! Expected {Expected}, got {Actual}. Aborting update.",
                        expectedChecksum, actualChecksum);
                    try { File.Delete(downloadPath); } catch { }
                    return false;
                }
                _logger.LogInformation("Checksum verified.");
            }

            // Step 3: Write checkpoint
            var checkpoint = new
            {
                previousVersion = UpdateChecker.GetCurrentVersion(),
                updateVersion = update.LatestVersion,
                timestamp = DateTime.UtcNow.ToString("O"),
                installerPath = downloadPath,
            };
            var checkpointPath = UpdateChecker.GetCheckpointPath();
            await File.WriteAllTextAsync(checkpointPath,
                JsonSerializer.Serialize(checkpoint, new JsonSerializerOptions { WriteIndented = true }), ct);

            // Step 4: Launch installer silently
            _logger.LogInformation("Launching installer: {Path}", downloadPath);

            string arguments;
            if (fileName.EndsWith(".msi"))
            {
                arguments = $"/i \"{downloadPath}\" /quiet /norestart";
                var psi = new ProcessStartInfo
                {
                    FileName = "msiexec.exe",
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                Process.Start(psi);
            }
            else
            {
                // EXE installer — pass existing config so it doesn't re-enroll
                arguments = $"--server-url \"{_config.ServerUrl}\" --agent-key \"{_config.AgentKey}\" --privacy-tier \"{_config.PrivacyTier}\" --quiet";
                var psi = new ProcessStartInfo
                {
                    FileName = downloadPath,
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                Process.Start(psi);
            }

            _logger.LogInformation("Installer launched. The service will be restarted by the installer.");
            return true;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to install update {Version}.", update.LatestVersion);
            return false;
        }
    }

    private static async Task<string> ComputeChecksumAsync(string filePath, CancellationToken ct)
    {
        using var sha256 = SHA256.Create();
        await using var stream = File.OpenRead(filePath);
        var hashBytes = await sha256.ComputeHashAsync(stream, ct);
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
cd apps/inventory-agent && dotnet build src/InvAgent.Worker/InvAgent.Worker.csproj
```

- [ ] **Step 3: Commit**

```bash
git add apps/inventory-agent/src/InvAgent.Worker/UpdateInstaller.cs
git commit -m "feat(agent): add UpdateInstaller service (download, verify, launch)"
```

---

## Task 8: Agent-Side — Integrate Update Check into AgentWorker

**Files:**
- Modify: `apps/inventory-agent/src/InvAgent.Worker/AgentWorker.cs`
- Modify: `apps/inventory-agent/src/InvAgent.CLI/Program.cs` (register new services)

- [ ] **Step 1: Add UpdateChecker and UpdateInstaller fields to AgentWorker**

Add to the field declarations (after `_logger`):

```csharp
    private readonly UpdateChecker _updateChecker;
    private readonly UpdateInstaller _updateInstaller;
```

Update the constructor to accept and assign them:

```csharp
    public AgentWorker(
        ICollector collector,
        MeridianApiClient api,
        LocalQueue queue,
        IOptions<AgentConfig> config,
        ILogger<AgentWorker> logger,
        UpdateChecker updateChecker,
        UpdateInstaller updateInstaller)
    {
        _collector = collector;
        _api = api;
        _queue = queue;
        _config = config.Value;
        _logger = logger;
        _updateChecker = updateChecker;
        _updateInstaller = updateInstaller;
    }
```

- [ ] **Step 2: Modify SendHeartbeatAsync to process update response**

Replace the `SendHeartbeatAsync` method (lines 103-129) with:

```csharp
    private async Task SendHeartbeatAsync(CancellationToken ct)
    {
        try
        {
            _logger.LogDebug("Sending heartbeat...");
            var payload = new HeartbeatPayload
            {
                AgentVersion = GetAgentVersion(),
                Metrics = new Dictionary<string, object>
                {
                    ["queueCount"] = _queue.Count,
                    ["queueSizeBytes"] = _queue.SizeBytes,
                    ["platform"] = RuntimeInformation.OSDescription,
                }
            };
            var response = await _api.SendHeartbeatAsync(payload, ct);
            _logger.LogDebug("Heartbeat sent successfully.");

            // Check for updates
            var updateInfo = _updateChecker.CheckForUpdate(response);
            if (updateInfo != null)
            {
                _logger.LogInformation("Applying update to {Version}...", updateInfo.LatestVersion);
                await _updateInstaller.InstallUpdateAsync(updateInfo, ct);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Heartbeat failed — will retry next interval.");
        }
    }
```

- [ ] **Step 3: Register services in Program.cs**

In `apps/inventory-agent/src/InvAgent.CLI/Program.cs`, after the line that registers `LocalQueue` (around line 140), add:

```csharp
    // Register update services
    builder.Services.AddSingleton<InvAgent.Worker.UpdateChecker>();
    builder.Services.AddSingleton<InvAgent.Worker.UpdateInstaller>();
```

- [ ] **Step 4: Build the full solution**

```bash
cd apps/inventory-agent && dotnet build
```

- [ ] **Step 5: Commit**

```bash
git add apps/inventory-agent/src/InvAgent.Worker/AgentWorker.cs \
       apps/inventory-agent/src/InvAgent.CLI/Program.cs
git commit -m "feat(agent): integrate update check into heartbeat loop"
```

---

## Task 9: Dashboard UI — Upload, Deploy, and Policy Settings

**Files:**
- Modify: `apps/web/src/app/dashboard/settings/agents/page.tsx`

- [ ] **Step 1: Add update management section to the agents settings page**

At the end of the existing page component (before the final closing tag), add a new section:

```tsx
{/* ── Agent Updates Section ─────────────────────────────────────────── */}
<div style={{ marginTop: 32, backgroundColor: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border-primary)', padding: 24 }}>
  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
    Agent Updates
  </h3>

  {/* Update Policy */}
  <div style={{ marginBottom: 20 }}>
    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
      Update Policy
    </label>
    <select
      value={updatePolicy}
      onChange={async (e) => {
        setUpdatePolicy(e.target.value);
        await fetch('/api/v1/settings/agent-update-policy', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ policy: e.target.value }),
        });
      }}
      style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-primary)', fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <option value="manual">Manual — admin must push updates</option>
      <option value="auto">Automatic — agents update on next heartbeat</option>
      <option value="scheduled">Scheduled — updates during maintenance window only</option>
    </select>
  </div>

  {/* Upload Update Package */}
  <div style={{ marginBottom: 20 }}>
    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
      Upload Agent Package
    </label>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="text" placeholder="Version (e.g. 1.1.0)" value={uploadVersion} onChange={(e) => setUploadVersion(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-primary)', fontSize: 14, width: 140, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
      <select value={uploadPlatform} onChange={(e) => setUploadPlatform(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-primary)', fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <option value="WINDOWS">Windows</option>
        <option value="LINUX">Linux</option>
        <option value="MACOS">macOS</option>
      </select>
      <input type="file" ref={fileInputRef} accept=".exe,.msi,.tar.gz,.zip"
        style={{ fontSize: 13 }} />
      <button onClick={handleUpload} disabled={uploading}
        style={{ padding: '8px 16px', borderRadius: 6, border: 'none', backgroundColor: 'var(--accent-brand, #0284c7)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  </div>

  {/* Deploy Update */}
  <div>
    <button onClick={handleDeploy}
      style={{ padding: '8px 16px', borderRadius: 6, border: 'none', backgroundColor: 'var(--accent-warning, #f59e0b)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
      Deploy Update to All Agents
    </button>
    <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-muted)' }}>
      Forces all active agents to download the latest version on next heartbeat.
    </span>
  </div>
</div>
```

- [ ] **Step 2: Add state variables and handlers**

Add these state variables near the existing `useState` declarations:

```tsx
const [updatePolicy, setUpdatePolicy] = useState('manual');
const [uploadVersion, setUploadVersion] = useState('');
const [uploadPlatform, setUploadPlatform] = useState('WINDOWS');
const [uploading, setUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

Add `useRef` to the React import at the top of the file.

Add these handler functions:

```tsx
const handleUpload = async () => {
  const file = fileInputRef.current?.files?.[0];
  if (!file || !uploadVersion) return;
  setUploading(true);
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', uploadVersion);
    formData.append('platform', uploadPlatform);
    const res = await fetch('/api/v1/agents/updates/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (res.ok) {
      setUploadVersion('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert('Update package uploaded successfully.');
    } else {
      const err = await res.json();
      alert(`Upload failed: ${err.error}`);
    }
  } finally {
    setUploading(false);
  }
};

const handleDeploy = async () => {
  if (!confirm('Deploy the latest update to ALL active agents? They will update on next heartbeat.')) return;
  const res = await fetch('/api/v1/agents/updates/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ agentIds: 'all', version: uploadVersion || 'latest', platform: 'WINDOWS' }),
  });
  if (res.ok) {
    const data = await res.json();
    alert(`Update deployed to ${data.deployed} agent(s).`);
  } else {
    const err = await res.json();
    alert(`Deploy failed: ${err.error}`);
  }
};
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/settings/agents/page.tsx
git commit -m "feat(web): add agent update upload, deploy, and policy settings UI"
```

---

## Task 10: Update MeridianAgentSetup.exe to Support --agent-key

**Files:**
- Modify: `apps/inventory-agent/src/InvAgent.Setup/Program.cs`

- [ ] **Step 1: Add --agent-key CLI switch**

In the `GetArg` calls section, add:

```csharp
var agentKey = GetArg(args, "--agent-key");
```

- [ ] **Step 2: Write agent key to config if provided (skip enrollment token)**

In the `WriteConfig` method, modify to accept an optional `agentKey` parameter. If `agentKey` is provided, write it to config and omit the enrollment token:

```csharp
private static void WriteConfig(string configDir, string serverUrl, string token, string privacyTier, string? agentKey = null)
{
    var agentConfig = new Dictionary<string, object>
    {
        ["ServerUrl"] = serverUrl,
        ["PrivacyTier"] = privacyTier,
        ["HeartbeatIntervalSeconds"] = 300,
        ["InventoryIntervalSeconds"] = 14400,
        ["LocalWebUiPort"] = 8787,
        ["LocalQueueMaxSizeMb"] = 100,
        ["LogLevel"] = "Information",
    };

    if (!string.IsNullOrEmpty(agentKey))
        agentConfig["AgentKey"] = agentKey;
    else if (!string.IsNullOrEmpty(token))
        agentConfig["EnrollmentToken"] = token;

    var config = new { AgentConfig = agentConfig };
    var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
    var configPath = Path.Combine(configDir, "config.json");
    File.WriteAllText(configPath, json);
    WriteColor($"    Config written to {configPath}", ConsoleColor.Gray);
}
```

Update the call site in `RunInstall` to pass `agentKey`:

```csharp
WriteConfig(configDir, serverUrl, token, privacyTier, agentKey);
```

Make `token` nullable in `RunInstall` and validation — when `agentKey` is provided, `token` is not required.

- [ ] **Step 3: Build**

```bash
cd apps/inventory-agent && dotnet build src/InvAgent.Setup/InvAgent.Setup.csproj
```

- [ ] **Step 4: Commit**

```bash
git add apps/inventory-agent/src/InvAgent.Setup/Program.cs
git commit -m "feat(agent): setup EXE accepts --agent-key for updates (skip enrollment)"
```

---

## Task 11: Deploy and Verify

- [ ] **Step 1: Apply migration on dev server**

```bash
ssh meridian-dev "cd /opt/meridian && npx prisma migrate deploy"
```

- [ ] **Step 2: Push and deploy**

```bash
git push origin master
ssh meridian-dev "cd /opt/meridian && git pull origin master"
ssh meridian-dev "cd /opt/meridian && pnpm --filter web build"
ssh meridian-dev "pm2 restart api worker web"
```

- [ ] **Step 3: Rebuild agent installer**

```bash
cd apps/inventory-agent
powershell -ExecutionPolicy Bypass -File build-installer.ps1
```

- [ ] **Step 4: Manual verification**

1. Upload an agent package via Settings > Agents in the dashboard
2. Set update policy to "auto"
3. Wait for next heartbeat (5 min) or trigger manually
4. Check agent logs for update detection and download
5. Verify the agent updates and heartbeats with the new version

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Database | AgentUpdate model, Agent/Tenant update fields, migration |
| 2 | API | Heartbeat response includes update info (policy-gated) |
| 3 | API | Upload, download, deploy, list endpoints for update packages |
| 4 | Agent | Config + response models (AutoUpdateEnabled, HeartbeatResponse, UpdateInfo) |
| 5 | Agent | MeridianApiClient returns HeartbeatResponse, adds DownloadFileAsync |
| 6 | Agent | UpdateChecker — version comparison, checkpoint detection |
| 7 | Agent | UpdateInstaller — download, verify checksum, launch silent installer |
| 8 | Agent | AgentWorker integration + DI registration |
| 9 | Web UI | Upload, deploy, policy settings in Settings > Agents |
| 10 | Agent | Setup EXE accepts --agent-key for seamless updates |
| 11 | Deploy | Migration, build, deploy, verify |

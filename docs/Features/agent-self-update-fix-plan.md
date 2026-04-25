# Agent Self-Update — Fix Plan

**Context:** The "Agent Update Deploy" feature silently failed for every agent.
We traced a chain of 4 server-side bugs + 2 MSI-packaging bugs. Server-side
bugs are fixed (commits `064df57`, `20fb055`, `4c7665d` on `master`, already
deployed to dev). MSI-packaging bugs remain — they are why agents run the
install but end up in a broken state afterward.

This doc is self-contained. A fresh session should be able to pick it up
without any earlier context.

---

## Status snapshot (2026-04-21)

- **Server**: v1.0.0.2 chain fully working — shim endpoint, camelCase JSON,
  MSI hint in URLs, forceUpdateUrl no longer cleared on unchanged-version
  heartbeats.
- **MSI build**: **broken**. When the agent runs the MSI, Windows Installer
  reports success but does not actually replace the installed files and leaves
  the service in a broken state.
- **Agent on CYBORWKS10** (the dev box this was tested on): service stuck in
  Stopped; manual start times out (SCM error 1053 / 7009); running
  `InvAgent.exe` directly exits with code 1 immediately.

---

## Server-side bugs (already fixed, context only)

See commits `064df57`, `20fb055`, `4c7665d`.

1. Agent polls `GET /api/v1/agents/update-check` — route had been removed.
   Added a backward-compat shim at
   `apps/api/src/routes/v1/agents/index.ts` that returns the agent-expected
   `UpdateInfo` shape.
2. Heartbeat handler cleared `forceUpdateUrl` on every beat that included
   `agentVersion`, not just when the version actually changed. Fixed to gate
   on `versionChanged`.
3. Shim first returned PascalCase JSON keys but the .NET agent's
   `System.Text.Json` is configured with `PropertyNamingPolicy.CamelCase`.
   Switched to camelCase.
4. Update URLs were `api/v1/agents/updates/windows` with no extension hint.
   The agent's `UpdateInstaller` picks the installer (msiexec / pkg / dpkg)
   by substring-matching `UpdateUrl.Contains(".msi")` etc. Added a
   `packageHintSuffix(platform)` helper that appends `?file=agent.msi`
   (or `.pkg` / `.deb`) to every URL we hand out. The route ignores query
   params so downloads work identically.

Proof those fixes are working: the agent on CYBORWKS10 successfully
downloaded the MSI, checksum-verified it, and launched
`msiexec /i MeridianAgent.msi /quiet /norestart` — which reported
"Installation completed successfully. Product Version: 1.0.0.2" in the
Windows Installer event log.

---

## Remaining bugs (to fix)

### Bug A — MSI installs but doesn't replace files

**Symptom:** After MSI install "success", `C:\Program Files\MeridianAgent\InvAgent.exe`
has `LastWriteTime = 4/6/2026` (unchanged from original install) and its
`FileVersion` is still `1.0.0.0` — even though the MSI's ProductVersion is
`1.0.0.2`.

**Root cause:** Windows Installer's default component-versioning rule skips
replacement when `new.FileVersion <= old.FileVersion`. The published binaries
inside the MSI `agent-windows-1.0.0.2.msi` (currently stored in MinIO, served
via `GET /api/v1/agents/updates/windows`) have `FileVersion = 1.0.0.0` even
though the MSI metadata says 1.0.0.2.

**Where this went wrong:** `Directory.Build.props` at
`apps/inventory-agent/Directory.Build.props` DOES set:

```xml
<Version>1.0.0.2</Version>
<AssemblyVersion>1.0.0.2</AssemblyVersion>
<FileVersion>1.0.0.2</FileVersion>
<InformationalVersion>1.0.0.2</InformationalVersion>
```

So in theory fresh builds should stamp 1.0.0.2 into the assemblies. The
uploaded MSI must have been built from an older publish output that predates
that change, or from a publish step that didn't pick up Directory.Build.props.

**Fix steps:**

1. Verify Directory.Build.props applies to every project by doing a fresh
   build and inspecting an output file:
   ```powershell
   cd apps\inventory-agent
   dotnet publish src\InvAgent.CLI\InvAgent.CLI.csproj -c Release -r win-x64 --self-contained -o publish\win-x64-test
   (Get-Item publish\win-x64-test\InvAgent.exe).VersionInfo.FileVersion
   # Must show 1.0.0.2, not 1.0.0.0
   ```
2. If FileVersion is still 1.0.0.0, investigate:
   - Is Directory.Build.props being picked up? Check `bin\Release\net9.0\InvAgent.dll`
     with `[Reflection.Assembly]::LoadFile((Get-Item ...).FullName).GetName().Version`.
   - Could the agent .csproj files have their own `<Version>` overrides?
     They don't today (we checked `InvAgent.CLI.csproj` and `InvAgent.Setup.csproj`)
     — but confirm.
3. Rebuild the MSI with WiX (source at
   `apps/inventory-agent/src/InvAgent.Installers/windows/Product.wxs`).
   The WiX `Package Version="1.0.0.2"` attribute should track
   `Directory.Build.props` automatically — parameterize via `-d Version=...`
   if it isn't already.
4. Re-upload the MSI through the Owner Admin UI (or wherever the
   `agent_updates` table is seeded) and test end-to-end.

**Before calling it done, also address — each release forward:** bump the
version string in `Directory.Build.props` AND in `Product.wxs`
(line 18: `Version="1.0.0.2"`) together, and automate this so they can't
drift. A simple build-time substitution in `build-installer.ps1` would do it.

### Bug B — MSI upgrade leaves service in un-startable state

**Symptom:** After MSI upgrade completes, the `MeridianAgent` Windows service
stays in Stopped state. Manual `sc start` times out (1053). The
`InvAgent.exe` binary itself exits with code 1 when run outside the service
— so whatever the installer left behind is corrupted regardless of SCM
timeout tuning.

**Probable cause 1 — `StartAgentServiceCA` custom action gated on NOT Installed:**

`Product.wxs` lines 91–100:

```xml
<CustomAction Id="StartAgentServiceCA" ... ExeCommand="cmd.exe /c sc start MeridianAgent" />
<InstallExecuteSequence>
  <Custom Action="WriteConfigCA" After="InstallServices" Condition="NOT Installed" />
  <Custom Action="StartAgentServiceCA" After="WriteConfigCA" Condition="NOT Installed" />
</InstallExecuteSequence>
```

During a `MajorUpgrade`, the `Installed` property can be truthy during the
UpgradeAction depending on when it's evaluated. The CA is also gated behind
`WriteConfigCA` which is ALSO NOT-Installed-only, so on upgrade neither
runs. The `ServiceInstall` element alone declares the service but does not
start it (there is no `Start="install"` on the sibling `ServiceControl`).

**Fix A (recommended):** add a `Start="install"` ServiceControl that runs on
every install type, and keep the WriteConfigCA as NOT-Installed-only so we
don't overwrite an existing config:

```xml
<ServiceControl Id="AgentServiceControl"
                Name="MeridianAgent"
                Start="install"
                Stop="both"
                Remove="uninstall"
                Wait="yes" />
```

**Fix B:** change the `StartAgentServiceCA` condition from `NOT Installed` to
`NOT REMOVE` so it runs on both fresh install and upgrade, only skipped on
uninstall.

**Probable cause 2 — something about the MSI's file replacement leaves the
service host broken even when the binary itself is intact:** when reproducing
the fix, verify by running `InvAgent.exe --help` from
`C:\Program Files\MeridianAgent` after the reinstall. If it responds with
help text (it did before the failed upgrade), the binary is fine. If it
crashes with exit code 1, the MSI left something else inconsistent —
suspect .deps.json, .runtimeconfig.json, or the `wwwroot/` content files.

### Bug C (nice-to-have) — bump version strategy

Right now `Directory.Build.props` and `Product.wxs` both hardcode `1.0.0.2`.
For the next release they both need to change. Automate via a single env
var or `build-installer.ps1` param; otherwise they'll drift again and silent
"no-op" upgrades will return.

---

## Recovery for the dev machine CYBORWKS10

The service is currently broken on this box. Steps to get back to a working
agent:

1. Uninstall "Meridian Inventory Agent" via Control Panel → Programs and
   Features. This clears both the bad install state and the registered
   Windows service.
2. Keep `C:\ProgramData\Meridian\config.json` — it has the enrollment token
   and agent key. Back it up before uninstall if paranoid.
3. Install a freshly-built MSI (after Bug A is fixed and we know FileVersion
   is actually being stamped as 1.0.0.2). Use the Setup EXE or run
   `msiexec /i MeridianAgent.msi SERVER_URL="https://app-dev.meridianitsm.com" ENROLLMENT_TOKEN="19069587..." /quiet`.
4. Confirm:
   - `Get-Service MeridianAgent` shows Running
   - `(Get-Item 'C:\Program Files\MeridianAgent\InvAgent.exe').VersionInfo.FileVersion` is `1.0.0.2`
   - Within 5 min, new HEARTBEAT events appear in the dashboard Recent Events for CYBORWKS10
   - The stuck deployment in `/dashboard/settings/agent-updates/` flips PENDING → SUCCESS

---

## Pointers to what was touched in this session

Server-side (all committed, live on dev server 10.1.200.218):

- `apps/api/src/routes/v1/agents/index.ts` — heartbeat handler
  (versionChanged gating, event logging, shim route at the bottom)
- `apps/api/src/routes/v1/agents/updates.ts` — `packageHintSuffix()` helper
- `apps/api/src/services/change.service.ts` — `applyAgentDeployChangeTransition`
  uses packageHintSuffix via dynamic import
- `apps/api/src/__tests__/change-agent-deploy-hook.test.ts` — unit test with
  mocked agentEventLog.createMany

Agent-side (untouched — these are the fix targets):

- `apps/inventory-agent/Directory.Build.props` — source of truth for versions
- `apps/inventory-agent/src/InvAgent.Installers/windows/Product.wxs` — MSI source
- `apps/inventory-agent/build-installer.ps1` — builds the self-contained publish folder
- `apps/inventory-agent/src/InvAgent.Worker/UpdateInstaller.cs` line 31 — where
  the `.msi` / `.exe` decision happens
- `apps/inventory-agent/src/InvAgent.Worker/AgentWorker.cs` lines 155–172 —
  heartbeat response consumer (already handles `response.Update` correctly)

DB state on dev (`10.1.200.218`, Postgres `meridian`):

- `agent_updates` table has `v1.0.0.2 WINDOWS` pointing at
  `agent-updates/windows/1.0.0.2/agent-windows-1.0.0.2.msi` in MinIO.
- `agents.forceUpdateUrl` currently set to
  `api/v1/agents/updates/windows?file=agent.msi` on CYBORWKS10 and CYBORSVR01.
- Deployment CHG-7 is SCHEDULED (stuck behind the broken install), targets
  PENDING.

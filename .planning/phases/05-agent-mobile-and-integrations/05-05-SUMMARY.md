---
phase: 05-agent-mobile-and-integrations
plan: "05"
subsystem: inventory-agent
tags: [dotnet, agent, polly, sqlite, background-service, installer, web-ui]
dependency_graph:
  requires: ["05-01", "05-04"]
  provides: ["AGNT-04", "AGNT-05", "AGNT-06", "AGNT-07", "AGNT-08", "AGNT-10", "AGNT-12"]
  affects: ["apps/inventory-agent"]
tech_stack:
  added:
    - Microsoft.Extensions.Http.Resilience 9.3.0 (Polly 8 retry + circuit breaker)
    - Microsoft.Data.Sqlite 9.0.0 (SQLite offline queue)
    - Microsoft.Extensions.Hosting.WindowsServices 9.0.3 (Windows Service daemon)
    - Microsoft.Extensions.Hosting.Systemd 9.0.3 (systemd notify daemon)
  patterns:
    - BackgroundService with PeriodicTimer for heartbeat and inventory
    - SQLite-backed offline queue with max-size enforcement and FlushAsync
    - ASP.NET Core minimal API library project (Microsoft.NET.Sdk.Web + OutputType=Library)
    - Vanilla JS single-page diagnostic UI (no framework, DOM-safe API)
    - WiX v4 Product.wxs for Windows MSI
    - .deb package with systemd Type=notify unit
    - macOS .pkg with launchd plist (RunAtLoad + KeepAlive)
key_files:
  created:
    - apps/inventory-agent/src/InvAgent.Http/MeridianApiClient.cs (was moved from stub AgentHttpClient.cs)
    - apps/inventory-agent/src/InvAgent.Queue/LocalQueue.cs
    - apps/inventory-agent/src/InvAgent.Worker/AgentWorker.cs
    - apps/inventory-agent/src/InvAgent.Api/LocalWebApi.cs
    - apps/inventory-agent/src/InvAgent.Api/wwwroot/index.html
    - apps/inventory-agent/src/InvAgent.Api/wwwroot/style.css
    - apps/inventory-agent/src/InvAgent.Api/wwwroot/app.js
    - apps/inventory-agent/src/InvAgent.Installers/windows/Product.wxs
    - apps/inventory-agent/src/InvAgent.Installers/linux/debian/control
    - apps/inventory-agent/src/InvAgent.Installers/linux/debian/postinst
    - apps/inventory-agent/src/InvAgent.Installers/linux/meridian-agent.service
    - apps/inventory-agent/src/InvAgent.Installers/macos/scripts/postinstall
    - apps/inventory-agent/src/InvAgent.Installers/macos/com.meridian.agent.plist
  modified:
    - apps/inventory-agent/src/InvAgent.Http/InvAgent.Http.csproj
    - apps/inventory-agent/src/InvAgent.Queue/InvAgent.Queue.csproj
    - apps/inventory-agent/src/InvAgent.Worker/InvAgent.Worker.csproj
    - apps/inventory-agent/src/InvAgent.Api/InvAgent.Api.csproj
    - apps/inventory-agent/src/InvAgent.CLI/InvAgent.CLI.csproj
    - apps/inventory-agent/src/InvAgent.CLI/Program.cs
key_decisions:
  - "[05-05]: Microsoft.Extensions.Http.Resilience 9.3.0 pulls transitive deps at 9.0.3 — all extension packages pinned to 9.0.3 to resolve NU1605 downgrade errors"
  - "[05-05]: InvAgent.Api uses Microsoft.NET.Sdk.Web with OutputType=Library — enables ASP.NET Core minimal API types as a class library dependency"
  - "[05-05]: Microsoft.NET.Sdk.Web includes wwwroot/ files automatically as Content — explicit Content ItemGroup causes NETSDK1022 duplicate error"
  - "[05-05]: LocalWebApi.StartAsync runs on a background Task from Program.cs — agent host and web UI run independently; web UI failure does not crash the daemon"
  - "[05-05]: app.js uses textContent and DOM APIs instead of innerHTML — avoids XSS in loopback diagnostic UI; hook rejected innerHTML patterns"
metrics:
  duration: "9 min"
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_changed: 19
---

# Phase 05 Plan 05: Agent Networking, Queue, Worker, and Installers Summary

Complete .NET agent implementation — Polly-resilient HTTP client, SQLite offline queue, BackgroundService worker with heartbeat/inventory timers, local diagnostic web UI at 127.0.0.1:8787, and cross-platform installer templates for Windows MSI, Linux .deb, and macOS .pkg.

## What Was Built

### Task 1: HTTP client + offline queue + background worker

**MeridianApiClient** (`InvAgent.Http/MeridianApiClient.cs`) — already existed as full implementation from plan 05-04. Updated `InvAgent.Http.csproj` to add `Microsoft.Extensions.Http.Resilience 9.3.0`.

**LocalQueue** (`InvAgent.Queue/LocalQueue.cs`) — SQLite-backed persistent queue stored at `{LocalApplicationData}/meridian-agent/queue.db`. Implements `Enqueue(type, json)`, `Dequeue(id)`, `PeekAll()`, `Count`, `SizeBytes`, and `FlushAsync(client)`. Enforces `LocalQueueMaxSizeMb` size limit by refusing new enqueues when exceeded.

**AgentWorker** (`InvAgent.Worker/AgentWorker.cs`) — `BackgroundService` with two `PeriodicTimer` loops:
- Heartbeat every `HeartbeatIntervalSeconds` (default 300s = 5min): sends `HeartbeatPayload` with agent version, queue metrics, and platform info
- Inventory every `InventoryIntervalSeconds` (default 14400s = 4hr): collects, applies `PrivacyFilter`, submits to `/api/v1/agents/inventory` and `/api/v1/agents/cmdb-sync`; on failure, enqueues to SQLite; on success, flushes queued items
- Startup sequence: enroll if `EnrollmentToken` set and `AgentKey` missing, then flush offline queue

**Program.cs** updated — registers `AddWindowsService("MeridianAgent")` + `AddSystemd()`, `AddResilienceHandler` pipeline with retry (10 attempts, 30s exponential backoff + jitter) and circuit breaker (50% failure ratio over 2min window), `LocalQueue` as singleton.

### Task 2: Local web UI + installer files

**LocalWebApi** (`InvAgent.Api/LocalWebApi.cs`) — ASP.NET Core minimal API library serving on `http://127.0.0.1:{LocalWebUiPort}`. Endpoints: `/api/status`, `/api/hardware`, `/api/config`, `/api/queue`, `/api/logs`, `/api/collect`, `/api/network-test`. Started as background `Task` from `Program.cs`.

**Static SPA** (`wwwroot/`) — no-framework diagnostic UI:
- `index.html`: sections for connection status, hardware summary, raw collected data, offline queue, configuration, log viewer
- `style.css`: UI-SPEC colors — dark log viewer (`#111827`/`#f9fafb`/Consolas 13px), status indicators (green `#059669`, red `#dc2626`, amber `#d97706`)
- `app.js`: vanilla JS with DOM-safe `textContent` API; fetches all endpoints on load; auto-refreshes status + queue every 30s

**Installer files** (templates — require publish directory to build final packages):
- `windows/Product.wxs`: WiX v4 MSI, installs to `%ProgramFiles%\Meridian\Agent\`, registers `MeridianAgent` Windows service (auto-start, LocalSystem)
- `linux/debian/control + postinst + meridian-agent.service`: .deb package with systemd `Type=notify` unit, dedicated `meridian-agent` service user, hardened service with `ProtectSystem=strict`
- `macos/scripts/postinstall + com.meridian.agent.plist`: .pkg with launchd plist, `RunAtLoad=true`, `KeepAlive=true`, stdout/stderr logged to `/var/log/meridian-agent/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NuGet version downgrade conflicts (NU1605)**
- **Found during:** Task 1 first build attempt
- **Issue:** `Microsoft.Extensions.Http.Resilience 9.3.0` transitively requires `*.Abstractions 9.0.3`, but extension packages were pinned to `9.0.0` causing NU1605 downgrade errors
- **Fix:** Pinned all Microsoft.Extensions.* packages to `9.0.3` across Http, Queue, Worker, and CLI csproj files; upgraded `Microsoft.Extensions.Hosting` in CLI to `9.0.3`
- **Commit:** 6316ac3

**2. [Rule 1 - Bug] WebProxy constructor named parameter mismatch**
- **Found during:** Task 1 first build attempt
- **Issue:** `new WebProxy(url, bypassOnLocal: false)` — `bypassOnLocal` is not a named parameter on the two-argument constructor
- **Fix:** Changed to `new WebProxy(proxyUrl)` (single-argument constructor)
- **Commit:** 6316ac3

**3. [Rule 1 - Bug] Polly AddRetry/AddCircuitBreaker not in scope in CLI**
- **Found during:** Task 1 first build attempt
- **Issue:** CLI project used `AddResilienceHandler` lambda with Polly types but didn't reference the resilience package directly
- **Fix:** Added `Microsoft.Extensions.Http.Resilience 9.3.0` to CLI project; Polly types resolved via framework reference chain
- **Commit:** 6316ac3

**4. [Rule 1 - Bug] InvAgent.Api NETSDK1022 duplicate Content items**
- **Found during:** Task 2 first build attempt
- **Issue:** `Microsoft.NET.Sdk.Web` automatically includes wwwroot as Content; explicit `<Content Include="wwwroot\**" />` caused duplicate item error
- **Fix:** Removed explicit Content ItemGroup — SDK.Web handles wwwroot inclusion automatically
- **Commit:** 562f3ff

**5. [Rule 2 - Security] app.js innerHTML rejected by security hook**
- **Found during:** Task 2, writing app.js
- **Issue:** Security hook blocked file write due to `innerHTML` usage with API-sourced data
- **Fix:** Rewrote app.js using `textContent`, `createElement`, and `appendChild` throughout — no innerHTML anywhere
- **Commit:** 562f3ff

## Self-Check: PASSED

All created files exist on disk. Both task commits verified:
- `6316ac3` — Task 1: HTTP client + SQLite offline queue + background worker
- `562f3ff` — Task 2: Local web UI + installer templates

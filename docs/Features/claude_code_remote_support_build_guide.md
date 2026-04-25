# Claude Code Build Guide: Remote Support Integration for an Existing Agent

## Purpose

Use this guide to add **remote support / remote control** capabilities to an **existing cross-platform agent application** rather than building a brand-new standalone product.

The end goal is an integrated remote support feature set similar in spirit to Splashtop, TeamViewer, or AnyDesk, but implemented as a capability inside the existing agent.

This guide is written so Claude Code can use it as an implementation blueprint.

---

# 1. Core Build Objective

Extend the existing agent so it can:

- register itself as remote-support capable
- accept attended and unattended support sessions
- capture the local screen
- stream the screen to an operator console
- receive remote keyboard and mouse input
- inject that input locally
- synchronize clipboard text
- transfer files
- report session state, health, and audit events
- enforce permissions and tenant policy
- run on **Windows, macOS, and Linux**

This must be implemented as an **integration into the current agent**, not as a separate unrelated application.

---

# 2. Primary Product Strategy

## 2.1 Do not rebuild the existing agent

Claude must assume there is already an agent with some or all of the following:

- installer / packaging
- service or daemon lifecycle
- configuration management
- backend enrollment / registration
- heartbeat / telemetry
- update channel
- logging
- authentication to the backend

The remote support feature must plug into those existing primitives wherever possible.

## 2.2 Build remote support as a subsystem

Implement remote support as a subsystem composed of:

1. **Remote Support Core**
   - session orchestration
   - policy enforcement
   - transport management
   - device capability reporting

2. **Screen Capture Adapter**
   - OS-specific screen/window capture

3. **Input Injection Adapter**
   - OS-specific keyboard/mouse input injection

4. **Clipboard Adapter**
   - text clipboard sync

5. **File Transfer Module**
   - upload/download support with chunking and resume

6. **Signaling Integration**
   - session negotiation through existing backend and/or signaling service

7. **Operator Console Integration**
   - a technician-facing application or module that can view/control the endpoint

## 2.3 Prefer modular integration boundaries

If the existing agent is large or written in a language that is not ideal for high-performance capture and input control, create a **native remote-support module** that the agent hosts or launches.

Recommended pattern:

- existing agent remains the parent/orchestrator
- remote support module runs as an internal component, subprocess, or dynamically linked module
- the parent agent handles:
  - config
  - auth
  - heartbeat
  - policy
  - logging funnel
  - update lifecycle
- the remote support module handles:
  - screen capture
  - WebRTC session transport
  - input injection
  - clipboard
  - file transfer

This keeps privileged/native code separated from general application logic.

---

# 3. Technology Recommendation

## 3.1 Recommended implementation stack

Use the following unless the existing agent architecture strongly requires otherwise:

- **Rust** for remote support core and platform adapters
- **WebRTC** for media streaming and real-time control transport
- **WebSocket over TLS** for signaling
- **STUN/TURN** for NAT traversal
- **coturn** for TURN/STUN infrastructure
- **Tauri + React + TypeScript** for operator console if a desktop UI is needed
- **PostgreSQL** for backend metadata
- **Redis** optional for ephemeral session state and pub/sub

## 3.2 Why this stack

Rust is a strong fit because the feature set includes:

- native OS APIs
- service-safe behavior
- low latency media/control paths
- security-sensitive code
- performance-sensitive capture and encoding

WebRTC is preferred because it already solves:

- encrypted real-time media transport
- NAT traversal with ICE/STUN/TURN
- peer connection negotiation
- data channels for input/clipboard/file metadata

---

# 4. Existing Agent Integration Assumptions

Claude must assume the existing agent already has some way to do the following. If it does not, implement only the missing pieces.

## 4.1 Existing agent capabilities to reuse

Reuse these if present:

- agent identity
- tenant / organization assignment
- enrollment token handling
- backend API client
- local config storage
- local log pipeline
- service/daemon lifecycle
- update mechanism
- health reporting
- permission diagnostics UI

## 4.2 New capabilities to add to the existing agent

Add these new capabilities:

- `remote_support.enabled`
- `remote_support.capabilities`
- `remote_support.session_state`
- `remote_support.permissions`
- `remote_support.operator_presence`
- `remote_support.audit`
- `remote_support.transfer`
- `remote_support.clipboard`

## 4.3 Integration contract

The remote support subsystem must expose a clean contract to the main agent.

Example internal contract:

```ts
interface RemoteSupportModule {
  initialize(config: RemoteSupportConfig): Promise<void>
  getCapabilities(): Promise<DeviceCapabilities>
  getPermissions(): Promise<PermissionState>
  startAttendedSession(request: SessionRequest): Promise<SessionHandle>
  startUnattendedSession(request: SessionRequest): Promise<SessionHandle>
  endSession(sessionId: string, reason: string): Promise<void>
  handlePolicyUpdate(policy: RemoteSupportPolicy): Promise<void>
  getDiagnostics(): Promise<RemoteSupportDiagnostics>
}
```

If the main agent and remote support subsystem are separate processes, use an internal IPC contract over:

- Unix domain sockets on macOS/Linux
- named pipes on Windows
- gRPC or JSON-RPC internally if needed

---

# 5. Supported Platforms and Practical Boundaries

## 5.1 Windows

Must support:

- attended support
- unattended support
- full desktop capture
- multi-monitor support
- keyboard/mouse control
- clipboard text sync
- file transfer
- service mode

Preferred APIs:

- screen capture: `Windows.Graphics.Capture`
- input injection: `SendInput`

## 5.2 macOS

Must support:

- attended support
- unattended support where permissions allow
- desktop capture
- multi-monitor support
- keyboard/mouse control
- clipboard text sync
- file transfer

Preferred APIs:

- screen capture: `ScreenCaptureKit`
- input injection: Quartz / `CGEventPost`

macOS requires explicit permission handling for:

- Screen Recording
- Accessibility
- potentially Input Monitoring depending on approach

## 5.3 Linux

Must support, at minimum:

- attended support on mainstream desktop environments
- desktop capture
- clipboard text sync
- file transfer

Linux implementation must explicitly distinguish:

### X11
- more complete capture/control support
- input injection feasible with XTEST

### Wayland
- capture should use desktop portal + PipeWire where available
- remote control support may be restricted or inconsistent by compositor
- some unattended control scenarios may be unsupported or limited

Claude must **not** assume identical feature parity between X11 and Wayland.

---

# 6. Functional Requirements

## 6.1 Session types

### Attended session

Flow:

1. local user launches agent UI or support panel
2. agent generates one-time support code or support link
3. operator enters code in console
4. endpoint displays approval prompt
5. user approves screen sharing and optionally control
6. session starts

### Unattended session

Flow:

1. device is enrolled with persistent identity
2. policy determines who can access it
3. operator requests connection
4. endpoint validates operator authorization
5. session begins according to policy:
   - no local approval required
   - or local approval required
   - or notification-only policy

## 6.2 Remote display

Implement:

- full desktop capture
- display selection
- multi-monitor switching
- dynamic resolution changes
- cursor visibility
- reconnect after display topology changes
- adaptive bitrate and framerate

## 6.3 Remote input

Implement:

- mouse move
- left/right/middle click
- double click
- drag
- wheel scroll
- keyboard down/up
- modifiers
- text input
- common shortcuts

## 6.4 Clipboard

Phase 1:

- text only
- optional one-way or two-way sync

Phase 2:

- richer clipboard types if justified

## 6.5 File transfer

Implement:

- upload from operator to endpoint
- download from endpoint to operator
- explicit per-session permission policy
- progress reporting
- chunked transfer
- integrity verification
- resume support

## 6.6 Audit and observability

Record:

- session created
- session approved/rejected
- session started/ended
- operator identity
- target device identity
- policy decisions
- clipboard enabled/disabled
- file transfer metadata
- permission failures
- relay vs direct session path

---

# 7. Non-Functional Requirements

- low-latency interaction
- resilient reconnect behavior
- secure by default
- auditable by tenant
- modular platform abstractions
- feature flags per OS
- safe failure behavior
- structured logs
- versioned wire protocols
- no hidden privilege escalation

---

# 8. Transport and Network Design

## 8.1 Signaling

Use **WebSocket over TLS** for signaling between:

- operator console and backend
- endpoint agent and backend

Signaling responsibilities:

- auth verification
- device presence
- session request / approve / reject
- SDP offer / answer exchange
- ICE candidate exchange
- reconnect coordination
- policy checks

## 8.2 Media and control transport

Use **WebRTC peer connection** for:

- remote screen video stream
- data channel for control messages

Recommended data channel usage:

- `control` channel for keyboard/mouse messages
- `clipboard` channel for clipboard sync
- `transfer` channel for file transfer control messages
- `telemetry` channel for ping/stats/health

## 8.3 NAT traversal

Use:

- STUN first
- TURN fallback
- forced TURN option for constrained networks

Backend must supply ICE server list dynamically.

## 8.4 Connection strategy

Priority order:

1. direct peer path
2. relay through TURN
3. if WebRTC fails completely, mark session as failed with explicit diagnostics

Do not implement a proprietary insecure raw TCP fallback.

---

# 9. Session State Machine

Claude must implement an explicit session state machine.

## 9.1 Endpoint-side session states

```text
IDLE
REQUESTED
AWAITING_LOCAL_APPROVAL
APPROVED
NEGOTIATING
CONNECTING
ACTIVE_VIEW_ONLY
ACTIVE_CONTROLLED
RECONNECTING
TERMINATING
TERMINATED
FAILED
```

## 9.2 Operator-side session states

```text
IDLE
REQUESTING
WAITING_FOR_APPROVAL
NEGOTIATING
CONNECTING
ACTIVE
RECONNECTING
ENDED
FAILED
```

## 9.3 State transition rules

Claude must define and implement valid transitions only.

Examples:

- `REQUESTED -> AWAITING_LOCAL_APPROVAL`
- `REQUESTED -> NEGOTIATING` if unattended and policy permits
- `AWAITING_LOCAL_APPROVAL -> APPROVED`
- `APPROVED -> NEGOTIATING`
- `NEGOTIATING -> CONNECTING`
- `CONNECTING -> ACTIVE_VIEW_ONLY | ACTIVE_CONTROLLED`
- `ACTIVE_* -> RECONNECTING` on transient transport loss
- `ACTIVE_* -> TERMINATING` on operator disconnect, policy revoke, permission loss, or user stop
- any state -> `FAILED` on unrecoverable error

## 9.4 Timeouts

Recommended initial values:

- approval timeout: 120 seconds
- negotiation timeout: 30 seconds
- ICE gathering timeout: 20 seconds
- reconnect grace period: 60 seconds
- idle attended code expiration: 10 minutes

Make these server-configurable.

---

# 10. Protocol Definitions

## 10.1 Signaling message envelope

```json
{
  "type": "session.request",
  "version": 1,
  "requestId": "uuid",
  "timestamp": "2026-04-04T12:00:00Z",
  "tenantId": "tenant_123",
  "deviceId": "device_456",
  "operatorId": "operator_789",
  "payload": {}
}
```

## 10.2 Core signaling message types

Implement at minimum:

- `device.capabilities`
- `device.permissions`
- `session.request`
- `session.approval_required`
- `session.approved`
- `session.rejected`
- `session.offer`
- `session.answer`
- `session.ice_candidate`
- `session.connected`
- `session.transport_stats`
- `session.reconnect`
- `session.terminate`
- `session.audit_event`

## 10.3 Control message schema

```json
{
  "type": "mouse.move",
  "seq": 101,
  "displayId": "display-1",
  "x": 0.5231,
  "y": 0.1822
}
```

Additional control messages:

- `mouse.down`
- `mouse.up`
- `mouse.wheel`
- `key.down`
- `key.up`
- `text.input`
- `control.mode.set`
- `cursor.sync`

Use normalized coordinates per display so differing resolutions can be handled cleanly.

## 10.4 Clipboard messages

```json
{
  "type": "clipboard.set_text",
  "seq": 55,
  "direction": "operator_to_endpoint",
  "text": "hello world"
}
```

## 10.5 File transfer messages

```json
{
  "type": "file.offer",
  "transferId": "uuid",
  "name": "example.txt",
  "size": 24018,
  "sha256": "hex_digest",
  "direction": "operator_to_endpoint"
}
```

Other transfer messages:

- `file.accept`
- `file.reject`
- `file.chunk`
- `file.progress`
- `file.complete`
- `file.cancel`
- `file.error`
- `file.resume_request`

---

# 11. Platform Adapter Requirements

## 11.1 Screen capture abstraction

Implement a common interface:

```rust
pub trait ScreenCapturer {
    fn list_sources(&self) -> Result<Vec<CaptureSource>, CaptureError>;
    fn start(&mut self, source: CaptureSource, config: CaptureConfig) -> Result<(), CaptureError>;
    fn next_frame(&mut self) -> Result<CapturedFrame, CaptureError>;
    fn stop(&mut self) -> Result<(), CaptureError>;
}
```

### Capture requirements

- enumerate displays
- enumerate windows where available
- track resolution and scaling
- capture cursor state or overlay it consistently
- handle display hot-plugging
- handle lock/unlock transitions

## 11.2 Input injection abstraction

```rust
pub trait InputInjector {
    fn mouse_move(&self, display_id: &str, x: f32, y: f32) -> Result<(), InputError>;
    fn mouse_button(&self, button: MouseButton, state: KeyState) -> Result<(), InputError>;
    fn mouse_wheel(&self, delta_x: i32, delta_y: i32) -> Result<(), InputError>;
    fn key_event(&self, key: KeyCode, state: KeyState, modifiers: Modifiers) -> Result<(), InputError>;
    fn text_input(&self, text: &str) -> Result<(), InputError>;
}
```

### Input rules

- reject control input if session is view-only
- reject control input if local permission has been revoked
- map platform key codes carefully
- preserve modifier state consistency
- log policy-blocked events without logging sensitive content

## 11.3 Clipboard abstraction

```rust
pub trait ClipboardAdapter {
    fn get_text(&self) -> Result<Option<String>, ClipboardError>;
    fn set_text(&self, text: &str) -> Result<(), ClipboardError>;
}
```

## 11.4 File transfer abstraction

```rust
pub trait FileTransferAdapter {
    fn prepare_receive(&self, metadata: FileMetadata) -> Result<ReceiveHandle, TransferError>;
    fn write_chunk(&self, handle: &ReceiveHandle, offset: u64, data: &[u8]) -> Result<(), TransferError>;
    fn finalize(&self, handle: ReceiveHandle) -> Result<(), TransferError>;
    fn cancel(&self, handle: ReceiveHandle) -> Result<(), TransferError>;
}
```

---

# 12. Video Pipeline Design

## 12.1 Frame pipeline

The endpoint must:

1. capture raw frame
2. convert pixel format if necessary
3. encode frame
4. send through WebRTC video track
5. emit transport stats

## 12.2 Adaptive behavior

Implement dynamic adjustment for:

- target resolution
- frame rate
- bitrate
- keyframe interval

Suggested initial targets:

- idle desktop: 5–10 fps allowed
- active interaction: 15–30 fps target
- dynamic resolution downscale on poor network conditions

## 12.3 Multi-monitor behavior

Implement one of these initial strategies:

### Phase 1 preferred
- single active monitor at a time, operator can switch

### Phase 2 optional
- simultaneous multiple monitor streams

Phase 1 is simpler and should be shipped first.

## 12.4 Cursor handling

Choose one approach and keep it consistent:

- include cursor in capture stream
- or send cursor separately and render in viewer

Separate cursor sync can reduce perceived latency if done well.

---

# 13. Permission and Privilege Matrix

Claude must build a permission diagnostic layer.

## 13.1 Windows

Track whether:

- screen capture is available
- input injection is available
- current user context can interact with target desktop
- elevated/UAC contexts are limited

## 13.2 macOS

Track whether:

- Screen Recording permission granted
- Accessibility permission granted
- app is signed and notarized correctly
- TCC-related failures can be diagnosed clearly

## 13.3 Linux

Track whether:

- session is X11 or Wayland
- PipeWire available
- desktop portal available
- compositor allows requested mode
- XTEST available on X11

## 13.4 Permission UX requirements

The local endpoint UI must show:

- missing permissions
- what feature is blocked
- how to fix it
- whether restart is required

Do not fail silently.

---

# 14. Backend Requirements

If backend pieces do not already exist, implement them.

## 14.1 Required backend services

### Auth service
- operator authentication
- token issuance
- MFA-ready integration
- RBAC claims

### Device service
- device enrollment
- device metadata
- capability reporting
- group membership
- online/offline status

### Session service
- session request lifecycle
- approval decisions
- session policy checks
- session audit trail

### Signaling service
- WebSocket session brokering
- offer/answer exchange
- ICE candidate forwarding
- reconnect coordination

### Audit service
- immutable-ish audit records
- retention policy
- searchable event stream

## 14.2 Minimal REST API design

Implement these initial endpoints if not already available:

### Devices
- `GET /devices`
- `GET /devices/{id}`
- `POST /devices/{id}/capabilities`
- `POST /devices/{id}/permissions`
- `POST /devices/{id}/heartbeat`

### Sessions
- `POST /sessions`
- `GET /sessions/{id}`
- `POST /sessions/{id}/approve`
- `POST /sessions/{id}/reject`
- `POST /sessions/{id}/terminate`
- `POST /sessions/{id}/mode`

### Transfers
- `POST /sessions/{id}/transfers`
- `GET /sessions/{id}/transfers/{transferId}`
- `POST /sessions/{id}/transfers/{transferId}/cancel`

### Audit
- `GET /audit/events`
- `GET /audit/sessions/{id}`

## 14.3 WebSocket signaling channels

Provide authenticated channels for:

- operator connections
- endpoint agent connections
- internal session routing

---

# 15. Database Model

Claude should create an initial schema with these entities.

## 15.1 Core tables

- `tenants`
- `users`
- `roles`
- `user_roles`
- `devices`
- `device_groups`
- `device_group_membership`
- `device_capabilities`
- `device_permissions`
- `sessions`
- `session_participants`
- `session_events`
- `transfers`
- `transfer_chunks` (optional if persisted)
- `audit_events`

## 15.2 Important fields

### devices
- id
- tenant_id
- hostname
- os_family
- os_version
- agent_version
- remote_support_enabled
- enrollment_state
- last_seen_at
- current_user
- online_state

### sessions
- id
- tenant_id
- device_id
- operator_id
- mode
- approval_mode
- started_at
- ended_at
- termination_reason
- transport_path
- recording_enabled

### audit_events
- id
- tenant_id
- actor_type
- actor_id
- device_id
- session_id
- event_type
- event_summary
- created_at
- metadata_json

---

# 16. RBAC and Policy Model

## 16.1 Roles

Implement at least:

- `tenant_admin`
- `support_admin`
- `technician`
- `auditor`

## 16.2 Policy controls

Support policy toggles for:

- attended sessions allowed
- unattended sessions allowed
- local approval required
- view-only allowed
- remote control allowed
- clipboard allowed
- file transfer allowed
- session recording required
- notification banner required
- outside-business-hours access allowed

## 16.3 Device scoping

Authorization must be scoped by:

- tenant
- device group
- operator role
- policy

Do not allow broad cross-tenant access.

---

# 17. Installer and Update Requirements

Claude must integrate with the existing agent installer/update model whenever possible.

## 17.1 Windows

- MSI or existing installer path
- register/update Windows service as needed
- install remote support module binaries
- preserve existing config and enrollment

## 17.2 macOS

- PKG/DMG or existing distribution path
- install launch agents/daemons if needed
- ensure signing and notarization pipeline includes remote support binaries

## 17.3 Linux

- DEB/RPM/AppImage or existing packaging path
- systemd service integration
- clear post-install permission diagnostics

## 17.4 Auto-update rules

- do not break enrollment identity
- support rollback on failed update
- version remote support protocol independently if needed
- ensure old agents fail gracefully when backend introduces newer features

---

# 18. Logging, Metrics, and Diagnostics

## 18.1 Structured logging

Every module must emit structured logs with:

- timestamp
- component
- device/session id
- severity
- event name
- error code
- safe metadata

## 18.2 Do not log sensitive data

Do not log:

- raw keystrokes
- clipboard contents
- file contents
- screen contents
- session secrets

## 18.3 Metrics

Record:

- session startup time
- connection success rate
- direct vs relay ratio
- frame rate
- bitrate
- reconnect count
- permission failure count
- transfer success/failure

## 18.4 Support bundle

Implement a support bundle exporter that can collect:

- recent logs
- agent version
- OS info
- permission state
- session diagnostics
- network path diagnostics

---

# 19. Security Requirements

## 19.1 Authentication and session control

- operators authenticate through backend
- session authorization decided server-side
- short-lived session tokens
- device identity must be cryptographic where possible

## 19.2 Transport security

- TLS for signaling/control plane
- DTLS/SRTP for WebRTC media/data
- signed binaries and verified updates

## 19.3 Abuse prevention

Implement:

- join code expiration
- join code rate limiting
- brute force protections
- device-side control indicator
- local session stop button where appropriate
- operator identity display on endpoint

## 19.4 Data protection

- clipboard and transfer features can be disabled by policy
- record metadata for transfers, not content
- do not store session recordings unless explicitly enabled

---

# 20. UI and UX Requirements

## 20.1 Endpoint UI

Implement screens for:

- attended support code display
- approval prompt
- active session indicator
- permission diagnostics
- session termination notice

## 20.2 Operator console

Implement screens for:

- login
- device search/list
- session request dialog
- waiting-for-approval state
- remote viewer
- monitor switcher
- clipboard/file transfer controls
- connection diagnostics
- session audit summary

## 20.3 UX rules

- clearly distinguish view-only vs controlled sessions
- always display current operator identity to the endpoint user when attended
- show missing permissions before attempting session start when possible
- show reconnect state explicitly

---

# 21. Repository Layout

If the remote support subsystem is added to an existing monorepo, create a structure similar to this:

```text
agent-platform/
  apps/
    operator-console/
    endpoint-ui/
  crates/
    remote-support-core/
    signaling-client/
    session-protocol/
    capture-windows/
    capture-macos/
    capture-linux/
    input-windows/
    input-macos/
    input-linux/
    clipboard-sync/
    file-transfer/
    diagnostics/
  services/
    signaling-service/
    session-service/
    audit-service/
  docs/
    remote-support/
      architecture.md
      protocol.md
      permissions.md
      rollout.md
```

If the existing agent is not Rust-based, adapt this into:

- host application
- native remote support sidecar
- platform adapters
- signaling/backend modules

---

# 22. Development Milestones

## Milestone 1: Local architecture and abstractions

Build:

- module interfaces
- session state machine
- platform capability detection
- permission diagnostics
- backend contracts

Acceptance criteria:

- project builds on all target OSes
- remote support module loads into agent
- capabilities are reported to backend

## Milestone 2: Attended view-only session

Build:

- support code flow
- signaling
- WebRTC screen stream
- operator viewer

Acceptance criteria:

- operator can view endpoint desktop on same LAN and through TURN
- approval prompt works
- session start/end audited

## Milestone 3: Remote control

Build:

- input data channel
- input injection adapters
- view-only/control mode switching

Acceptance criteria:

- operator can move mouse and type on Windows/macOS
- Linux X11 control works
- unsupported Wayland modes fail with clear UX

## Milestone 4: Clipboard and file transfer

Build:

- text clipboard sync
- file offer/accept/chunk/complete
- transfer progress UI

Acceptance criteria:

- policy can disable either feature
- integrity checks pass
- audit metadata recorded

## Milestone 5: Unattended access and hardening

Build:

- device enrollment linkage
- unattended policy checks
- reconnect logic
- diagnostics bundle
- update compatibility tests

Acceptance criteria:

- authorized operator can access enrolled device without local approval when policy allows
- reconnect works after transient network loss
- support bundle export works

---

# 23. Testing Strategy

## 23.1 Unit tests

Write tests for:

- session state machine
- protocol message validation
- policy decisions
- file chunk assembly
- clipboard dedupe logic

## 23.2 Platform adapter tests

Write adapter-level tests for:

- source enumeration
- permission state detection
- unsupported feature handling
- coordinate mapping
- key mapping

## 23.3 Integration tests

Write integration tests for:

- session request to connect flow
- approval and rejection flow
- reconnect after transport interruption
- direct vs relay session negotiation
- file transfer happy path and resume

## 23.4 Manual validation matrix

Validate on:

- Windows 10/11
- recent macOS
- Ubuntu X11
- Ubuntu Wayland
- KDE if supported

## 23.5 Failure scenarios

Test:

- no Screen Recording permission
- no Accessibility permission
- TURN required
- display unplug during session
- clipboard blocked by policy
- session revoked mid-control
- operator disconnect/reconnect

---

# 24. Claude Code Implementation Rules

Claude must follow these rules while building.

## 24.1 Integration-first rule

Do not create a totally separate remote support app unless necessary.
Always integrate with the existing agent lifecycle, auth model, config model, and logging model.

## 24.2 Explicit boundaries rule

Keep these boundaries clean:

- UI vs native control logic
- policy vs transport
- signaling vs media
- agent orchestration vs platform adapters

## 24.3 No fake cross-platform parity rule

If a feature is not reliably possible on a target OS or display server, mark it unsupported and return a clear diagnostic.
Do not ship silent degradation.

## 24.4 Security rule

Do not include placeholder security logic in final code.
Do not bypass auth or policy checks for convenience.
Do not log sensitive content.

## 24.5 Delivery rule

Ship in phases:

1. attended view-only
2. attended control
3. unattended access
4. clipboard/file transfer
5. hardening and scale

---

# 25. Concrete Task Breakdown for Claude Code

## Task Group A: Foundation

- inspect existing agent architecture
- identify config, auth, heartbeat, logging, updater, and IPC hooks
- create remote support subsystem design doc in repository
- add shared protocol package
- add session state machine implementation

## Task Group B: Backend and signaling

- add session APIs
- add signaling WebSocket server or route
- implement operator/device connection auth
- add ICE config delivery
- add audit event persistence

## Task Group C: Endpoint capture and control

- implement screen capture adapters
- implement input injection adapters
- implement capability/permission detection
- implement session active indicator

## Task Group D: Operator console

- add device list / search
- add session request dialog
- add viewer component
- add session toolbar
- add monitor switch action
- add diagnostics UI

## Task Group E: Clipboard and transfers

- implement clipboard data channel flow
- implement file transfer protocol
- add progress and cancel UI
- add policy enforcement hooks

## Task Group F: Hardening

- add reconnect logic
- add support bundle export
- add metrics and tracing
- add update compatibility tests
- add documentation

---

# 26. Initial Deliverables Claude Should Produce

Claude should generate the following in the repository:

1. architecture document
2. protocol schemas
3. remote support module scaffold
4. backend session/signaling scaffold
5. operator console scaffold
6. platform adapter stubs
7. permission diagnostics layer
8. test plan
9. rollout document

---

# 27. Definition of Done

The feature is considered done only when:

- the existing agent can advertise remote support capability
- an operator can initiate an attended session
- the endpoint can approve the session
- screen sharing works on Windows, macOS, and at least one Linux path
- remote input works where supported
- unsupported modes fail clearly and safely
- session events are audited
- tenant and policy checks are enforced
- diagnostics can explain permission failures
- packaging/update path includes the remote support subsystem

---

# 28. Final Instruction to Claude Code

Implement remote support as a **secure, modular capability inside the existing agent**.

Do not optimize for the fastest prototype at the expense of:

- platform correctness
- permission handling
- security
- auditability
- maintainability

Prioritize a stable attended support flow first, then add control, then unattended access, then clipboard/file transfer, then hardening.

When uncertain, prefer:

- explicit state machines
- versioned protocols
- platform adapters behind traits/interfaces
- strict policy enforcement
- clear diagnostics


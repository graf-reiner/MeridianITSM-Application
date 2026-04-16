---
phase: 05-agent-mobile-and-integrations
plan: 08
subsystem: mobile
tags: [expo, react-native, push-notifications, expo-notifications, expo-device, netinfo, zustand, tanstack-query, asyncstorage, offline, deep-linking]

# Dependency graph
requires:
  - phase: 05-03
    provides: Push notification API endpoints (POST /api/v1/push/register, GET/PATCH /api/v1/push/preferences)
  - phase: 05-07
    provides: Mobile app scaffold with navigation, ticket screens, auth store

provides:
  - Push token registration via expo-notifications with device fingerprint
  - Deep link routing from notification taps to correct screens (ticket/asset/article)
  - Per-type push preferences screen with 12 notification type toggles
  - Offline write queue (Zustand + AsyncStorage) with replay-on-reconnect
  - TanStack Query cache persistence to AsyncStorage for offline reading (24h)
  - OfflineBanner component displayed when NetInfo detects disconnection
  - Optimistic writes for useAddComment and useUpdateTicket mutations
  - Server-wins conflict resolution (409 dequeues without retry)

affects:
  - Any future mobile features that add mutations (use offline queue pattern)
  - Push notification server endpoints (05-03)

# Tech tracking
tech-stack:
  added:
    - expo-device ~55.0.10 (Device.isDevice check, Device.modelId for token registration)
    - "@react-native-community/netinfo" (connectivity monitoring for offline detection)
    - PersistQueryClientProvider + createAsyncStoragePersister (TanStack Query offline cache)
  patterns:
    - Offline queue pattern: Zustand store persisted to AsyncStorage, replayed on NetInfo reconnect
    - Optimistic mutation pattern: onMutate applies cache update, onError reverts, onSuccess invalidates
    - Server-wins conflict: 409 response dequeues item without retry or merge
    - Push registration guard: Device.isDevice prevents simulator errors, silent failure on denial
    - Push token registration wired to auth token presence (re-registers after login)

key-files:
  created:
    - apps/mobile/src/hooks/usePushNotifications.ts
    - apps/mobile/src/hooks/useOfflineSync.ts
    - apps/mobile/src/stores/offline.store.ts
    - apps/mobile/src/components/OfflineBanner.tsx
  modified:
    - apps/mobile/App.tsx (PersistQueryClientProvider, AppContent component, usePushNotifications + useOfflineSync wired)
    - apps/mobile/src/screens/profile/PushPreferencesScreen.tsx (full implementation from stub)
    - apps/mobile/src/api/tickets.ts (offline queue + optimistic writes for mutations)
    - apps/mobile/package.json (expo-device added)
    - pnpm-lock.yaml

key-decisions:
  - "expo-device added as explicit dependency — not installed by default despite being expo-notifications peer"
  - "Offline photos not queued — useAddComment offline path queues text-only (FormData binary blobs not serializable to AsyncStorage)"
  - "useOfflineSync passes dequeue as argument to replayQueue — avoids closure over stale Zustand state in async for-loop"
  - "linking.ts kept at existing routes (tickets/:id) — plan snippet showed ticket/:id but existing canonical linking had plural form; push notification handler uses navigate() not URL scheme matching"
  - "PersistQueryClientProvider replaces QueryClientProvider globally — gcTime set to 24h to match persister maxAge"

patterns-established:
  - "Offline queue pattern: enqueue() in mutation mutationFn when !isOnline, replay in useOfflineSync on reconnect"
  - "Optimistic mutation: onMutate snapshot + cache update, onError revert, onSuccess invalidate"
  - "Push notification routing: response.notification.request.content.data.screen drives navigation.navigate()"

requirements-completed:
  - MOBL-07
  - MOBL-08
  - MOBL-09
  - MOBL-11

# Metrics
duration: 15min
completed: 2026-03-23
---

# Phase 05 Plan 08: Push Notifications and Offline Support Summary

**Expo push token registration with deep link routing, per-type notification preferences, offline write queue with NetInfo replay, and TanStack Query cache persistence for field technician connectivity resilience**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-23T21:34:46Z
- **Completed:** 2026-03-23T21:49:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Push notification flow complete: permission request, expo token registration via POST /api/v1/push/register, Android channel setup, notification tap routing to ticket/asset/article screens
- PushPreferencesScreen implemented with 12 per-type Switch toggles in 4 groups (Tickets/SLA/Changes/General), GET/PATCH /api/v1/push/preferences, permission banner with Settings deep link
- Offline system: Zustand queue persisted to AsyncStorage, NetInfo connection monitoring, replay on reconnect with server-wins conflict resolution, OfflineBanner component (#fef3c7/#92400e, 13px)
- TanStack Query cache persisted to AsyncStorage via PersistQueryClientProvider (24h maxAge)
- Optimistic writes in useAddComment and useUpdateTicket (snapshot → apply → revert on error)

## Task Commits

1. **Task 1: Push notifications + deep linking** - `605cef8` (feat)
2. **Task 2: Offline support + TanStack Query persistence** - `1b74eee` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `apps/mobile/src/hooks/usePushNotifications.ts` - Push token registration, permission flow, notification tap deep link routing
- `apps/mobile/src/hooks/useOfflineSync.ts` - NetInfo listener, isOnline state sync, queue replay with conflict handling
- `apps/mobile/src/stores/offline.store.ts` - Zustand PendingWrite queue with AsyncStorage persistence
- `apps/mobile/src/components/OfflineBanner.tsx` - Offline indicator (#fef3c7 background, #92400e text, 13px)
- `apps/mobile/App.tsx` - Migrated to PersistQueryClientProvider, added AppContent with usePushNotifications + useOfflineSync + OfflineBanner
- `apps/mobile/src/screens/profile/PushPreferencesScreen.tsx` - Full implementation: 12 notification type toggles, grouped by category, permission banner
- `apps/mobile/src/api/tickets.ts` - useAddComment + useUpdateTicket with optimistic writes and offline queue; useCreateTicket offline queuing

## Decisions Made

- `expo-device` added as explicit dependency — not installed by default alongside expo-notifications, but required for `Device.isDevice` and `Device.modelId` in token registration
- Offline photos not queued — useAddComment offline path stores text-only payload; FormData binary blobs cannot be serialized to AsyncStorage JSON
- `useOfflineSync` passes `dequeue` as argument to `replayQueue` to avoid stale Zustand closure in async iteration
- `linking.ts` kept with existing `tickets/:id` paths — push notification routing uses `navigation.navigate()` not URL scheme parsing, so the format difference is irrelevant to push routing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed expo-device**
- **Found during:** Task 1 (usePushNotifications.ts)
- **Issue:** `expo-device` not installed — required for `Device.isDevice` and `Device.modelId` in push token registration
- **Fix:** `npx expo install expo-device` — version ~55.0.10 added to package.json
- **Files modified:** apps/mobile/package.json, pnpm-lock.yaml
- **Verification:** TypeScript import resolves; TS error for expo-device gone
- **Committed in:** 605cef8 (Task 1 commit)

**2. [Rule 3 - Blocking] Installed @react-native-community/netinfo**
- **Found during:** Task 2 (useOfflineSync.ts)
- **Issue:** `@react-native-community/netinfo` not installed — required for connectivity monitoring
- **Fix:** `npx expo install @react-native-community/netinfo`
- **Files modified:** pnpm-lock.yaml
- **Verification:** TypeScript import resolves; NetInfo.addEventListener compiles
- **Committed in:** 1b74eee (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking — missing dependencies)
**Impact on plan:** Both fixes are infrastructure prerequisites for the plan's stated approach. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in `AppTabs.tsx` (MaterialCommunityIcons JSX type) and `RootNavigator.tsx` (headerBackTitleVisible) — out of scope per deviation rules; all new files compile cleanly

## User Setup Required

None - no external service configuration required beyond expo-notifications APNs setup documented in Phase 05-03 blocker.

## Next Phase Readiness

- Push and offline infrastructure complete — mobile app ready for final integration testing
- APNs credentials still needed for iOS production push (documented blocker from Phase 5 research)
- Phase 05 plan 08 of 9 complete

---
*Phase: 05-agent-mobile-and-integrations*
*Completed: 2026-03-23*

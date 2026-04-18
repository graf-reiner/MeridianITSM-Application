# Phase 8 — Deferred Items

Items discovered during plan execution that are out-of-scope for the current wave's file list. Tracked for planner follow-up (Phase 9 or a bugfix sweep).

## Discovered during plan 08-06 (Wave 5) Task 1

### Surviving `asset.hostname`-style references in apps/mobile + apps/web/portal

Phase 8 plan 06 `<files_modified>` lists ONLY `apps/web/src/app/dashboard/assets/[id]/page.tsx` for the UI strip. During the grep sweep for `asset\.(hostname|operatingSystem|...)` the following additional references were found that still read the dropped columns:

| File | Line | Pattern |
|------|------|---------|
| `apps/mobile/src/screens/assets/AssetListScreen.tsx` | 27, 28 | `asset.hostname` |
| `apps/mobile/src/screens/assets/AssetDetailScreen.tsx` | 57 | `asset.hostname` |
| `apps/web/src/app/portal/assets/page.tsx` | 162, 164 | `asset.hostname` |

Impact after Wave 5 destructive migration applies:
- Mobile screens render `undefined` for `asset.hostname` (TypeScript interfaces local to mobile will need a matching strip; runtime behavior is graceful — the `{asset.hostname && ...}` guard short-circuits on undefined).
- Portal assets page renders `undefined` similarly.

These references are NOT in the plan's `<files_modified>` list. Per GSD scope-boundary rules, they are NOT auto-fixed in this wave. They should be resolved in a follow-up bugfix PR or rolled into Phase 9 (CAID) scope.

### Suggested resolution

1. Add matching `Phase 8 (CASR-01)` comment blocks in each file noting the field is gone and referencing the CI-side JOIN path.
2. Update each local `Asset` TypeScript interface to drop the deleted fields.
3. Either remove the `{asset.hostname && ...}` guard rows OR replace them with a JOIN through `asset.cmdbConfigItems[0].hostname` (same pattern Task 2 applies to the dashboard page).
4. Update the apps/web grep gate to scan `apps/web/src/app/portal/**/*.tsx` once the fix lands.
5. Do NOT ship a mobile app release with stale interfaces — schedule with the next mobile cut.

These three files are safe to leave as-is for the destructive migration itself (no DB write paths; purely read UI fallbacks).

# Asset Form Autocomplete — Design

**Date:** 2026-04-20
**Scope:** Add typeahead autocomplete to 5 free-text fields on the New Asset form and 2 fields on the Edit Asset form.

## Problem

On `/dashboard/assets/new`, the Manufacturer, Model, Operating System, OS Version, and CPU Model fields are plain text inputs. Users re-type the same values repeatedly ("Dell", "Latitude", "Windows 11", "22.04 LTS", "Xeon Gold 6248") across many assets. This causes inconsistent data (e.g., "Dell" vs "Dell Inc." vs "DELL") that hurts reporting, search, and CMDB reconciliation.

## Goal

As the user types in any of these 5 fields, suggest existing values from the tenant's own data (Assets and CMDB CIs) plus a small hardcoded seed list of common vendors/OSes/CPUs. The user can still type any free-text value — suggestions are non-binding.

## Scope

- **New Asset form** (`apps/web/src/app/dashboard/assets/new/page.tsx`): all 5 fields get autocomplete.
- **Edit Asset form** (`apps/web/src/app/dashboard/assets/[id]/page.tsx`): only Manufacturer and Model — OS/CPU fields on the edit page are read-only CI-sourced displays and will not change.

Out of scope: agent-submitted inventory (already feeds CMDB, which we read from); cross-tenant aggregation; admin UI for editing the seed list.

## Architecture

### Reusable Component

A single `AutocompleteInput` component at `apps/web/src/components/AutocompleteInput.tsx` used by both forms.

```tsx
interface AutocompleteInputProps {
  field: 'manufacturer' | 'model' | 'os' | 'osVersion' | 'cpuModel';
  value: string;
  onChange: (value: string) => void;
  parentValue?: string;    // Manufacturer for 'model', OS for 'osVersion'
  label: string;
  placeholder?: string;
  labelStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}
```

Behavior:
- Free-text input — user can always type any value; suggestions only assist.
- On focus or keystroke, fetch `/api/v1/assets/suggest?field=<f>&q=<v>&parent=<p>` debounced 200ms.
- Skip fetch when `q` is empty and input has not yet been focused.
- Dropdown positioned with `getBoundingClientRect` + `position: fixed`, matching the `SearchableTypeSelect` pattern already used on this form for Asset Type. Max-height 240px, scrollable.
- Matching portion of each suggestion is rendered bold.
- Keyboard: Up/Down navigates, Enter selects, Esc closes, Tab closes and keeps typed value.
- Click-outside closes (backdrop overlay `position: fixed; inset: 0`).
- No dropdown if `suggestions.length === 0`.
- No race conditions: each fetch carries a monotonic `requestId`; stale responses discarded.
- No "seed" badge in v1 — DB and seed entries render identically.

### API Route

New handler at `apps/api/src/routes/v1/assets/suggest.ts`.

**Endpoint:** `GET /api/v1/assets/suggest`

**Auth:** requires authenticated session; all queries scoped by `tenantId` from the session.

**Query params:**
| Param | Required | Values |
|---|---|---|
| `field` | yes | `manufacturer` \| `model` \| `os` \| `osVersion` \| `cpuModel` |
| `q` | no | free-text, case-insensitive |
| `parent` | no | parent field value; used only when `field=model` or `field=osVersion` |

**Response (`200 OK`):**
```json
{
  "suggestions": [
    { "value": "Dell", "source": "db", "count": 47 },
    { "value": "Dell Inc.", "source": "db", "count": 3 },
    { "value": "Dell Technologies", "source": "seed" }
  ]
}
```

Top 10 results. `source` is `"db"` (with usage `count`) or `"seed"`.

**Errors:** `400` (missing/invalid `field`), `401` (not authenticated), `500` (DB error).

**Data sources per field:**
| Field | DB sources |
|---|---|
| `manufacturer` | `Asset.manufacturer` + `CmdbVendor.name` (via CI `manufacturerId`) |
| `model` | `Asset.model` + `CmdbCiServer.model` + `CmdbCiEndpoint.model` (if present) |
| `os` | `CmdbCiServer.operatingSystem` + `CmdbCiEndpoint.operatingSystem` |
| `osVersion` | `CmdbCiServer.osVersion` + `CmdbCiEndpoint.osVersion` |
| `cpuModel` | `CmdbCiServer.cpuModel` |

**Contextual filter:**
- `field=model&parent=Dell` → only models where the row's manufacturer (Asset.manufacturer or CmdbVendor.name) equals `Dell` (case-insensitive).
- `field=osVersion&parent=Ubuntu` → only versions where `operatingSystem` equals `Ubuntu`.

### Seed List

New constants file at `apps/api/src/constants/asset-suggest-seeds.ts`:

```ts
export const MANUFACTURER_SEEDS = ['Dell', 'HP', 'HPE', 'Lenovo', 'Apple', 'Microsoft', 'Cisco', 'IBM', 'Supermicro', 'ASUS', 'Acer'];
export const MODEL_SEEDS: Record<string, string[]> = {
  Dell: ['Latitude', 'OptiPlex', 'PowerEdge R740', 'PowerEdge R750', 'Precision'],
  HP: ['EliteBook', 'ProBook', 'ProLiant DL380'],
  Lenovo: ['ThinkPad', 'ThinkCentre', 'ThinkSystem'],
  Apple: ['MacBook Pro', 'MacBook Air', 'Mac mini', 'iMac'],
  // ...
};
export const OS_SEEDS = ['Windows 11', 'Windows 10', 'Windows Server 2022', 'Windows Server 2019', 'Ubuntu', 'Debian', 'Red Hat Enterprise Linux', 'CentOS', 'macOS', 'VMware ESXi'];
export const OS_VERSION_SEEDS: Record<string, string[]> = {
  Ubuntu: ['24.04 LTS', '22.04 LTS', '20.04 LTS'],
  'Windows 11': ['23H2', '22H2'],
  'Windows Server 2022': ['21H2'],
  macOS: ['Sequoia 15', 'Sonoma 14', 'Ventura 13'],
  // ...
};
export const CPU_MODEL_SEEDS = ['Intel Xeon Gold 6248', 'Intel Xeon Silver 4214', 'Intel Core i7-13700', 'Intel Core i5-13500', 'AMD EPYC 7763', 'AMD EPYC 9654', 'AMD Ryzen 9 7950X', 'Apple M2 Pro', 'Apple M3'];
```

Exact values to be finalized during implementation; shape above is authoritative.

### Merge & Sort Logic

1. Query DB for distinct values matching `q` (and `parent` if applicable), with `COUNT(*)` — union of relevant Asset/CMDB tables. Limit 50.
2. Pull seed list for the field (plus `parent` if contextual). Filter seeds by `q`.
3. Dedupe: DB entries win over seeds with identical (case-insensitive) value.
4. Sort order:
   - Exact prefix match on `q` first
   - Then DB entries by `count` desc
   - Then seed entries alpha
5. Slice to top 10.

## Data Flow (single keystroke)

1. User types "De" in Manufacturer → local state updates immediately.
2. Debounced 200ms timer fires → fetch `/api/v1/assets/suggest?field=manufacturer&q=De` with `credentials: 'include'`.
3. API handler: `auth()` → `tenantId` → Prisma query with unions → GROUP BY + COUNT → LIMIT 50.
4. Merge with seed list, dedupe, sort, slice to 10.
5. Return `{suggestions: [...]}` → component renders dropdown.
6. User clicks "Dell" → `onChange("Dell")` → dropdown closes.

## Error Handling

- Network/fetch failure → swallow error, hide dropdown, input continues to work as plain text.
- API `400` → should not occur from our own callsites; log and hide dropdown.
- Empty results → hide dropdown (no "No matches" message).
- Stale response (request raced by newer keystroke) → discard via `requestId`.

## Callsite Changes

**`apps/web/src/app/dashboard/assets/new/page.tsx`** — replace 5 `<input>` elements:
- line 457: Manufacturer → `<AutocompleteInput field="manufacturer" … />`
- line 461: Model → `<AutocompleteInput field="model" parentValue={manufacturer} … />`
- line 488: Operating System → `<AutocompleteInput field="os" … />`
- line 492: OS Version → `<AutocompleteInput field="osVersion" parentValue={operatingSystem} … />`
- line 496: CPU Model → `<AutocompleteInput field="cpuModel" … />`

**`apps/web/src/app/dashboard/assets/[id]/page.tsx`** — the Edit form currently uses a `field()` helper for Manufacturer and Model. Replace those two call sites with inline `<AutocompleteInput>` JSX (keeping the helper intact for other fields). Manufacturer has no parent; Model passes `parentValue={form.manufacturer}`.

## Testing

### Unit — component (Vitest)
`apps/web/src/components/__tests__/AutocompleteInput.test.tsx`:
- renders text input with supplied label/placeholder
- debounces fetch (~200ms)
- shows dropdown when fetch returns non-empty results
- selects value on click, closes dropdown
- keyboard Up/Down/Enter/Esc/Tab behave as specified
- sends `parent` param when `parentValue` prop present
- discards stale responses when a newer request has started

### Unit — API (Vitest)
`apps/api/src/routes/v1/assets/__tests__/suggest.test.ts`:
- returns `401` when unauthenticated
- returns `400` on missing/invalid `field`
- tenant scoping: tenant A's values do not appear for tenant B
- each `field` value returns expected union across Asset + CMDB tables
- seed entries merge with DB entries and dedupe on case-insensitive value match
- `q` filter is case-insensitive
- `parent` filter applies for `field=model` and `field=osVersion` only
- response is capped at 10 entries
- sort order: exact prefix → DB count desc → seed alpha

### E2E (Playwright)
`apps/web/tests/assets-new-autocomplete.spec.ts`:
- navigate to `/dashboard/assets/new`
- type "De" into Manufacturer, assert dropdown shows suggestions, click "Dell"
- assert Manufacturer value is "Dell"
- type "La" into Model, assert dropdown only shows Dell-associated models (contextual filter)
- verify Esc closes the dropdown
- verify submitting the form with an arbitrary non-suggested value still works (free-text preserved)

## Performance

v1 target: API p95 < 150ms for tenants up to ~10k assets + ~10k CIs. Existing `@@index([tenantId])` and `@@index([tenantId, ...])` on Asset and CMDB tables cover the access pattern. No caching in v1. If production latency exceeds target, add Redis cache keyed `suggest:<tenantId>:<field>:<parent>:<q>` with 60s TTL as a follow-up.

## Rollout

No feature flag — pure additive behavior with no migration. Ship on one commit for the API + component, a second commit for New Asset callsite, a third for Edit Asset callsite. Each commit passes type-check and tests.

## Non-Goals

- Admin UI to edit the seed list (see "upgrade path" below).
- Autocomplete on other forms (Ticket, Change, Application) — this pattern can be reused later but is not part of this spec.
- Fuzzy matching beyond substring ILIKE.
- Telemetry on suggestion acceptance rates.

## Future / Upgrade Path

- If seed list needs runtime editing: introduce `AssetSuggestionSeed` table and swap the `asset-suggest-seeds.ts` import for a DB read, keeping the API contract unchanged.
- Apply `AutocompleteInput` to other text-heavy forms (Application vendor, Ticket category tags, etc.).
- Add a "Suggested standard value" hint on Edit form when the current Manufacturer/Model doesn't match any known canonical spelling, to nudge data-quality cleanup.

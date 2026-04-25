# Asset Type — Analysis & Recommendation

## Context

The Asset screen (`apps/web/src/app/dashboard/assets/new/page.tsx`) currently has NO asset type/category field. The `Asset` Prisma model (`packages/db/prisma/schema.prisma:1669-1706`) tracks only `status`, hardware metadata, and procurement fields. The user is asking whether a type dropdown should exist, what ITIL prescribes, and whether a management screen is needed.

## ITIL Common Practice

ITIL 4 / Service Configuration Management separates **Asset Type** (procurement/financial classification) from **CI Class** (operational/technical classification). Standard practice:

- **Asset Types are reference data, user-managed** — not hardcoded. Organizations extend the list as they acquire new asset categories (drones, IoT sensors, etc.).
- Typical top-level types: **Hardware** (Desktop, Laptop, Server, Network Device, Mobile Device, Printer, Monitor, Peripheral), **Software** (License, Subscription), **Consumable**, **Facility**, **Virtual**.
- Hierarchical (parent/child) is common: *Hardware → Laptop → Ultrabook*.
- Separate from CMDB CI Class — an Asset is the financial/ownership record; a CI is the operational record. One Asset can link to one CI (already modeled via `Asset.cmdbConfigItems`).

**Answer to "should there be a dropdown":** Yes. Without it, reporting (hardware refresh cycles, warranty by category, depreciation schedules) and filtering become impossible.

**Answer to "should there be a management screen":** Yes. ITIL treats asset types as tenant-configurable reference data, not a fixed enum. Locking types into a code enum forces a deploy every time finance adds a category.

## Recommendation: FK Reference Table + Admin Screen

Follow the **ticket category pattern** already established in this codebase — not the CMDB enum pattern (which the schema itself flags for future migration to FK tables, `schema.prisma:2173-2177`). This keeps taxonomy handling consistent.

### Schema changes (`packages/db/prisma/schema.prisma`)

Add new model:
```prisma
model AssetType {
  id          String      @id @default(cuid())
  tenantId    String
  name        String
  description String?
  icon        String?
  color       String?
  parentId    String?     // hierarchical
  parent      AssetType?  @relation("AssetTypeHierarchy", fields: [parentId], references: [id])
  children    AssetType[] @relation("AssetTypeHierarchy")
  assets      Asset[]
  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@unique([tenantId, name])
  @@index([tenantId])
}
```

Add to `Asset` model:
```prisma
assetTypeId String?
assetType   AssetType? @relation(fields: [assetTypeId], references: [id])
```

Seed with standard ITIL starter set per tenant: Laptop, Desktop, Server, Network Device, Mobile Device, Printer, Monitor, Peripheral, Software License, Virtual Machine, Other.

### Files to modify / create

1. **Schema + migration** — `packages/db/prisma/schema.prisma` (add model, FK) + `pnpm --filter web prisma migrate dev`.
2. **Seed** — extend existing seed to populate default types per tenant.
3. **New-asset form** — `apps/web/src/app/dashboard/assets/new/page.tsx`: add type `<Select>` loading `/api/v1/settings/asset-types`. Place above Status.
4. **Edit + detail pages** — `apps/web/src/app/dashboard/assets/[id]/` (show and allow change).
5. **API routes** — create `apps/web/src/app/api/v1/settings/asset-types/route.ts` + `[id]/route.ts` (GET/POST/PATCH/DELETE). **Scope every query by `tenantId`** per CLAUDE.md #1. Mirror the ticket category route structure.
6. **Admin screen** — create `apps/web/src/app/dashboard/settings/asset-types/page.tsx`. Clone the pattern from `apps/web/src/app/dashboard/settings/categories/page.tsx` (modal CRUD, hierarchical tree, color/icon metadata). Permission gate: `admin` / `msp_admin` only.
7. **Assets list** — add type column + filter in `apps/web/src/app/dashboard/assets/page.tsx`.
8. **AI schema context** — update `apps/api/src/services/ai-schema-context.ts` per CLAUDE.md #6 so the AI assistant can query asset types.
9. **Asset API** — update create/update endpoints to accept `assetTypeId`, validate it belongs to the same tenant.

### Reuse (don't reinvent)

- `apps/web/src/app/dashboard/settings/categories/page.tsx` — copy the modal + tree UX.
- `apps/web/src/app/api/v1/settings/categories/` — copy the route shape, swap the model.
- Existing `planGate` middleware pattern for resource-creating routes.

## Verification

1. `pnpm --filter web prisma migrate dev` runs cleanly; new `AssetType` table exists with `tenantId`.
2. Seed produces default types for each tenant; cross-tenant query returns zero leakage.
3. `/dashboard/settings/asset-types` — create, edit (including changing parent), delete; deleting a type in use is blocked or nulls references (decide during impl — recommend block).
4. `/dashboard/assets/new` — type dropdown loads tenant's types, hierarchical display, saves to DB.
5. Asset detail + list show type; list filter by type works.
6. Playwright: add `apps/web/tests/asset-types.spec.ts` covering CRUD + new-asset selection + cross-tenant isolation.
7. AI chatbot: ask "how many laptops do we have?" and confirm it can answer after `ai-schema-context.ts` update.

## Open decisions for user

- **Delete semantics**: block delete when type is in use, OR soft-delete + null out references? (Recommend block to preserve reporting integrity.)
- **Hierarchy depth**: unlimited (matches ticket categories) or cap at 2 levels?
- **Link to CMDB CI Class**: should selecting an Asset Type suggest/auto-set a CI Class when a CI is later linked? (Out of scope for this plan unless requested.)

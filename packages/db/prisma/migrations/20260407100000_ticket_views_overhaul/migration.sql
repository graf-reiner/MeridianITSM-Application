-- Ticket Views Overhaul: add display customization, default view, granular sharing

-- Step 1: Add new columns to saved_ticket_views
ALTER TABLE "saved_ticket_views" ADD COLUMN "description" TEXT;
ALTER TABLE "saved_ticket_views" ADD COLUMN "displayConfig" JSONB;
ALTER TABLE "saved_ticket_views" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "saved_ticket_views" ADD COLUMN "isGlobal" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Migrate isShared data to isGlobal
UPDATE "saved_ticket_views" SET "isGlobal" = "isShared" WHERE "isShared" = true;

-- Step 3: Drop isShared column
ALTER TABLE "saved_ticket_views" DROP COLUMN "isShared";

-- Step 4: Create ticket_view_assignments join table
CREATE TABLE "ticket_view_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "viewId" UUID NOT NULL,
    "userId" UUID,
    "userGroupId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_view_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_view_assignments_exactly_one_target"
        CHECK (("userId" IS NOT NULL) != ("userGroupId" IS NOT NULL))
);

-- Indexes
CREATE UNIQUE INDEX "ticket_view_assignments_viewId_userId_key"
    ON "ticket_view_assignments"("viewId", "userId");
CREATE UNIQUE INDEX "ticket_view_assignments_viewId_userGroupId_key"
    ON "ticket_view_assignments"("viewId", "userGroupId");
CREATE INDEX "ticket_view_assignments_tenantId_userId_idx"
    ON "ticket_view_assignments"("tenantId", "userId");
CREATE INDEX "ticket_view_assignments_tenantId_userGroupId_idx"
    ON "ticket_view_assignments"("tenantId", "userGroupId");

-- Foreign keys
ALTER TABLE "ticket_view_assignments" ADD CONSTRAINT "ticket_view_assignments_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_view_assignments" ADD CONSTRAINT "ticket_view_assignments_viewId_fkey"
    FOREIGN KEY ("viewId") REFERENCES "saved_ticket_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_view_assignments" ADD CONSTRAINT "ticket_view_assignments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_view_assignments" ADD CONSTRAINT "ticket_view_assignments_userGroupId_fkey"
    FOREIGN KEY ("userGroupId") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

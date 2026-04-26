-- Add MAJOR_INCIDENT_DECLARED to NotificationType enum.
-- ALTER TYPE ADD VALUE must be committed before the new value can be used,
-- so this runs first; subsequent statements in this migration do not reference it.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAJOR_INCIDENT_DECLARED';

-- CreateEnum: TicketImpact
CREATE TYPE "TicketImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum: TicketUrgency
CREATE TYPE "TicketUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- Normalize existing free-form String values on tickets.impact and tickets.urgency
-- so they can be safely cast to the new enum types.
-- Strategy: uppercase canonical values pass through; everything else becomes NULL.
UPDATE "tickets"
SET "impact" = NULL
WHERE "impact" IS NOT NULL
  AND UPPER(TRIM("impact")) NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

UPDATE "tickets"
SET "impact" = UPPER(TRIM("impact"))
WHERE "impact" IS NOT NULL;

UPDATE "tickets"
SET "urgency" = NULL
WHERE "urgency" IS NOT NULL
  AND UPPER(TRIM("urgency")) NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

UPDATE "tickets"
SET "urgency" = UPPER(TRIM("urgency"))
WHERE "urgency" IS NOT NULL;

-- Convert columns from TEXT to the new enum types.
ALTER TABLE "tickets"
  ALTER COLUMN "impact" TYPE "TicketImpact" USING ("impact"::"TicketImpact");

ALTER TABLE "tickets"
  ALTER COLUMN "urgency" TYPE "TicketUrgency" USING ("urgency"::"TicketUrgency");

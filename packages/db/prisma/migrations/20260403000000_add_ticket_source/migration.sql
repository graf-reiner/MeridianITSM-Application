-- AlterTable (column may already exist from earlier migration)
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SERVICE_DESK';

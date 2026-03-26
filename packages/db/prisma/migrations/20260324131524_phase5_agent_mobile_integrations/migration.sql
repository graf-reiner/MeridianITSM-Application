-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pushPreferences" JSONB;

-- AlterTable
ALTER TABLE "webhooks" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;

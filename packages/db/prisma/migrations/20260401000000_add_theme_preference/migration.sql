-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "themePreference" TEXT NOT NULL DEFAULT 'system';

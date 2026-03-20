-- AlterTable: Add timezone, autoEscalate, and escalateToQueueId fields to SLA model
ALTER TABLE "slas" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "slas" ADD COLUMN "autoEscalate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "slas" ADD COLUMN "escalateToQueueId" UUID;

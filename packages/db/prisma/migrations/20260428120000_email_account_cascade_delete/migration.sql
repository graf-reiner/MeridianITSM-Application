-- Cascade delete EmailActivityLog and EmailPollJob rows when their parent
-- EmailAccount is deleted. Without this, the customer-facing "Delete email
-- account" action silently fails because the FK constraints default to
-- RESTRICT and activity-log rows accumulate on every poll cycle.

ALTER TABLE "email_activity_logs"
  DROP CONSTRAINT "email_activity_logs_emailAccountId_fkey";

ALTER TABLE "email_activity_logs"
  ADD CONSTRAINT "email_activity_logs_emailAccountId_fkey"
  FOREIGN KEY ("emailAccountId") REFERENCES "email_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_poll_jobs"
  DROP CONSTRAINT "email_poll_jobs_emailAccountId_fkey";

ALTER TABLE "email_poll_jobs"
  ADD CONSTRAINT "email_poll_jobs_emailAccountId_fkey"
  FOREIGN KEY ("emailAccountId") REFERENCES "email_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

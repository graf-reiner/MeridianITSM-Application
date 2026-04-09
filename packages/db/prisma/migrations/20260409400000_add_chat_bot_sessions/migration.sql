-- Chat Bot Sessions for multi-turn form conversations from Discord/Telegram
CREATE TABLE "chat_bot_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "platform" TEXT NOT NULL,
  "platformUserId" TEXT NOT NULL,
  "channelId" TEXT,
  "formId" UUID,
  "currentFieldIdx" INTEGER NOT NULL DEFAULT 0,
  "collectedValues" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "chat_bot_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_bot_sessions_tenantId_platform_platformUserId_idx"
  ON "chat_bot_sessions"("tenantId", "platform", "platformUserId");

ALTER TABLE "chat_bot_sessions" ADD CONSTRAINT "chat_bot_sessions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

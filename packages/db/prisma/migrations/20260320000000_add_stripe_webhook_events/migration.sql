-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_processedAt_idx" ON "stripe_webhook_events"("processedAt");

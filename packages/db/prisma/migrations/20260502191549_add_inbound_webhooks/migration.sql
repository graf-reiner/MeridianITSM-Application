-- CreateEnum
CREATE TYPE "InboundWebhookDeliveryStatus" AS ENUM ('PENDING', 'PROCESSED', 'REJECTED_AUTH', 'REJECTED_VALIDATION', 'REJECTED_TEMPLATE', 'DUPLICATE_IDEMPOTENT', 'ERROR');

-- CreateTable
CREATE TABLE "inbound_webhooks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tokenHash" TEXT NOT NULL,
    "defaultQueueId" UUID,
    "defaultCategoryId" UUID,
    "defaultPriority" "TicketPriority",
    "defaultType" "TicketType",
    "defaultRequesterId" UUID,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_webhook_deliveries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "inboundWebhookId" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InboundWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "httpResponseCode" INTEGER NOT NULL,
    "requestHeaders" JSONB NOT NULL,
    "requestBody" JSONB,
    "requestBodySize" INTEGER NOT NULL,
    "mappedFields" JSONB,
    "createdTicketId" UUID,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT,
    "sourceIp" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_webhooks_tokenHash_key" ON "inbound_webhooks"("tokenHash");

-- CreateIndex
CREATE INDEX "inbound_webhooks_tenantId_idx" ON "inbound_webhooks"("tenantId");

-- CreateIndex
CREATE INDEX "inbound_webhooks_tenantId_isActive_idx" ON "inbound_webhooks"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "inbound_webhook_deliveries_tenantId_receivedAt_idx" ON "inbound_webhook_deliveries"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_webhook_deliveries_inboundWebhookId_receivedAt_idx" ON "inbound_webhook_deliveries"("inboundWebhookId", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_webhook_deliveries_createdAt_idx" ON "inbound_webhook_deliveries"("createdAt");

-- AddForeignKey
ALTER TABLE "inbound_webhooks" ADD CONSTRAINT "inbound_webhooks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_webhooks" ADD CONSTRAINT "inbound_webhooks_defaultQueueId_fkey" FOREIGN KEY ("defaultQueueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_webhooks" ADD CONSTRAINT "inbound_webhooks_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_webhooks" ADD CONSTRAINT "inbound_webhooks_defaultRequesterId_fkey" FOREIGN KEY ("defaultRequesterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_webhook_deliveries" ADD CONSTRAINT "inbound_webhook_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_webhook_deliveries" ADD CONSTRAINT "inbound_webhook_deliveries_inboundWebhookId_fkey" FOREIGN KEY ("inboundWebhookId") REFERENCES "inbound_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_webhook_deliveries" ADD CONSTRAINT "inbound_webhook_deliveries_createdTicketId_fkey" FOREIGN KEY ("createdTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

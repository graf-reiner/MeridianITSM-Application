-- CreateEnum
CREATE TYPE "OwnerOAuthProvider" AS ENUM ('MICROSOFT', 'GOOGLE');

-- CreateTable
CREATE TABLE "owner_oauth_integrations" (
    "id" UUID NOT NULL,
    "provider" "OwnerOAuthProvider" NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "secretExpiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_oauth_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_oauth_integrations_provider_key" ON "owner_oauth_integrations"("provider");

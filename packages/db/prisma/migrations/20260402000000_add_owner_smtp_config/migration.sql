-- CreateTable
CREATE TABLE IF NOT EXISTS "owner_smtp_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 25,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "password" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL DEFAULT 'MeridianITSM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "owner_smtp_config_pkey" PRIMARY KEY ("id")
);

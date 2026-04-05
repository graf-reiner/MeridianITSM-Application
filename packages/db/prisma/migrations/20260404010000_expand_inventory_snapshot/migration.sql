-- Expand InventorySnapshot with enriched agent collection fields

-- Identity
ALTER TABLE "inventory_snapshots" ADD COLUMN "fqdn" TEXT;
ALTER TABLE "inventory_snapshots" ADD COLUMN "deviceType" TEXT;

-- OS
ALTER TABLE "inventory_snapshots" ADD COLUMN "osBuild" TEXT;
ALTER TABLE "inventory_snapshots" ADD COLUMN "osEdition" TEXT;

-- CPU
ALTER TABLE "inventory_snapshots" ADD COLUMN "cpuThreads" INTEGER;
ALTER TABLE "inventory_snapshots" ADD COLUMN "cpuSpeedMhz" DOUBLE PRECISION;

-- Hardware identity
ALTER TABLE "inventory_snapshots" ADD COLUMN "serialNumber" TEXT;
ALTER TABLE "inventory_snapshots" ADD COLUMN "manufacturer" TEXT;
ALTER TABLE "inventory_snapshots" ADD COLUMN "model" TEXT;
ALTER TABLE "inventory_snapshots" ADD COLUMN "biosVersion" TEXT;
ALTER TABLE "inventory_snapshots" ADD COLUMN "tpmVersion" TEXT;
ALTER TABLE "inventory_snapshots" ADD COLUMN "secureBootEnabled" BOOLEAN;

-- Security posture
ALTER TABLE "inventory_snapshots" ADD COLUMN "diskEncrypted" BOOLEAN;
ALTER TABLE "inventory_snapshots" ADD COLUMN "antivirusProduct" TEXT;
ALTER TABLE "inventory_snapshots" ADD COLUMN "firewallEnabled" BOOLEAN;

-- Directory
ALTER TABLE "inventory_snapshots" ADD COLUMN "domainName" TEXT;

-- Virtualization
ALTER TABLE "inventory_snapshots" ADD COLUMN "isVirtual" BOOLEAN;
ALTER TABLE "inventory_snapshots" ADD COLUMN "hypervisorType" TEXT;

-- Uptime
ALTER TABLE "inventory_snapshots" ADD COLUMN "lastBootTime" TIMESTAMPTZ(6);
ALTER TABLE "inventory_snapshots" ADD COLUMN "uptimeSeconds" DOUBLE PRECISION;

-- JSON collections
ALTER TABLE "inventory_snapshots" ADD COLUMN "services" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "windowsUpdates" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "memoryModules" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "gpus" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "battery" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "monitors" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "bitLockerVolumes" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "securityPosture" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "directoryStatus" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "performance" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "virtualization" JSONB;
ALTER TABLE "inventory_snapshots" ADD COLUMN "scanDurationMs" DOUBLE PRECISION;

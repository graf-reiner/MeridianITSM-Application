-- AlterTable: add connected hardware + compliance hardware columns to inventory_snapshots
ALTER TABLE "inventory_snapshots" ADD COLUMN     "printers"          JSONB,
ADD COLUMN     "usbDevices"        JSONB,
ADD COLUMN     "cameras"           JSONB,
ADD COLUMN     "biometricDevices"  JSONB,
ADD COLUMN     "smartCardReaders"  JSONB,
ADD COLUMN     "audioDevices"      JSONB,
ADD COLUMN     "tpmDetails"        JSONB,
ADD COLUMN     "vbsStatus"         JSONB;

-- RenameTable
ALTER TABLE "Site" RENAME TO "site";

-- RenameTable
ALTER TABLE "Rack" RENAME TO "rack";

-- RenameTable
ALTER TABLE "DeviceStack" RENAME TO "device_stack";

-- RenameTable
ALTER TABLE "Device" RENAME TO "device";

-- RenameConstraint (renaming a table does not rename its constraints in Postgres)
ALTER TABLE "site" RENAME CONSTRAINT "Site_pkey" TO "site_pkey";

-- RenameConstraint
ALTER TABLE "rack" RENAME CONSTRAINT "Rack_pkey" TO "rack_pkey";

-- RenameConstraint
ALTER TABLE "device_stack" RENAME CONSTRAINT "DeviceStack_pkey" TO "device_stack_pkey";

-- RenameConstraint
ALTER TABLE "device" RENAME CONSTRAINT "Device_pkey" TO "device_pkey";

-- RenameForeignKey
ALTER TABLE "rack" RENAME CONSTRAINT "Rack_siteId_fkey" TO "rack_siteId_fkey";

-- RenameForeignKey
ALTER TABLE "device" RENAME CONSTRAINT "Device_rackId_fkey" TO "device_rackId_fkey";

-- RenameForeignKey
ALTER TABLE "device" RENAME CONSTRAINT "Device_device_stack_id_fkey" TO "device_device_stack_id_fkey";

-- RenameIndex (unique indexes are not covered by RENAME CONSTRAINT)
ALTER INDEX "Device_serialNumber_key" RENAME TO "device_serialNumber_key";

-- RenameIndex
ALTER INDEX "Device_assetTag_key" RENAME TO "device_assetTag_key";

-- AlterTable
-- A DEFAULT is included so any existing rows are backfilled instead of the
-- NOT NULL constraint failing the migration. The default on "updatedAt" is
-- dropped afterwards since the Prisma schema manages that column via
-- `@updatedAt` at the application layer rather than a SQL default.
ALTER TABLE "site" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "site" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "site" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "rack" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "rack" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "rack" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
-- "updatedAt" already existed on "Device" prior to this migration (added in
-- 20260818170652_add_device_inventory); only "createdAt" is new here.
ALTER TABLE "device" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateEnum
CREATE TYPE "InventorySourceKind" AS ENUM ('ACI', 'LEGACY');

-- CreateEnum
CREATE TYPE "InventoryMatchMethod" AS ENUM ('SERIAL', 'MANUAL_SELECTION');

-- AlterTable
ALTER TABLE "device_stack" ADD COLUMN     "observedHostname" TEXT,
ADD COLUMN     "observedManagementIp" TEXT,
ADD COLUMN     "observedVersion" TEXT;

-- AlterTable
ALTER TABLE "device" ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "apic_host" ADD COLUMN     "nodeLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "nodeLeaseToken" TEXT;

-- AlterTable
ALTER TABLE "node_snapshot" ADD COLUMN     "inventoryRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "legacy_device" ADD COLUMN     "inventoryMetadataClock" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "inventoryMetadataConflict" TEXT,
ADD COLUMN     "inventoryRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "inventory_source" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceStackId" TEXT,
    "kind" "InventorySourceKind" NOT NULL,
    "nodeSnapshotId" TEXT,
    "legacyDeviceId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "matchedOn" "InventoryMatchMethod" NOT NULL,
    "serialAtLink" TEXT,
    "conflictReason" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastAppliedAt" TIMESTAMP(3),
    "lastAppliedObservationAt" TIMESTAMP(3),
    "acceptedRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reconcile_job" (
    "id" TEXT NOT NULL,
    "kind" "InventorySourceKind" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "observation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_reconcile_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_worker_health" (
    "id" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "inventory_worker_health_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_source_deviceId_key" ON "inventory_source"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_source_deviceStackId_key" ON "inventory_source"("deviceStackId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_source_nodeSnapshotId_key" ON "inventory_source"("nodeSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_source_legacyDeviceId_key" ON "inventory_source"("legacyDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_source_kind_sourceKey_key" ON "inventory_source"("kind", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reconcile_job_kind_sourceRecordId_sourceRevision_key" ON "inventory_reconcile_job"("kind", "sourceRecordId", "sourceRevision");

-- AddForeignKey
ALTER TABLE "inventory_source" ADD CONSTRAINT "inventory_source_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_source" ADD CONSTRAINT "inventory_source_deviceStackId_fkey" FOREIGN KEY ("deviceStackId") REFERENCES "device_stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_source" ADD CONSTRAINT "inventory_source_nodeSnapshotId_fkey" FOREIGN KEY ("nodeSnapshotId") REFERENCES "node_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_source" ADD CONSTRAINT "inventory_source_legacyDeviceId_fkey" FOREIGN KEY ("legacyDeviceId") REFERENCES "legacy_device"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "inventory_source" ADD CONSTRAINT "inventory_source_target_check" CHECK (
  ("deviceId" IS NOT NULL)::int + ("deviceStackId" IS NOT NULL)::int = 1
);
ALTER TABLE "inventory_source" ADD CONSTRAINT "inventory_source_kind_check" CHECK (
  (kind = 'ACI' AND "legacyDeviceId" IS NULL AND "deviceStackId" IS NULL)
  OR (kind = 'LEGACY' AND "nodeSnapshotId" IS NULL)
);
ALTER TABLE "inventory_source" ADD CONSTRAINT "inventory_source_serial_check" CHECK (
  ("deviceId" IS NOT NULL AND length(trim("serialAtLink")) > 0 AND "serialAtLink" IS NOT NULL)
  OR ("deviceStackId" IS NOT NULL AND "serialAtLink" IS NULL)
);
CREATE INDEX inventory_reconcile_job_pending_due_idx
  ON inventory_reconcile_job ("availableAt", "createdAt", id) WHERE "completedAt" IS NULL;
CREATE INDEX inventory_reconcile_job_pending_source_idx
  ON inventory_reconcile_job (kind, "sourceRecordId", "sourceRevision") WHERE "completedAt" IS NULL;

-- Establish a conservative ordering baseline for telemetry collected before this
-- migration. Otherwise the first delayed post-upgrade payload could overwrite
-- already accepted metadata simply because the new per-field clock was empty.
UPDATE legacy_device AS d
SET "inventoryMetadataClock" = (
  SELECT COALESCE(jsonb_object_agg(f.key, jsonb_build_object('at',
    to_char(COALESCE((SELECT max(r."collectedAt") FROM legacy_ingest_receipt r WHERE r."deviceId" = d.id), d."createdAt"),
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))), '{}'::jsonb)
  FROM jsonb_each_text(jsonb_build_object(
    'hostname', d.hostname, 'site', d.site, 'managementIp', d."managementIp",
    'deviceType', d."deviceType", 'vendor', d.vendor, 'model', d.model,
    'serialNumber', d."serialNumber", 'softwareVersion', d."softwareVersion", 'location', d.location
  )) AS f
  WHERE f.value IS NOT NULL AND length(trim(f.value)) > 0
);

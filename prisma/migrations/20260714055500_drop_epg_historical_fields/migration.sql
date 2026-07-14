-- DropIndex
DROP INDEX "epg_path_binding_apicHostId_present_idx";

-- DropIndex
DROP INDEX "epg_snapshot_apicHostId_present_idx";

-- AlterTable
ALTER TABLE "epg_path_binding" DROP COLUMN "firstSeenAt",
DROP COLUMN "lastSeenAt",
DROP COLUMN "present";

-- AlterTable
ALTER TABLE "epg_snapshot" DROP COLUMN "firstSeenAt",
DROP COLUMN "lastSeenAt",
DROP COLUMN "present";

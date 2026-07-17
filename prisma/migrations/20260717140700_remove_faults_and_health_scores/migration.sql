-- AlterTable
ALTER TABLE "apic_host" DROP COLUMN "lastFaultSyncAt",
DROP COLUMN "lastHealthSyncAt";

-- DropTable
DROP TABLE "fault_count_sample";

-- DropTable
DROP TABLE "fault_snapshot";

-- DropTable
DROP TABLE "health_score_sample";

-- DropTable
DROP TABLE "health_score_snapshot";

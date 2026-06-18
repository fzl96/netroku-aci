-- DropIndex
DROP INDEX "endpoint_apicHostId_mac_ip_key";

-- AlterTable
ALTER TABLE "endpoint" ADD COLUMN "clearedAt" DATETIME;

-- CreateIndex
CREATE INDEX "endpoint_apicHostId_mac_ip_idx" ON "endpoint"("apicHostId", "mac", "ip");

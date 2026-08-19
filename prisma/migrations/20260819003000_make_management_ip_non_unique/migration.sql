-- DropIndex
DROP INDEX IF EXISTS "device_management_ip_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "device_management_ip_idx" ON "device"("management_ip");

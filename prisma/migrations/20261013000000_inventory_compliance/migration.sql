CREATE TYPE "InventoryConfigPlatform" AS ENUM ('iosxe', 'nxos');
CREATE TYPE "ComplianceService" AS ENUM ('ntp', 'tacacs');

CREATE TABLE "inventory_config" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceStackId" TEXT,
    "rawConfig" TEXT NOT NULL,
    "platform" "InventoryConfigPlatform" NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_config_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_config_owner_check" CHECK (("deviceId" IS NOT NULL)::int + ("deviceStackId" IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX "inventory_config_deviceId_key" ON "inventory_config"("deviceId");
CREATE UNIQUE INDEX "inventory_config_deviceStackId_key" ON "inventory_config"("deviceStackId");
ALTER TABLE "inventory_config" ADD CONSTRAINT "inventory_config_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_config" ADD CONSTRAINT "inventory_config_deviceStackId_fkey" FOREIGN KEY ("deviceStackId") REFERENCES "device_stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the latest collection even if a future collector delivers snapshots out of order.
CREATE FUNCTION inventory_config_preserve_latest() RETURNS trigger AS $$
BEGIN
    IF NEW."collectedAt" < OLD."collectedAt" THEN
        RAISE EXCEPTION 'An older configuration cannot replace the latest saved configuration';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_config_preserve_latest BEFORE UPDATE ON "inventory_config"
FOR EACH ROW EXECUTE FUNCTION inventory_config_preserve_latest();

CREATE TABLE "compliance_policy" (
    "service" "ComplianceService" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "expectedIps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "compliance_policy_pkey" PRIMARY KEY ("service"),
    CONSTRAINT "compliance_policy_enabled_ips_check" CHECK (NOT "enabled" OR cardinality("expectedIps") > 0)
);
INSERT INTO "compliance_policy" ("service", "updatedAt") VALUES ('ntp', CURRENT_TIMESTAMP), ('tacacs', CURRENT_TIMESTAMP);

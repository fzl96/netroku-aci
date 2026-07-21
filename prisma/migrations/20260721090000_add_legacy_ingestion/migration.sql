CREATE TYPE "LegacyIngestFeature" AS ENUM ('health', 'interfaces', 'endpoints');

CREATE TABLE "legacy_device" (
    "id" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "hostnameKey" TEXT NOT NULL,
    "managementIp" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "vendor" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "softwareVersion" TEXT,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHealthSyncAt" TIMESTAMP(3),
    "lastInterfaceSyncAt" TIMESTAMP(3),
    "lastEndpointSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "legacy_device_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legacy_ingest_receipt" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "feature" "LegacyIngestFeature" NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadHash" TEXT NOT NULL,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "cleared" INTEGER NOT NULL DEFAULT 0,
    "samples" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "legacy_ingest_receipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legacy_health_sample" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "uptime" TEXT NOT NULL DEFAULT '',
    "cpuPercent" DOUBLE PRECISION,
    "memoryPercent" DOUBLE PRECISION,
    "storagePercent" DOUBLE PRECISION,
    "temperatureCelsius" DOUBLE PRECISION,
    "fanStatuses" TEXT[],
    "psuStatuses" TEXT[],
    CONSTRAINT "legacy_health_sample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legacy_log_entry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3),
    "severity" TEXT,
    "message" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "legacy_log_entry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legacy_interface_snapshot" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ifName" TEXT NOT NULL,
    "ifNameKey" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT,
    "prefixLength" INTEGER,
    "mtu" INTEGER,
    "speed" TEXT NOT NULL DEFAULT '',
    "adminSt" TEXT NOT NULL DEFAULT '',
    "operSt" TEXT NOT NULL DEFAULT '',
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legacy_interface_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legacy_interface_sample" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "adminSt" TEXT NOT NULL,
    "operSt" TEXT NOT NULL,
    "speed" TEXT NOT NULL,
    "inputErrors" BIGINT NOT NULL,
    "outputErrors" BIGINT NOT NULL,
    "crcErrors" BIGINT NOT NULL,
    "dInputErrors" BIGINT,
    "dOutputErrors" BIGINT,
    "dCrcErrors" BIGINT,
    CONSTRAINT "legacy_interface_sample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legacy_endpoint" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "ip" TEXT,
    "ipKey" TEXT NOT NULL,
    "vlan" TEXT NOT NULL,
    "vlanName" TEXT NOT NULL DEFAULT '',
    "interface" TEXT NOT NULL,
    "interfaceKey" TEXT NOT NULL,
    "learningType" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),
    CONSTRAINT "legacy_endpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legacy_device_siteKey_hostnameKey_key" ON "legacy_device"("siteKey", "hostnameKey");
CREATE INDEX "legacy_device_active_lastSeenAt_idx" ON "legacy_device"("active", "lastSeenAt");
CREATE UNIQUE INDEX "legacy_ingest_receipt_runId_deviceId_feature_key" ON "legacy_ingest_receipt"("runId", "deviceId", "feature");
CREATE INDEX "legacy_ingest_receipt_deviceId_collectedAt_idx" ON "legacy_ingest_receipt"("deviceId", "collectedAt");
CREATE UNIQUE INDEX "legacy_health_sample_receiptId_key" ON "legacy_health_sample"("receiptId");
CREATE INDEX "legacy_health_sample_deviceId_collectedAt_idx" ON "legacy_health_sample"("deviceId", "collectedAt");
CREATE UNIQUE INDEX "legacy_log_entry_deviceId_eventHash_key" ON "legacy_log_entry"("deviceId", "eventHash");
CREATE INDEX "legacy_log_entry_deviceId_collectedAt_idx" ON "legacy_log_entry"("deviceId", "collectedAt");
CREATE UNIQUE INDEX "legacy_interface_snapshot_deviceId_ifNameKey_key" ON "legacy_interface_snapshot"("deviceId", "ifNameKey");
CREATE INDEX "legacy_interface_snapshot_deviceId_present_idx" ON "legacy_interface_snapshot"("deviceId", "present");
CREATE UNIQUE INDEX "legacy_interface_sample_receiptId_interfaceId_key" ON "legacy_interface_sample"("receiptId", "interfaceId");
CREATE INDEX "legacy_interface_sample_interfaceId_collectedAt_idx" ON "legacy_interface_sample"("interfaceId", "collectedAt");
CREATE INDEX "legacy_interface_sample_deviceId_collectedAt_idx" ON "legacy_interface_sample"("deviceId", "collectedAt");
CREATE INDEX "legacy_endpoint_deviceId_isActive_idx" ON "legacy_endpoint"("deviceId", "isActive");
CREATE INDEX "legacy_endpoint_deviceId_mac_ipKey_idx" ON "legacy_endpoint"("deviceId", "mac", "ipKey");
CREATE INDEX "legacy_endpoint_deviceId_interfaceKey_idx" ON "legacy_endpoint"("deviceId", "interfaceKey");
CREATE UNIQUE INDEX "legacy_endpoint_active_identity_key" ON "legacy_endpoint"("deviceId", "mac", "ipKey") WHERE "isActive" = true;

ALTER TABLE "legacy_ingest_receipt" ADD CONSTRAINT "legacy_ingest_receipt_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "legacy_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_health_sample" ADD CONSTRAINT "legacy_health_sample_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "legacy_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_health_sample" ADD CONSTRAINT "legacy_health_sample_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "legacy_ingest_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_log_entry" ADD CONSTRAINT "legacy_log_entry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "legacy_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_log_entry" ADD CONSTRAINT "legacy_log_entry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "legacy_ingest_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_interface_snapshot" ADD CONSTRAINT "legacy_interface_snapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "legacy_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_interface_sample" ADD CONSTRAINT "legacy_interface_sample_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "legacy_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_interface_sample" ADD CONSTRAINT "legacy_interface_sample_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "legacy_interface_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_interface_sample" ADD CONSTRAINT "legacy_interface_sample_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "legacy_ingest_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_endpoint" ADD CONSTRAINT "legacy_endpoint_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "legacy_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "apic_host" ADD COLUMN "lastNodeSyncAt" DATETIME;

-- CreateTable
CREATE TABLE "node_snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "version" TEXT,
    "fabricSt" TEXT NOT NULL DEFAULT '',
    "state" TEXT,
    "podId" TEXT,
    "uptime" TEXT,
    "oobMgmtAddr" TEXT,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "node_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hardware_component" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "operSt" TEXT NOT NULL DEFAULT '',
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hardware_component_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "node_status_sample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "sampledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nodesTotal" INTEGER NOT NULL,
    "nodesOnline" INTEGER NOT NULL,
    "componentsTotal" INTEGER NOT NULL,
    "componentsFailed" INTEGER NOT NULL,
    CONSTRAINT "node_status_sample_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "node_snapshot_apicHostId_idx" ON "node_snapshot"("apicHostId");

-- CreateIndex
CREATE INDEX "node_snapshot_apicHostId_role_idx" ON "node_snapshot"("apicHostId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "node_snapshot_apicHostId_dn_key" ON "node_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "hardware_component_apicHostId_nodeId_idx" ON "hardware_component"("apicHostId", "nodeId");

-- CreateIndex
CREATE INDEX "hardware_component_apicHostId_type_idx" ON "hardware_component"("apicHostId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "hardware_component_apicHostId_dn_key" ON "hardware_component"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "node_status_sample_apicHostId_sampledAt_idx" ON "node_status_sample"("apicHostId", "sampledAt");

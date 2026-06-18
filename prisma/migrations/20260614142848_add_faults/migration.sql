-- AlterTable
ALTER TABLE "apic_host" ADD COLUMN "lastFaultSyncAt" DATETIME;

-- CreateTable
CREATE TABLE "fault_snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '',
    "cause" TEXT NOT NULL DEFAULT '',
    "affectedDn" TEXT NOT NULL DEFAULT '',
    "node" TEXT,
    "descr" TEXT NOT NULL DEFAULT '',
    "ack" BOOLEAN NOT NULL DEFAULT false,
    "created" DATETIME,
    "lastTransition" DATETIME,
    "lifecycle" TEXT NOT NULL DEFAULT 'active',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" DATETIME,
    CONSTRAINT "fault_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fault_count_sample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "sampledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "critical" INTEGER NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "warning" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    CONSTRAINT "fault_count_sample_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "fault_snapshot_apicHostId_idx" ON "fault_snapshot"("apicHostId");

-- CreateIndex
CREATE INDEX "fault_snapshot_apicHostId_lifecycle_idx" ON "fault_snapshot"("apicHostId", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "fault_snapshot_apicHostId_dn_key" ON "fault_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "fault_count_sample_apicHostId_sampledAt_idx" ON "fault_count_sample"("apicHostId", "sampledAt");

-- AlterTable
ALTER TABLE "apic_host" ADD COLUMN "lastInterfaceSyncAt" DATETIME;

-- CreateTable
CREATE TABLE "interface_snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "ifName" TEXT NOT NULL,
    "usage" TEXT NOT NULL DEFAULT '',
    "adminSt" TEXT NOT NULL DEFAULT '',
    "operSt" TEXT NOT NULL DEFAULT '',
    "operSpeed" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "lastLinkStChg" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interface_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "interface_sample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "sampledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminSt" TEXT NOT NULL,
    "operSt" TEXT NOT NULL,
    "operSpeed" TEXT NOT NULL,
    "rxBytes" BIGINT NOT NULL,
    "rxPkts" BIGINT NOT NULL,
    "rxErrors" BIGINT NOT NULL,
    "rxDiscards" BIGINT NOT NULL,
    "rxCrcErrors" BIGINT NOT NULL,
    "rxAlignErrors" BIGINT NOT NULL,
    "txBytes" BIGINT NOT NULL,
    "txPkts" BIGINT NOT NULL,
    "txErrors" BIGINT NOT NULL,
    "txDiscards" BIGINT NOT NULL,
    "dRxBytes" BIGINT,
    "dRxErrors" BIGINT,
    "dRxDiscards" BIGINT,
    "dRxCrcErrors" BIGINT,
    "dRxAlignErrors" BIGINT,
    "dTxBytes" BIGINT,
    "dTxErrors" BIGINT,
    "dTxDiscards" BIGINT,
    CONSTRAINT "interface_sample_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "interface_snapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "interface_snapshot_apicHostId_idx" ON "interface_snapshot"("apicHostId");

-- CreateIndex
CREATE UNIQUE INDEX "interface_snapshot_apicHostId_dn_key" ON "interface_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "interface_sample_interfaceId_sampledAt_idx" ON "interface_sample"("interfaceId", "sampledAt");

-- CreateIndex
CREATE INDEX "interface_sample_apicHostId_sampledAt_idx" ON "interface_sample"("apicHostId", "sampledAt");

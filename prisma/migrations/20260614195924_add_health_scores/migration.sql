-- AlterTable
ALTER TABLE "apic_host" ADD COLUMN "lastHealthSyncAt" DATETIME;

-- CreateTable
CREATE TABLE "health_score_snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "node" TEXT,
    "score" INTEGER NOT NULL,
    "twScore" INTEGER,
    "prevScore" INTEGER,
    "maxSeverity" TEXT,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "health_score_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "health_score_sample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "sampledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overall" INTEGER NOT NULL,
    "worstScore" INTEGER NOT NULL,
    "degradedCount" INTEGER NOT NULL,
    CONSTRAINT "health_score_sample_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "health_score_snapshot_apicHostId_idx" ON "health_score_snapshot"("apicHostId");

-- CreateIndex
CREATE INDEX "health_score_snapshot_apicHostId_scope_idx" ON "health_score_snapshot"("apicHostId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "health_score_snapshot_apicHostId_dn_key" ON "health_score_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "health_score_sample_apicHostId_sampledAt_idx" ON "health_score_sample"("apicHostId", "sampledAt");

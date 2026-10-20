-- AlterTable
ALTER TABLE "apic_host" ADD COLUMN     "lastBdSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bd_snapshot" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "vrf" TEXT NOT NULL DEFAULT '',
    "vrfDn" TEXT NOT NULL DEFAULT '',
    "unicastRoute" BOOLEAN,
    "arpFlood" BOOLEAN,
    "ipLearning" BOOLEAN,
    "limitIpLearnToSubnets" BOOLEAN,
    "unkMacUcastAct" TEXT NOT NULL DEFAULT '',
    "unkMcastAct" TEXT NOT NULL DEFAULT '',
    "multiDstPktAct" TEXT NOT NULL DEFAULT '',
    "subnets" JSONB NOT NULL,
    "l3Outs" TEXT[],
    "epgs" JSONB NOT NULL,
    "epgCount" INTEGER NOT NULL DEFAULT 0,
    "searchText" TEXT NOT NULL,

    CONSTRAINT "bd_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bd_snapshot_apicHostId_tenant_idx" ON "bd_snapshot"("apicHostId", "tenant");

-- CreateIndex
CREATE UNIQUE INDEX "bd_snapshot_apicHostId_dn_key" ON "bd_snapshot"("apicHostId", "dn");

-- AddForeignKey
ALTER TABLE "bd_snapshot" ADD CONSTRAINT "bd_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

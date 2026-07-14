-- AlterTable
ALTER TABLE "apic_host" ADD COLUMN     "lastEpgSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "epg_snapshot" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "appProfile" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "bridgeDomain" TEXT NOT NULL DEFAULT '',
    "pcTag" TEXT NOT NULL DEFAULT '',
    "preferredGroup" BOOLEAN NOT NULL DEFAULT false,
    "isolation" BOOLEAN NOT NULL DEFAULT false,
    "domains" TEXT[],
    "providedContracts" TEXT[],
    "consumedContracts" TEXT[],
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epg_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epg_path_binding" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "epgId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "pathTDn" TEXT NOT NULL,
    "pod" TEXT NOT NULL DEFAULT '',
    "node" TEXT NOT NULL DEFAULT '',
    "port" TEXT NOT NULL DEFAULT '',
    "pathType" TEXT NOT NULL DEFAULT 'port',
    "encap" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'trunk',
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epg_path_binding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "epg_snapshot_apicHostId_present_idx" ON "epg_snapshot"("apicHostId", "present");

-- CreateIndex
CREATE INDEX "epg_snapshot_apicHostId_tenant_idx" ON "epg_snapshot"("apicHostId", "tenant");

-- CreateIndex
CREATE UNIQUE INDEX "epg_snapshot_apicHostId_dn_key" ON "epg_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "epg_path_binding_apicHostId_present_idx" ON "epg_path_binding"("apicHostId", "present");

-- CreateIndex
CREATE INDEX "epg_path_binding_apicHostId_node_idx" ON "epg_path_binding"("apicHostId", "node");

-- CreateIndex
CREATE INDEX "epg_path_binding_epgId_idx" ON "epg_path_binding"("epgId");

-- CreateIndex
CREATE UNIQUE INDEX "epg_path_binding_apicHostId_dn_key" ON "epg_path_binding"("apicHostId", "dn");

-- AddForeignKey
ALTER TABLE "epg_snapshot" ADD CONSTRAINT "epg_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epg_path_binding" ADD CONSTRAINT "epg_path_binding_epgId_fkey" FOREIGN KEY ("epgId") REFERENCES "epg_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "resync_schedule" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 480,
    "encUsername" TEXT NOT NULL,
    "encPassword" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastDetail" TEXT,
    "runningAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resync_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resync_schedule_apicHostId_key" ON "resync_schedule"("apicHostId");

-- CreateIndex
CREATE INDEX "resync_schedule_enabled_nextRunAt_idx" ON "resync_schedule"("enabled", "nextRunAt");

-- AddForeignKey
ALTER TABLE "resync_schedule" ADD CONSTRAINT "resync_schedule_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'PLANNED', 'RETIRED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "StackRole" AS ENUM ('MASTER', 'MEMBER');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "heightU" INTEGER NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "Rack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceStack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "DeviceStack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "assetTag" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "rackId" TEXT,
    "rackPosition" INTEGER,
    "vendor" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "heightU" INTEGER NOT NULL,
    "device_stack_id" TEXT,
    "stack_member" INTEGER,
    "stack_role" "StackRole",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Device_assetTag_key" ON "Device"("assetTag");

-- AddForeignKey
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_device_stack_id_fkey" FOREIGN KEY ("device_stack_id") REFERENCES "DeviceStack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

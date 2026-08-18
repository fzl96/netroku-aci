/*
  Warnings:

  - You are about to drop the `Device` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeviceStack` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Rack` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Site` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_device_stack_id_fkey";

-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_rackId_fkey";

-- DropForeignKey
ALTER TABLE "Rack" DROP CONSTRAINT "Rack_siteId_fkey";

-- DropTable
DROP TABLE "Device";

-- DropTable
DROP TABLE "DeviceStack";

-- DropTable
DROP TABLE "Rack";

-- DropTable
DROP TABLE "Site";

-- CreateTable
CREATE TABLE "site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "heightU" INTEGER NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_stack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "device_stack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_serialNumber_key" ON "device"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "device_assetTag_key" ON "device"("assetTag");

-- AddForeignKey
ALTER TABLE "rack" ADD CONSTRAINT "rack_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "rack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_device_stack_id_fkey" FOREIGN KEY ("device_stack_id") REFERENCES "device_stack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

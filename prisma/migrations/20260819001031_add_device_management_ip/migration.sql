/*
  Warnings:

  - A unique constraint covering the columns `[management_ip]` on the table `device` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "device" ADD COLUMN     "management_ip" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "device_management_ip_key" ON "device"("management_ip");

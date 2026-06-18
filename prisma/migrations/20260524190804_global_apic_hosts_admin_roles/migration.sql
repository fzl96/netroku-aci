/*
  Warnings:

  - You are about to drop the column `password` on the `apic_host` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `apic_host` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `apic_host` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "session" ADD COLUMN "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN "banExpires" DATETIME;
ALTER TABLE "user" ADD COLUMN "banReason" TEXT;
ALTER TABLE "user" ADD COLUMN "banned" BOOLEAN DEFAULT false;
ALTER TABLE "user" ADD COLUMN "role" TEXT DEFAULT 'member';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_apic_host" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastInterfaceSyncAt" DATETIME
);
INSERT INTO "new_apic_host" ("createdAt", "host", "id", "lastInterfaceSyncAt", "name", "updatedAt") SELECT "createdAt", "host", "id", "lastInterfaceSyncAt", "name", "updatedAt" FROM "apic_host";
DROP TABLE "apic_host";
ALTER TABLE "new_apic_host" RENAME TO "apic_host";
CREATE UNIQUE INDEX "apic_host_host_key" ON "apic_host"("host");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

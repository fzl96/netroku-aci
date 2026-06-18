-- CreateTable
CREATE TABLE "endpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apicHostId" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "vlan" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "interface" TEXT NOT NULL,
    "epgDescr" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "endpoint_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_apic_host" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "apic_host_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_apic_host" ("createdAt", "host", "id", "name", "updatedAt", "userId") SELECT "createdAt", "host", "id", "name", "updatedAt", "userId" FROM "apic_host";
DROP TABLE "apic_host";
ALTER TABLE "new_apic_host" RENAME TO "apic_host";
CREATE INDEX "apic_host_userId_idx" ON "apic_host"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "endpoint_apicHostId_idx" ON "endpoint"("apicHostId");

-- CreateIndex
CREATE UNIQUE INDEX "endpoint_apicHostId_mac_ip_key" ON "endpoint"("apicHostId", "mac", "ip");

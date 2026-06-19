-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "displayUsername" TEXT,
    "role" TEXT DEFAULT 'member',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "impersonatedBy" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "payload" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apic_host" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastInterfaceSyncAt" TIMESTAMP(3),
    "lastFaultSyncAt" TIMESTAMP(3),
    "lastHealthSyncAt" TIMESTAMP(3),
    "lastNodeSyncAt" TIMESTAMP(3),
    "resyncStartedAt" TIMESTAMP(3),

    CONSTRAINT "apic_host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoint" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "vlan" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "interface" TEXT NOT NULL,
    "epgDescr" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interface_snapshot" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "ifName" TEXT NOT NULL,
    "usage" TEXT NOT NULL DEFAULT '',
    "adminSt" TEXT NOT NULL DEFAULT '',
    "operSt" TEXT NOT NULL DEFAULT '',
    "operSpeed" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "lastLinkStChg" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interface_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interface_sample" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    CONSTRAINT "interface_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fault_snapshot" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '',
    "cause" TEXT NOT NULL DEFAULT '',
    "affectedDn" TEXT NOT NULL DEFAULT '',
    "node" TEXT,
    "descr" TEXT NOT NULL DEFAULT '',
    "ack" BOOLEAN NOT NULL DEFAULT false,
    "created" TIMESTAMP(3),
    "lastTransition" TIMESTAMP(3),
    "lifecycle" TEXT NOT NULL DEFAULT 'active',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "fault_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fault_count_sample" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "critical" INTEGER NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "warning" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "fault_count_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_score_snapshot" (
    "id" TEXT NOT NULL,
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
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_score_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_score_sample" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overall" INTEGER NOT NULL,
    "worstScore" INTEGER NOT NULL,
    "degradedCount" INTEGER NOT NULL,

    CONSTRAINT "health_score_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_snapshot" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "version" TEXT,
    "fabricSt" TEXT NOT NULL DEFAULT '',
    "state" TEXT,
    "podId" TEXT,
    "uptime" TEXT,
    "oobMgmtAddr" TEXT,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hardware_component" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "operSt" TEXT NOT NULL DEFAULT '',
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hardware_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_status_sample" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nodesTotal" INTEGER NOT NULL,
    "nodesOnline" INTEGER NOT NULL,
    "componentsTotal" INTEGER NOT NULL,
    "componentsFailed" INTEGER NOT NULL,

    CONSTRAINT "node_status_sample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "apic_host_host_key" ON "apic_host"("host");

-- CreateIndex
CREATE INDEX "endpoint_apicHostId_idx" ON "endpoint"("apicHostId");

-- CreateIndex
CREATE INDEX "endpoint_apicHostId_mac_ip_idx" ON "endpoint"("apicHostId", "mac", "ip");

-- CreateIndex
CREATE INDEX "interface_snapshot_apicHostId_idx" ON "interface_snapshot"("apicHostId");

-- CreateIndex
CREATE UNIQUE INDEX "interface_snapshot_apicHostId_dn_key" ON "interface_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "interface_sample_interfaceId_sampledAt_idx" ON "interface_sample"("interfaceId", "sampledAt");

-- CreateIndex
CREATE INDEX "interface_sample_apicHostId_sampledAt_idx" ON "interface_sample"("apicHostId", "sampledAt");

-- CreateIndex
CREATE INDEX "fault_snapshot_apicHostId_idx" ON "fault_snapshot"("apicHostId");

-- CreateIndex
CREATE INDEX "fault_snapshot_apicHostId_lifecycle_idx" ON "fault_snapshot"("apicHostId", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "fault_snapshot_apicHostId_dn_key" ON "fault_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "fault_count_sample_apicHostId_sampledAt_idx" ON "fault_count_sample"("apicHostId", "sampledAt");

-- CreateIndex
CREATE INDEX "health_score_snapshot_apicHostId_idx" ON "health_score_snapshot"("apicHostId");

-- CreateIndex
CREATE INDEX "health_score_snapshot_apicHostId_scope_idx" ON "health_score_snapshot"("apicHostId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "health_score_snapshot_apicHostId_dn_key" ON "health_score_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "health_score_sample_apicHostId_sampledAt_idx" ON "health_score_sample"("apicHostId", "sampledAt");

-- CreateIndex
CREATE INDEX "node_snapshot_apicHostId_idx" ON "node_snapshot"("apicHostId");

-- CreateIndex
CREATE INDEX "node_snapshot_apicHostId_role_idx" ON "node_snapshot"("apicHostId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "node_snapshot_apicHostId_dn_key" ON "node_snapshot"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "hardware_component_apicHostId_nodeId_idx" ON "hardware_component"("apicHostId", "nodeId");

-- CreateIndex
CREATE INDEX "hardware_component_apicHostId_type_idx" ON "hardware_component"("apicHostId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "hardware_component_apicHostId_dn_key" ON "hardware_component"("apicHostId", "dn");

-- CreateIndex
CREATE INDEX "node_status_sample_apicHostId_sampledAt_idx" ON "node_status_sample"("apicHostId", "sampledAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint" ADD CONSTRAINT "endpoint_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interface_snapshot" ADD CONSTRAINT "interface_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interface_sample" ADD CONSTRAINT "interface_sample_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "interface_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fault_snapshot" ADD CONSTRAINT "fault_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fault_count_sample" ADD CONSTRAINT "fault_count_sample_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_score_snapshot" ADD CONSTRAINT "health_score_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_score_sample" ADD CONSTRAINT "health_score_sample_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_snapshot" ADD CONSTRAINT "node_snapshot_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_component" ADD CONSTRAINT "hardware_component_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_status_sample" ADD CONSTRAINT "node_status_sample_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Expressions mirror src/lib/global-search/catalog.ts. Keep them in sync.

CREATE INDEX "endpoint_global_search_trgm_idx" ON "endpoint" USING gin ((lower(coalesce("mac", '') || ' ' || coalesce("ip", '') || ' ' || coalesce("vlan", '') || ' ' || coalesce("node", '') || ' ' || coalesce("interface", '') || ' ' || coalesce("epgDescr", '') || ' ' || coalesce("dn", ''))) gin_trgm_ops);

CREATE INDEX "endpoint_search_mac_trgm_idx" ON "endpoint" USING gin ((translate(lower(mac), ':.- ', '')) gin_trgm_ops);

CREATE INDEX "epg_snapshot_global_search_trgm_idx" ON "epg_snapshot" USING gin ((lower(coalesce("name", '') || ' ' || coalesce("tenant", '') || ' ' || coalesce("appProfile", '') || ' ' || coalesce("description", '') || ' ' || coalesce("bridgeDomain", '') || ' ' || coalesce("dn", ''))) gin_trgm_ops);

CREATE INDEX "node_snapshot_global_search_trgm_idx" ON "node_snapshot" USING gin ((lower(coalesce("name", '') || ' ' || coalesce("nodeId", '') || ' ' || coalesce("serial", '') || ' ' || coalesce("oobMgmtAddr", '') || ' ' || coalesce("dn", ''))) gin_trgm_ops);

CREATE INDEX "legacy_device_global_search_trgm_idx" ON "legacy_device" USING gin ((lower(coalesce("hostname", '') || ' ' || coalesce("managementIp", '') || ' ' || coalesce("serialNumber", '') || ' ' || coalesce("site", '') || ' ' || coalesce("vendor", '') || ' ' || coalesce("model", '') || ' ' || coalesce("location", ''))) gin_trgm_ops);

CREATE INDEX "legacy_endpoint_global_search_trgm_idx" ON "legacy_endpoint" USING gin ((lower(coalesce("mac", '') || ' ' || coalesce("ip", '') || ' ' || coalesce("vlan", '') || ' ' || coalesce("vlanName", '') || ' ' || coalesce("interface", '') || ' ' || coalesce("learningType", ''))) gin_trgm_ops);

CREATE INDEX "legacy_endpoint_search_mac_trgm_idx" ON "legacy_endpoint" USING gin ((translate(lower(mac), ':.- ', '')) gin_trgm_ops);

CREATE INDEX "site_global_search_trgm_idx" ON "site" USING gin ((lower(coalesce("name", '') || ' ' || coalesce("address", ''))) gin_trgm_ops);

CREATE INDEX "rack_global_search_trgm_idx" ON "rack" USING gin ((lower(coalesce("name", ''))) gin_trgm_ops);

CREATE INDEX "device_global_search_trgm_idx" ON "device" USING gin ((lower(coalesce("name", '') || ' ' || coalesce("serialNumber", '') || ' ' || coalesce("assetTag", '') || ' ' || coalesce("management_ip", '') || ' ' || coalesce("vendor", '') || ' ' || coalesce("model", ''))) gin_trgm_ops);

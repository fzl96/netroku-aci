BEGIN;

ALTER TABLE endpoint ADD COLUMN "epgDn" TEXT NOT NULL DEFAULT '', ADD COLUMN "epgId" TEXT;
UPDATE endpoint SET "epgDn" = regexp_replace(dn, '/cep-[^/]+$', '');
UPDATE endpoint e SET "epgId" = epg.id
FROM epg_snapshot epg
WHERE epg."apicHostId" = e."apicHostId" AND epg.dn = e."epgDn";

CREATE INDEX "endpoint_apicHostId_epgDn_isActive_idx" ON endpoint ("apicHostId", "epgDn", "isActive");
CREATE INDEX "endpoint_apicHostId_epgId_idx" ON endpoint ("apicHostId", "epgId");
-- Refresh clears obsolete links before pruning snapshots, preserving endpoint history.
ALTER TABLE endpoint ADD CONSTRAINT "endpoint_apicHostId_epgId_fkey"
FOREIGN KEY ("apicHostId", "epgId") REFERENCES epg_snapshot ("apicHostId", id)
ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;

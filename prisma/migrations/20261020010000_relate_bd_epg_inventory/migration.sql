BEGIN;

-- AlterTable
ALTER TABLE "epg_snapshot" ADD COLUMN     "bridgeDomainDn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bridgeDomainState" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "bd_epg_relation" (
    "id" TEXT NOT NULL,
    "apicHostId" TEXT NOT NULL,
    "bdId" TEXT NOT NULL,
    "epgId" TEXT,
    "dn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "appProfile" TEXT NOT NULL,

    CONSTRAINT "bd_epg_relation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bd_epg_relation_bdId_idx" ON "bd_epg_relation"("bdId");

-- CreateIndex
CREATE UNIQUE INDEX "bd_epg_relation_apicHostId_dn_key" ON "bd_epg_relation"("apicHostId", "dn");

-- CreateIndex
CREATE UNIQUE INDEX "bd_epg_relation_apicHostId_epgId_key" ON "bd_epg_relation"("apicHostId", "epgId");

-- CreateIndex
CREATE UNIQUE INDEX "bd_snapshot_apicHostId_id_key" ON "bd_snapshot"("apicHostId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "epg_snapshot_apicHostId_id_key" ON "epg_snapshot"("apicHostId", "id");

-- AddForeignKey
ALTER TABLE "bd_epg_relation" ADD CONSTRAINT "bd_epg_relation_apicHostId_fkey" FOREIGN KEY ("apicHostId") REFERENCES "apic_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bd_epg_relation" ADD CONSTRAINT "bd_epg_relation_apicHostId_bdId_fkey" FOREIGN KEY ("apicHostId", "bdId") REFERENCES "bd_snapshot"("apicHostId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bd_epg_relation" ADD CONSTRAINT "bd_epg_relation_apicHostId_epgId_fkey" FOREIGN KEY ("apicHostId", "epgId") REFERENCES "epg_snapshot"("apicHostId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Validate the legacy lists before removing their storage. Conflicting memberships
-- must be resolved from APIC rather than choosing an arbitrary Bridge Domain.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bd_snapshot WHERE jsonb_typeof(epgs) IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'Invalid legacy BD EPG list; refresh BD inventory before migrating';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bd_snapshot b CROSS JOIN LATERAL jsonb_array_elements(b.epgs) AS e(value)
    WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'object'
      OR COALESCE(e.value->>'dn', '') !~ '^uni/tn-[^/]+/ap-[^/]+/epg-[^/]+$'
  ) THEN
    RAISE EXCEPTION 'Invalid legacy EPG identity; refresh BD inventory before migrating';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bd_snapshot b CROSS JOIN LATERAL jsonb_array_elements(b.epgs) AS e(value)
    GROUP BY b."apicHostId", e.value->>'dn' HAVING COUNT(DISTINCT b.id) > 1
  ) THEN
    RAISE EXCEPTION 'Conflicting legacy BD EPG memberships; refresh BD inventory before migrating';
  END IF;
END $$;

-- Exact host + EPG DN matches backfill the snapshot FK. Identities whose full
-- snapshot is not collected yet remain visible with a NULL epgId.
INSERT INTO bd_epg_relation (id, "apicHostId", "bdId", "epgId", dn, name, tenant, "appProfile")
SELECT DISTINCT ON (b."apicHostId", e.value->>'dn')
  md5(b.id || ':' || (e.value->>'dn')), b."apicHostId", b.id, epg.id, e.value->>'dn',
  COALESCE(e.value->>'name', split_part(e.value->>'dn', '/epg-', 2)),
  COALESCE(e.value->>'tenant', split_part(split_part(e.value->>'dn', '/', 2), 'tn-', 2)),
  COALESCE(e.value->>'appProfile', split_part(split_part(e.value->>'dn', '/', 3), 'ap-', 2))
FROM bd_snapshot b CROSS JOIN LATERAL jsonb_array_elements(b.epgs) AS e(value)
LEFT JOIN epg_snapshot epg ON epg."apicHostId" = b."apicHostId" AND epg.dn = e.value->>'dn'
ORDER BY b."apicHostId", e.value->>'dn', b.id;

-- Only configuration stays denormalized for substring search. EPG searches use
-- the relation table so a later EPG refresh cannot leave stale cached identity text.
UPDATE bd_snapshot b SET "searchText" = concat_ws(E'\n', b.name, b.tenant, b.dn,
  b.description, b.vrf, b."vrfDn", array_to_string(b."l3Outs", E'\n'),
  (SELECT string_agg(s.value->>'ip', E'\n') FROM jsonb_array_elements(b.subnets) AS s(value)));

ALTER TABLE bd_snapshot DROP COLUMN "epgs", DROP COLUMN "epgCount";

COMMIT;

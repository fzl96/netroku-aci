-- Postgres advisory transaction locks now serialize endpoint reconciles.
ALTER TABLE "apic_host" DROP COLUMN "resyncStartedAt";

import { Prisma } from '@prisma/client'

export type LegacyStateChangeQueryExecutor = (
  query: Prisma.Sql,
) => Promise<Array<{ interfaceId: string }>>

export function buildLegacyStateChangedInterfaceIdsQuery(
  windowStart: Date,
): Prisma.Sql {
  return Prisma.sql`
    WITH present_interfaces AS (
      SELECT id
      FROM legacy_interface_snapshot
      WHERE present = TRUE
    ), baseline AS (
      SELECT
        present_interfaces.id AS "interfaceId",
        previous."collectedAt",
        previous."adminSt",
        previous."operSt"
      FROM present_interfaces
      JOIN LATERAL (
        SELECT sample."collectedAt", sample."adminSt", sample."operSt"
        FROM legacy_interface_sample AS sample
        WHERE sample."interfaceId" = present_interfaces.id
          AND sample."collectedAt" < ${windowStart}
        ORDER BY sample."collectedAt" DESC
        LIMIT 1
      ) AS previous ON TRUE
    ), candidate_samples AS (
      SELECT
        sample."interfaceId",
        sample."collectedAt",
        sample."adminSt",
        sample."operSt"
      FROM legacy_interface_sample AS sample
      JOIN present_interfaces ON present_interfaces.id = sample."interfaceId"
      WHERE sample."collectedAt" >= ${windowStart}

      UNION ALL

      SELECT "interfaceId", "collectedAt", "adminSt", "operSt"
      FROM baseline
    ), with_previous AS (
      SELECT
        "interfaceId",
        "collectedAt",
        "adminSt",
        "operSt",
        LAG("collectedAt") OVER state_history AS "previousCollectedAt",
        LAG("adminSt") OVER state_history AS "previousAdminSt",
        LAG("operSt") OVER state_history AS "previousOperSt"
      FROM candidate_samples
      WINDOW state_history AS (
        PARTITION BY "interfaceId"
        ORDER BY "collectedAt"
      )
    )
    SELECT DISTINCT "interfaceId"
    FROM with_previous
    WHERE "collectedAt" >= ${windowStart}
      AND "previousCollectedAt" IS NOT NULL
      AND (
        "previousAdminSt" IS DISTINCT FROM "adminSt"
        OR "previousOperSt" IS DISTINCT FROM "operSt"
      )
  `
}

export async function queryLegacyStateChangedInterfaceIds(
  execute: LegacyStateChangeQueryExecutor,
  windowStart: Date,
): Promise<string[]> {
  const rows = await execute(buildLegacyStateChangedInterfaceIdsQuery(windowStart))
  return rows.map(row => row.interfaceId)
}

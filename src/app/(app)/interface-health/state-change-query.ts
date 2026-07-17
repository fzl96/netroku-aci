import { Prisma } from '@prisma/client'

export type StateChangeQueryExecutor = (
  query: Prisma.Sql,
) => Promise<Array<{ interfaceId: string }>>

export function buildStateChangedInterfaceIdsQuery(
  apicHostId: string,
  windowStart: Date,
): Prisma.Sql {
  return Prisma.sql`
    WITH host_interfaces AS (
      SELECT id
      FROM interface_snapshot
      WHERE "apicHostId" = ${apicHostId}
    ), baseline AS (
      SELECT
        host_interfaces.id AS "interfaceId",
        previous."sampledAt",
        previous."adminSt",
        previous."operSt"
      FROM host_interfaces
      JOIN LATERAL (
        SELECT sample."sampledAt", sample."adminSt", sample."operSt"
        FROM interface_sample AS sample
        WHERE sample."interfaceId" = host_interfaces.id
          AND sample."sampledAt" < ${windowStart}
        ORDER BY sample."sampledAt" DESC
        LIMIT 1
      ) AS previous ON TRUE
    ), candidate_samples AS (
      SELECT
        sample."interfaceId",
        sample."sampledAt",
        sample."adminSt",
        sample."operSt"
      FROM interface_sample AS sample
      WHERE sample."apicHostId" = ${apicHostId}
        AND sample."sampledAt" >= ${windowStart}

      UNION ALL

      SELECT "interfaceId", "sampledAt", "adminSt", "operSt"
      FROM baseline
    ), with_previous AS (
      SELECT
        "interfaceId",
        "sampledAt",
        LOWER("adminSt") AS "adminSt",
        LOWER("operSt") AS "operSt",
        LAG("sampledAt") OVER state_history AS "previousSampledAt",
        LAG(LOWER("adminSt")) OVER state_history AS "previousAdminSt",
        LAG(LOWER("operSt")) OVER state_history AS "previousOperSt"
      FROM candidate_samples
      WINDOW state_history AS (
        PARTITION BY "interfaceId"
        ORDER BY "sampledAt"
      )
    )
    SELECT DISTINCT "interfaceId"
    FROM with_previous
    WHERE "sampledAt" >= ${windowStart}
      AND "previousSampledAt" IS NOT NULL
      AND (
        "previousAdminSt" IS DISTINCT FROM "adminSt"
        OR "previousOperSt" IS DISTINCT FROM "operSt"
      )
  `
}

export async function queryStateChangedInterfaceIds(
  execute: StateChangeQueryExecutor,
  apicHostId: string,
  windowStart: Date,
): Promise<string[]> {
  const rows = await execute(buildStateChangedInterfaceIdsQuery(apicHostId, windowStart))
  return rows.map((row) => row.interfaceId)
}

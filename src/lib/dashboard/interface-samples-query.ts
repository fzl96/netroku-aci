import { Prisma } from '@prisma/client'

/** Seek once per interface using the (interfaceId, sampledAt) index. */
export function buildDashboardInterfaceSamplesQuery(): Prisma.Sql {
  return Prisma.sql`
    SELECT interfaces.id AS "interfaceId", latest.*
    FROM interface_snapshot AS interfaces
    JOIN LATERAL (
      SELECT sample."sampledAt", sample."dRxErrors", sample."dTxErrors",
        sample."dRxDiscards", sample."dTxDiscards",
        sample."dRxCrcErrors", sample."dRxAlignErrors"
      FROM interface_sample AS sample
      WHERE sample."interfaceId" = interfaces.id
      ORDER BY sample."sampledAt" DESC
      LIMIT 1
    ) AS latest ON TRUE
  `
}

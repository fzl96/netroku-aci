import { Prisma } from '@prisma/client'

export type LegacyLatestSampleRow = {
  interfaceId: string
  collectedAt: Date
  inputErrors: bigint
  outputErrors: bigint
  crcErrors: bigint
  dInputErrors: bigint | null
  dOutputErrors: bigint | null
  dCrcErrors: bigint | null
}

export type LegacyLatestSampleQueryExecutor = (
  query: Prisma.Sql,
) => Promise<LegacyLatestSampleRow[]>

/** The newest sample for each of the given interfaces.
 *
 *  Asking Prisma for `samples: { take: 1 }` on a relation compiles to a window
 *  function ranking every row of the sample table, so the cost grows with how
 *  long history is rather than with how many interfaces are being listed. A
 *  lateral `LIMIT 1` is instead one seek per interface against the existing
 *  ([interfaceId, collectedAt]) index, which is bounded by the result set. */
export function buildLegacyLatestSampleQuery(interfaceIds: string[]): Prisma.Sql {
  return Prisma.sql`
    SELECT
      requested.id AS "interfaceId",
      latest."collectedAt",
      latest."inputErrors",
      latest."outputErrors",
      latest."crcErrors",
      latest."dInputErrors",
      latest."dOutputErrors",
      latest."dCrcErrors"
    FROM UNNEST(${interfaceIds}::text[]) AS requested(id)
    JOIN LATERAL (
      SELECT
        sample."collectedAt",
        sample."inputErrors",
        sample."outputErrors",
        sample."crcErrors",
        sample."dInputErrors",
        sample."dOutputErrors",
        sample."dCrcErrors"
      FROM legacy_interface_sample AS sample
      WHERE sample."interfaceId" = requested.id
      ORDER BY sample."collectedAt" DESC
      LIMIT 1
    ) AS latest ON TRUE
  `
}

/** An interface that has never been sampled is simply absent from the result,
 *  which is what leaves its row's counters blank. */
export async function queryLegacyLatestSamples(
  execute: LegacyLatestSampleQueryExecutor,
  interfaceIds: string[],
): Promise<Map<string, LegacyLatestSampleRow>> {
  if (interfaceIds.length === 0) return new Map()
  const rows = await execute(buildLegacyLatestSampleQuery(interfaceIds))
  return new Map(rows.map((row) => [row.interfaceId, row]))
}

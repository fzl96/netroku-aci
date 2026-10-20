import { z } from 'zod'

const objectSchema = z.object({ attributes: z.object({ dn: z.string().min(1) }) })
const responseSchema = z.object({
  imdata: z.array(z.unknown()),
  totalCount: z.string().regex(/^\d+$/).transform(Number),
})
type FetchPage = (path: string) => Promise<unknown>

/** Reject partial/malformed responses before replacing the previous successful snapshot. */
export async function fetchApicClassPages(
  className: 'fvBD' | 'fvAEPg',
  children: string,
  fetchPage: FetchPage,
) {
  const rows: unknown[] = []
  const seen = new Set<string>()
  let expectedTotal: number | undefined
  for (let page = 0; ; page++) {
    const path = `/api/node/class/${className}.json?rsp-subtree=children&rsp-subtree-class=${children}&order-by=${className}.dn|asc&page-size=500&page=${page}`
    const data = responseSchema.parse(await fetchPage(path))
    if (!Number.isSafeInteger(data.totalCount)) throw new Error('Invalid APIC inventory count')
    if (expectedTotal !== undefined && data.totalCount !== expectedTotal)
      throw new Error('APIC inventory changed during collection; retry resync')
    expectedTotal = data.totalCount
    for (const item of data.imdata) {
      const envelope = z.record(z.string(), z.unknown()).parse(item)
      const dn = objectSchema.parse(envelope[className]).attributes.dn
      if (!dn || seen.has(dn)) throw new Error('Incomplete or duplicate APIC inventory page')
      seen.add(dn)
      rows.push(item)
    }
    if (rows.length === expectedTotal) return rows
    if (!data.imdata.length || rows.length > expectedTotal)
      throw new Error('Incomplete APIC inventory response')
  }
}

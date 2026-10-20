import { bdExportSchema } from '@/lib/bds/params'
import { getBdExportData } from '@/lib/bds/query'
import { bdExportFilename, buildBdWorkbook, serializeBdWorkbook } from '@/lib/bds/export'

export async function POST(request: Request) {
  const parsed = bdExportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid export request' }, { status: 400 })
  try {
    const data = await getBdExportData({ hostId: parsed.data.apicHostId, ...parsed.data })
    if (data.kind === 'unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (data.kind === 'host-not-found')
      return Response.json({ error: 'Host not found' }, { status: 404 })
    if (!data.rows.length)
      return Response.json({ error: 'No Bridge Domains available for export' }, { status: 422 })
    const bytes = serializeBdWorkbook(buildBdWorkbook(data.rows))
    const body = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(body).set(bytes)
    return new Response(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${bdExportFilename(data.host.name, parsed.data.scope)}"`,
        'Content-Length': String(bytes.byteLength),
      },
    })
  } catch {
    return Response.json({ error: 'Failed to prepare Bridge Domain export' }, { status: 500 })
  }
}

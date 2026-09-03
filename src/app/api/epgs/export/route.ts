import { buildEpgExportFilename, buildEpgWorkbook, serializeEpgWorkbook } from '@/lib/epgs/export'
import { getEpgExportData } from '@/lib/epgs/query'
import { epgExportSchema } from '@/lib/schemas/epg-export'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = epgExportSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid export request' }, { status: 400 })
  let data: Awaited<ReturnType<typeof getEpgExportData>>
  try {
    data = await getEpgExportData({
      hostId: parsed.data.apicHostId,
      scope: parsed.data.scope,
      filters: parsed.data.filters,
    })
  } catch {
    return Response.json({ error: 'Failed to prepare EPG export' }, { status: 500 })
  }
  if (data.kind === 'unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (data.kind === 'host-not-found')
    return Response.json({ error: 'Host not found' }, { status: 404 })
  if (data.kind === 'empty')
    return Response.json({ error: 'No EPGs available for export' }, { status: 422 })
  try {
    const bytes = serializeEpgWorkbook(buildEpgWorkbook(data.rows, parsed.data.groupBy))
    const filename = buildEpgExportFilename({
      hostName: data.host.name,
      scope: parsed.data.scope,
      groupBy: parsed.data.groupBy,
    })
    const responseBody = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(responseBody).set(bytes)
    return new Response(responseBody, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(bytes.byteLength),
      },
    })
  } catch {
    return Response.json({ error: 'Failed to generate workbook' }, { status: 500 })
  }
}

import {
  buildEndpointExportFilename,
  buildEndpointWorkbook,
  serializeEndpointWorkbook,
} from '@/lib/endpoints/export'
import { getEndpointExportData } from '@/lib/endpoints/query'
import { endpointExportSchema } from '@/lib/schemas/endpoint-export'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = endpointExportSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid export request' }, { status: 400 })
  }

  let data: Awaited<ReturnType<typeof getEndpointExportData>>
  try {
    data = await getEndpointExportData({
      hostId: parsed.data.apicHostId,
      scope: parsed.data.scope,
      filters: parsed.data.filters,
    })
  } catch {
    return Response.json({ error: 'Failed to prepare endpoint export' }, { status: 500 })
  }

  if (data.kind === 'unauthorized') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (data.kind === 'host-not-found') {
    return Response.json({ error: 'Host not found' }, { status: 404 })
  }
  if (data.kind === 'empty') {
    return Response.json({ error: 'No endpoints available for export' }, { status: 422 })
  }

  try {
    const workbook = buildEndpointWorkbook(data.rows, parsed.data.groupBy)
    const bytes = serializeEndpointWorkbook(workbook)
    const filename = buildEndpointExportFilename({
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

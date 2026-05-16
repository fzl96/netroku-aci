import { headers } from 'next/headers'
import * as XLSX from 'xlsx'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildEndpointWhere } from '@/lib/endpoints/query'
import { buildEndpointWorkbook } from '@/lib/endpoints/export'
import { endpointExportSchema } from '@/lib/schemas/endpoint-export'

function safeFilenameSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'host'
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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

  const apicHost = await prisma.apicHost.findFirst({
    where: { id: parsed.data.apicHostId, userId: session.user.id },
  })
  if (!apicHost) return Response.json({ error: 'Host not found' }, { status: 404 })

  const where = parsed.data.scope === 'all'
    ? { apicHostId: apicHost.id }
    : buildEndpointWhere(apicHost.id, parsed.data.filters ?? {})

  const endpoints = await prisma.endpoint.findMany({
    where,
    orderBy: { lastSeenAt: 'desc' },
  })

  if (endpoints.length === 0) {
    return Response.json({ error: 'No endpoints available for export' }, { status: 422 })
  }

  try {
    const workbook = buildEndpointWorkbook(endpoints, parsed.data.groupBy)
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      cellDates: true,
    }) as Buffer
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = [
      'endpoints',
      safeFilenameSegment(apicHost.name),
      parsed.data.scope,
      `by-${parsed.data.groupBy}`,
      timestamp,
    ].join('-')

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        'Content-Length': String(buffer.byteLength),
      },
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to generate workbook' },
      { status: 500 },
    )
  }
}

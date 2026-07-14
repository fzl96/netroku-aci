import { headers } from 'next/headers'
import * as XLSX from 'xlsx-js-style'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildEpgWhere } from '@/lib/epgs/query'
import { buildEpgWorkbook, filterEpgsByNode } from '@/lib/epgs/export'
import { epgExportSchema } from '@/lib/schemas/epg-export'

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

  const parsed = epgExportSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid export request' }, { status: 400 })
  }

  const apicHost = await prisma.apicHost.findFirst({
    where: { id: parsed.data.apicHostId },
  })
  if (!apicHost) return Response.json({ error: 'Host not found' }, { status: 404 })

  const filters = parsed.data.filters ?? {}
  const where = parsed.data.scope === 'all'
    ? { apicHostId: apicHost.id }
    : buildEpgWhere(apicHost.id, { query: filters.query, tenant: filters.tenant, ap: filters.ap })

  let epgs = await prisma.epgSnapshot.findMany({
    where,
    orderBy: [{ tenant: 'asc' }, { name: 'asc' }],
    include: { bindings: { orderBy: [{ node: 'asc' }, { port: 'asc' }] } },
  })

  if (parsed.data.scope === 'filtered' && filters.node?.length) {
    epgs = filterEpgsByNode(epgs, filters.node)
  }

  if (epgs.length === 0) {
    return Response.json({ error: 'No EPGs available for export' }, { status: 422 })
  }

  try {
    const workbook = buildEpgWorkbook(epgs, parsed.data.groupBy)
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = [
      'epgs',
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

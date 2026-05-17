import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const exportSchema = z.object({
  apicHostId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  // Optional usage filter so users can scope an export to access ports etc.
  usage: z.array(z.string()).optional(),
})

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function bigIntOrEmpty(value: bigint | null): string {
  return value === null ? '' : value.toString()
}

function safeFilenameSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    || 'host'
  )
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

  const parsed = exportSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid export request' }, { status: 400 })
  }

  const apicHost = await prisma.apicHost.findFirst({
    where: { id: parsed.data.apicHostId, userId: session.user.id },
  })
  if (!apicHost) return Response.json({ error: 'Host not found' }, { status: 404 })

  const from = parsed.data.from ? new Date(parsed.data.from) : null
  const to = parsed.data.to ? new Date(parsed.data.to) : null

  const usageFilter
    = parsed.data.usage && parsed.data.usage.length > 0
      ? { usage: { in: parsed.data.usage } }
      : {}

  const samples = await prisma.interfaceSample.findMany({
    where: {
      apicHostId: apicHost.id,
      ...(from || to
        ? {
            sampledAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(parsed.data.usage && parsed.data.usage.length > 0
        ? { interface: usageFilter }
        : {}),
    },
    orderBy: [{ sampledAt: 'asc' }, { interfaceId: 'asc' }],
    include: {
      interface: {
        select: { node: true, ifName: true, usage: true, description: true, dn: true },
      },
    },
  })

  if (samples.length === 0) {
    return Response.json({ error: 'No samples available for export' }, { status: 422 })
  }

  const header = [
    'sampledAt',
    'node',
    'ifName',
    'usage',
    'description',
    'adminSt',
    'operSt',
    'operSpeed',
    'rxBytes',
    'rxPkts',
    'rxErrors',
    'rxDiscards',
    'rxCrcErrors',
    'rxAlignErrors',
    'txBytes',
    'txPkts',
    'txErrors',
    'txDiscards',
    'dRxBytes',
    'dRxErrors',
    'dRxDiscards',
    'dRxCrcErrors',
    'dRxAlignErrors',
    'dTxBytes',
    'dTxErrors',
    'dTxDiscards',
  ]

  const lines: string[] = [header.join(',')]
  for (const s of samples) {
    lines.push(
      [
        csvEscape(s.sampledAt.toISOString()),
        csvEscape(s.interface.node),
        csvEscape(s.interface.ifName),
        csvEscape(s.interface.usage),
        csvEscape(s.interface.description),
        csvEscape(s.adminSt),
        csvEscape(s.operSt),
        csvEscape(s.operSpeed),
        csvEscape(s.rxBytes.toString()),
        csvEscape(s.rxPkts.toString()),
        csvEscape(s.rxErrors.toString()),
        csvEscape(s.rxDiscards.toString()),
        csvEscape(s.rxCrcErrors.toString()),
        csvEscape(s.rxAlignErrors.toString()),
        csvEscape(s.txBytes.toString()),
        csvEscape(s.txPkts.toString()),
        csvEscape(s.txErrors.toString()),
        csvEscape(s.txDiscards.toString()),
        csvEscape(bigIntOrEmpty(s.dRxBytes)),
        csvEscape(bigIntOrEmpty(s.dRxErrors)),
        csvEscape(bigIntOrEmpty(s.dRxDiscards)),
        csvEscape(bigIntOrEmpty(s.dRxCrcErrors)),
        csvEscape(bigIntOrEmpty(s.dRxAlignErrors)),
        csvEscape(bigIntOrEmpty(s.dTxBytes)),
        csvEscape(bigIntOrEmpty(s.dTxErrors)),
        csvEscape(bigIntOrEmpty(s.dTxDiscards)),
      ].join(','),
    )
  }
  const csv = lines.join('\n') + '\n'

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = ['interfaces', safeFilenameSegment(apicHost.name), timestamp].join('-')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  })
}

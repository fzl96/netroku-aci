import { z } from 'zod'
import { buildInterfaceSamplesCsv, interfaceExportFilename } from '@/lib/interface-health/export'
import { getInterfaceExport, InterfaceReadError } from '@/lib/interface-health/query'

const exportSchema = z.object({
  apicHostId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  // Optional node filter so users can scope an export to selected switches.
  node: z.array(z.string()).optional(),
})

export async function POST(request: Request) {
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

  let result: Awaited<ReturnType<typeof getInterfaceExport>>
  try {
    result = await getInterfaceExport({
      hostId: parsed.data.apicHostId,
      from: parsed.data.from ? new Date(parsed.data.from) : null,
      to: parsed.data.to ? new Date(parsed.data.to) : null,
      nodes: parsed.data.node ?? [],
    })
  } catch (error) {
    if (error instanceof InterfaceReadError) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    throw error
  }

  if (!result) return Response.json({ error: 'Host not found' }, { status: 404 })
  if (result.samples.length === 0) {
    return Response.json({ error: 'No samples available for export' }, { status: 422 })
  }

  const filename = interfaceExportFilename(result.hostName, new Date())
  return new Response(buildInterfaceSamplesCsv(result.samples), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  })
}

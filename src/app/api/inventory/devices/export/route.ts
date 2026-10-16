import {
  buildDeviceExportFilename,
  buildDeviceWorkbook,
  serializeDeviceWorkbook,
} from '@/lib/inventory/devices/export'
import { getDeviceExportData } from '@/lib/inventory/devices/query'
import { InventoryReadError } from '@/lib/inventory/errors'
import { deviceExportSchema } from '@/lib/schemas/device-export'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = deviceExportSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid export request' }, { status: 400 })
  }

  try {
    const devices = await getDeviceExportData(parsed.data)
    if (devices.length === 0) {
      return Response.json({ error: 'No devices available for export' }, { status: 422 })
    }

    const bytes = serializeDeviceWorkbook(buildDeviceWorkbook(devices))
    const responseBody = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(responseBody).set(bytes)
    return new Response(responseBody, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${buildDeviceExportFilename(parsed.data.scope)}"`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    if (error instanceof InventoryReadError && error.code === 'unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[inventory] failed to export devices', error)
    return Response.json({ error: 'Failed to export devices' }, { status: 500 })
  }
}

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { IconServer } from '@tabler/icons-react'
import { getSession } from '@/lib/auth'
import { getDeviceById } from '@/actions/inventory/devices'

const STATUS_BADGE_CLS: Record<string, string> = {
  ACTIVE: 'bg-green-500/15 text-green-700 dark:text-green-400',
  PLANNED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  MAINTENANCE: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  RETIRED: 'bg-muted text-muted-foreground',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const device = await getDeviceById(id)
  return { title: device?.name ?? 'Device' }
}

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { id } = await params
  const device = await getDeviceById(id)
  if (!device) notFound()

  return (
    <div className="px-8 py-6 space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-border p-6">
        <div className="bg-muted flex size-16 items-center justify-center rounded-lg">
          <IconServer size={28} stroke={1.5} className="text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{device.name}</h1>
          <p className="text-muted-foreground text-sm">{device.vendor} {device.model}</p>
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLS[device.status] ?? ''}`}>
            {device.status}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">General Information</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Serial</dt>
              <dd className="font-mono">{device.serialNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Asset Tag</dt>
              <dd className="font-mono">{device.assetTag ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last Updated</dt>
              <dd>{new Date(device.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Hardware</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Vendor</dt>
              <dd>{device.vendor}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Model</dt>
              <dd>{device.model}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Height</dt>
              <dd>{device.heightU}U</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Location</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Site</dt>
              <dd>
                {device.rack ? (
                  <Link href={`/inventory/racks?siteId=${device.rack.site.id}`} className="text-primary hover:underline">
                    {device.rack.site.name}
                  </Link>
                ) : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Rack</dt>
              <dd>{device.rack?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Position</dt>
              <dd>{device.rackPosition != null ? `Unit ${device.rackPosition}` : '—'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

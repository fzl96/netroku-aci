import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SourcePanel } from '@/components/inventory/discovered/source-panel'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getDeviceById, type SafeDeviceDetail } from '@/lib/inventory/devices/query'
import { cn } from '@/lib/utils'
import { DetailSection } from './detail-section'
import { DevicesRegionError } from './devices-region-error'
import { DeviceStatusBadge } from './device-status-badge'
import { RackLocator, unitRange } from './rack-locator'

const UPDATED_AT_FORMAT = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

const ROLE_LABEL = { MASTER: 'Master', MEMBER: 'Member' } as const

function Empty() {
  return <span className="text-faint">—</span>
}

function Fact({
  label,
  mono = false,
  children,
}: {
  label: string
  mono?: boolean
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className={cn('mt-1 truncate text-sm text-foreground', mono && 'font-mono text-[13px]')}>
        {children}
      </dd>
    </div>
  )
}

function DeviceDetailHeader({ device }: { device: SafeDeviceDetail }) {
  return (
    <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 md:px-8 md:py-0">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-[18px] font-semibold text-foreground">
            <Link
              href="/inventory/devices"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Devices
            </Link>
            <span aria-hidden className="mx-1.5 font-normal text-faint">
              /
            </span>
            {device.name}
          </h1>
          <p className="mt-0.5 truncate text-xs text-subtle">
            {device.vendor} {device.model}
          </p>
        </div>
        <div className="shrink-0 text-xs">
          <DeviceStatusBadge status={device.status} />
        </div>
      </div>
    </header>
  )
}

function LocationSection({ device }: { device: SafeDeviceDetail }) {
  const { rack } = device
  if (!rack) {
    return (
      <DetailSection title="Location">
        <p className="text-sm text-muted-foreground">Not placed in a rack yet.</p>
        <Link
          href="/inventory/racks"
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          Place it from Racks
        </Link>
      </DetailSection>
    )
  }

  const rackHref = `/inventory/racks?${new URLSearchParams({ siteId: rack.site.id, q: device.name })}`
  return (
    <DetailSection
      title="Location"
      action={
        <Link href={rackHref} className="text-xs text-primary hover:underline">
          Show in rack
        </Link>
      }
    >
      <div className="flex gap-6">
        {device.rackPosition != null && (
          <RackLocator
            rackHeight={rack.heightU}
            position={device.rackPosition}
            deviceHeight={device.heightU}
          />
        )}
        <dl className="min-w-0 flex-1 space-y-4">
          <Fact label="Site">
            <Link href={`/inventory/racks?siteId=${rack.site.id}`} className="hover:underline">
              {rack.site.name}
            </Link>
          </Fact>
          <Fact label="Rack">
            {rack.name} <span className="text-subtle">({rack.heightU}U)</span>
          </Fact>
          <Fact label="Position">
            {device.rackPosition != null ? (
              unitRange(device.rackPosition, device.heightU)
            ) : (
              <span className="text-subtle">Not set</span>
            )}
          </Fact>
        </dl>
      </div>
    </DetailSection>
  )
}

function StackSection({
  device,
  stack,
}: {
  device: SafeDeviceDetail
  stack: NonNullable<SafeDeviceDetail['deviceStack']>
}) {
  const members = [
    {
      id: device.id,
      name: device.name,
      stackMember: device.stackMember,
      stackRole: device.stackRole,
      rackName: device.rack?.name ?? null,
      rackPosition: device.rackPosition,
      self: true,
    },
    ...stack.devices.map((peer) => ({
      id: peer.id,
      name: peer.name,
      stackMember: peer.stackMember,
      stackRole: peer.stackRole,
      rackName: peer.rack?.name ?? null,
      rackPosition: peer.rackPosition,
      self: false,
    })),
  ].sort((a, b) => (a.stackMember ?? Infinity) - (b.stackMember ?? Infinity))

  return (
    <DetailSection title={`Stack ${stack.name}`} flush>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-faint text-left text-subtle">
              <th className="px-5 py-2 font-normal">Switch</th>
              <th className="px-5 py-2 font-normal">Name</th>
              <th className="px-5 py-2 font-normal">Role</th>
              <th className="px-5 py-2 font-normal">Rack</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.id}
                className={cn(
                  'border-b border-border-faint last:border-0',
                  member.self && 'bg-muted/60',
                )}
              >
                <td className="px-5 py-2.5 font-mono text-muted-foreground">
                  {member.stackMember != null ? `#${member.stackMember}` : '—'}
                </td>
                <td className="px-5 py-2.5">
                  {member.self ? (
                    <span className="font-medium text-foreground">
                      {member.name}
                      <span className="ml-2 font-normal text-subtle">This device</span>
                    </span>
                  ) : (
                    <Link
                      href={`/inventory/devices/${member.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {member.name}
                    </Link>
                  )}
                </td>
                <td className="px-5 py-2.5 text-foreground">
                  {member.stackRole ? ROLE_LABEL[member.stackRole] : <Empty />}
                </td>
                <td className="px-5 py-2.5 whitespace-nowrap text-subtle">
                  {member.rackName ? (
                    <>
                      {member.rackName}
                      {member.rackPosition != null && `, U${member.rackPosition}`}
                    </>
                  ) : (
                    <Empty />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailSection>
  )
}

export async function DeviceDetailShell({ idPromise }: { idPromise: Promise<string> }) {
  const id = await idPromise
  let device: Awaited<ReturnType<typeof getDeviceById>>
  try {
    device = await getDeviceById(id)
  } catch (error) {
    if (!(error instanceof InventoryReadError)) throw error
    if (error.code === 'unauthorized') redirect('/signin')
    console.error('[inventory] failed to load device', error)
    return <DevicesRegionError message="Could not load this device" />
  }
  if (!device) notFound()

  const updatedAt = new Date(device.updatedAt)

  return (
    <div className="min-h-full bg-background">
      <DeviceDetailHeader device={device} />
      <div className="grid items-start gap-6 px-4 py-4 md:px-8 md:py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <DetailSection title="Details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Fact label="Serial" mono>
                {device.serialNumber}
              </Fact>
              <Fact label="Management IP" mono>
                {device.managementIp ?? <Empty />}
              </Fact>
              <Fact label="Version" mono>
                {device.version || <Empty />}
              </Fact>
              <Fact label="Vendor">{device.vendor}</Fact>
              <Fact label="Model">{device.model}</Fact>
              <Fact label="Height">{device.heightU}U</Fact>
              <Fact label="Asset tag" mono>
                {device.assetTag ?? <Empty />}
              </Fact>
              <Fact label="Stack">{device.deviceStack?.name ?? 'Standalone'}</Fact>
              <Fact label="Last updated">
                <time dateTime={updatedAt.toISOString()}>
                  {UPDATED_AT_FORMAT.format(updatedAt)}
                </time>
              </Fact>
            </dl>
          </DetailSection>
          {device.deviceStack && <StackSection device={device} stack={device.deviceStack} />}
        </div>
        <div className="min-w-0 space-y-6">
          <LocationSection device={device} />
          <SourcePanel deviceId={device.id} />
        </div>
      </div>
    </div>
  )
}

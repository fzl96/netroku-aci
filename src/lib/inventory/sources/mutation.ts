import 'server-only'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { invalidateInventoryReads } from '@/lib/inventory/mutation'
import { deviceSchema } from '@/lib/schemas/device'
import { lockInventory, assertAvailableSerial } from './locking'
import { serialKey, sourceKey, technicalPatch } from './identity'
import { nodeObservation, legacyObservation, observationReviewToken } from './outbox'

export const linkInputSchema = z.object({
  kind: z.enum(['ACI', 'LEGACY']),
  sourceId: z.string().min(1),
  reviewToken: z.string().min(1),
  target: z.enum(['DEVICE', 'STACK']),
  targetId: z.string().optional(),
  singleChassis: z.boolean().default(false),
  device: deviceSchema.optional(),
  stackName: z.string().trim().min(1).max(128).optional(),
  memberIds: z.array(z.string()).max(32).optional(),
  replaceSourceId: z.string().optional(),
})
export type LinkInput = z.input<typeof linkInputSchema>
export async function linkInventorySource(input: LinkInput) {
  const actor = await requireAdmin()
  const data = linkInputSchema.parse(input)
  if (data.kind === 'LEGACY' && data.target === 'DEVICE' && !data.singleChassis)
    throw new Error(
      'Confirm that this Legacy record represents one physical chassis. Use Stack if it represents multiple members.',
    )
  if (data.kind === 'ACI' && data.target === 'STACK')
    throw new Error('ACI node sources must target physical devices.')
  const result = await prisma.$transaction(async (tx) => {
    // Source before inventory lock. Ingestion only locks source rows, never inventory.
    if (data.kind === 'ACI')
      await tx.$queryRaw`SELECT id FROM node_snapshot WHERE id = ${data.sourceId} FOR UPDATE`
    else await tx.$queryRaw`SELECT id FROM legacy_device WHERE id = ${data.sourceId} FOR UPDATE`
    const node =
      data.kind === 'ACI'
        ? await tx.nodeSnapshot.findUniqueOrThrow({ where: { id: data.sourceId } })
        : null
    const legacy =
      data.kind === 'LEGACY'
        ? await tx.legacyDevice.findUniqueOrThrow({ where: { id: data.sourceId } })
        : null
    const observation = node ? nodeObservation(node) : legacyObservation(legacy!)
    if (observationReviewToken(observation) !== data.reviewToken)
      throw new Error(
        'Discovery changed since review. Refresh and review the current values before linking.',
      )
    if (!observation.present)
      throw new Error(
        'This node is missing from discovery. Add it manually or wait for a successful observation.',
      )
    if (observation.conflict) throw new Error(observation.conflict)
    const key = node
      ? sourceKey(node.apicHostId, node.dn)
      : sourceKey(legacy!.siteKey, legacy!.hostnameKey)
    await lockInventory(tx)
    const occupied = await tx.inventorySource.findUnique({
      where: { kind_sourceKey: { kind: data.kind, sourceKey: key } },
    })
    if (occupied && occupied.id !== data.replaceSourceId) {
      if (
        data.targetId &&
        (occupied.deviceId === data.targetId || occupied.deviceStackId === data.targetId)
      )
        return { deviceId: occupied.deviceId, stackId: occupied.deviceStackId }
      throw new Error('This discovery is already linked. Open its asset or explicitly relink it.')
    }
    let previous = null
    if (data.replaceSourceId) {
      previous = await tx.inventorySource.findUniqueOrThrow({ where: { id: data.replaceSourceId } })
      if (
        occupied?.id !== previous.id &&
        data.targetId !== previous.deviceId &&
        data.targetId !== previous.deviceStackId
      )
        throw new Error(
          'Relink must replace the source of the selected target or reassign this discovery.',
        )
      await tx.inventorySource.delete({ where: { id: previous.id } })
    }
    let deviceId: string | null = null
    let stackId: string | null = null
    let serial: string | null = null
    if (data.target === 'DEVICE') {
      let device = data.targetId
        ? await tx.device.findUniqueOrThrow({
            where: { id: data.targetId },
            include: { source: true },
          })
        : null
      if (device?.source && device.source.id !== data.replaceSourceId)
        throw new Error('This asset already has a source. Unlink or relink explicitly.')
      if (!device) {
        if (!data.device) throw new Error('Supply the required physical device details.')
        const d = data.device
        if (![d.name, d.model, d.vendor].every((value) => value.trim()))
          throw new Error('Hostname, model, and vendor are required.')
        if (
          d.managementIp &&
          (await tx.device.findFirst({
            where: { managementIp: d.managementIp },
            select: { id: true },
          }))
        )
          throw new Error('This management IP already belongs to another asset.')
        const normalized = serialKey(d.serialNumber)
        if (!normalized) throw new Error('A valid physical serial is required.')
        const duplicates = await tx.device.findMany({
          where: { serialNumber: { equals: d.serialNumber.trim(), mode: 'insensitive' } },
          select: { id: true },
        })
        const normalizedMatches = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM device WHERE lower(trim("serialNumber")) = ${normalized}`
        if (duplicates.length || normalizedMatches.length)
          throw new Error('An inventory asset already has this serial. Link to the existing asset.')
        device = await tx.device.create({
          data: {
            name: d.name.trim(),
            serialNumber: d.serialNumber.trim(),
            model: d.model.trim(),
            version: d.version ?? null,
            vendor: d.vendor.trim(),
            heightU: d.heightU,
            assetTag: d.assetTag || null,
            managementIp: d.managementIp || null,
            status: d.status,
          },
          include: { source: true },
        })
      }
      await assertAvailableSerial(tx, device.serialNumber, device.id)
      serial = device.serialNumber
      if (!serialKey(serial)) throw new Error('A valid physical serial is required.')
      if (serialKey(observation.serial) && serialKey(observation.serial) !== serialKey(serial))
        throw new Error(
          'Source and inventory serials differ. Resolve physical identity before linking.',
        )
      const patch = technicalPatch(device, observation)
      if (Object.keys(patch).length)
        await tx.device.update({ where: { id: device.id }, data: patch })
      deviceId = device.id
    } else {
      let stack = data.targetId
        ? await tx.deviceStack.findUniqueOrThrow({
            where: { id: data.targetId },
            include: { source: true, devices: true },
          })
        : null
      if (stack?.source && stack.source.id !== data.replaceSourceId)
        throw new Error('This stack already has a source.')
      if (!stack) {
        if (!data.stackName || !data.memberIds?.length)
          throw new Error(
            'Enter a stack name and select at least one physical member. Create or import members first.',
          )
        const foundMembers = await tx.device.findMany({ where: { id: { in: data.memberIds } } })
        const members = [...new Set(data.memberIds)].flatMap((id) =>
          foundMembers.filter((member) => member.id === id),
        )
        if (members.length !== new Set(data.memberIds).size)
          throw new Error('A selected member no longer exists.')
        if (members.some((m) => m.deviceStackId))
          throw new Error('Selected members must be unassigned; use an existing stack otherwise.')
        if (
          await tx.deviceStack.findFirst({
            where: { name: { equals: data.stackName, mode: 'insensitive' } },
          })
        )
          throw new Error('A stack with this name already exists. Select the existing stack.')
        const created = await tx.deviceStack.create({ data: { name: data.stackName } })
        for (let i = 0; i < members.length; i++)
          await tx.device.update({
            where: { id: members[i].id },
            data: {
              deviceStackId: created.id,
              stackMember: i + 1,
              stackRole: i === 0 ? 'MASTER' : 'MEMBER',
            },
          })
        stack = await tx.deviceStack.findUniqueOrThrow({
          where: { id: created.id },
          include: { source: true, devices: true },
        })
      }
      if (!stack.devices.length)
        throw new Error('A source-linked stack needs at least one physical member.')
      if (previous?.deviceId && !stack.devices.some((m) => m.id === previous.deviceId))
        throw new Error(
          'When converting a device link to a stack, include the original physical device as a member.',
        )
      stackId = stack.id
      await tx.deviceStack.update({
        where: { id: stack.id },
        data: {
          observedHostname: observation.name,
          observedVersion: observation.version,
          observedManagementIp: observation.managementIp,
        },
      })
    }
    const link = await tx.inventorySource.create({
      data: {
        deviceId,
        deviceStackId: stackId,
        kind: data.kind,
        nodeSnapshotId: node?.id ?? null,
        legacyDeviceId: legacy?.id ?? null,
        sourceKey: key,
        sourceLabel: observation.sourceLabel,
        serialAtLink: serial,
        matchedOn: serial && serialKey(observation.serial) ? 'SERIAL' : 'MANUAL_SELECTION',
        acceptedRevision: (node ?? legacy)!.inventoryRevision,
        lastSeenAt: new Date(observation.seenAt),
        lastAppliedAt: new Date(),
      },
    })
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.userName,
        status: 'success',
        action: previous ? 'inventory.relink' : 'inventory.link',
        target: link.sourceLabel,
        payload: {
          previous: previous
            ? {
                key: previous.sourceKey,
                label: previous.sourceLabel,
                deviceId: previous.deviceId,
                stackId: previous.deviceStackId,
              }
            : null,
          deviceId,
          stackId,
        },
      },
    })
    return { deviceId, stackId }
  })
  invalidateInventoryReads()
  revalidateTag('history:all', { expire: 0 })
  return result
}
export async function unlinkInventorySource(id: string) {
  const actor = await requireAdmin()
  await prisma.$transaction(async (tx) => {
    await lockInventory(tx)
    const source = await tx.inventorySource.findUniqueOrThrow({ where: { id } })
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.userName,
        status: 'success',
        action: 'inventory.unlink',
        target: source.sourceLabel,
        payload: {
          key: source.sourceKey,
          deviceId: source.deviceId,
          stackId: source.deviceStackId,
        },
      },
    })
    await tx.inventorySource.delete({ where: { id } })
  })
  invalidateInventoryReads()
  revalidateTag('history:all', { expire: 0 })
}

import { Prisma, StackRole } from '@prisma/client'

export type StackMemberCandidate = {
  id: string
  name: string
  stackMember: number | null
  stackRole: StackRole | null
}

function compareStackMembers(
  left: StackMemberCandidate,
  right: StackMemberCandidate,
): number {
  if (left.stackMember === null && right.stackMember !== null) return 1
  if (left.stackMember !== null && right.stackMember === null) return -1
  if (left.stackMember !== null && right.stackMember !== null) {
    const memberOrder = left.stackMember - right.stackMember
    if (memberOrder !== 0) return memberOrder
  }

  const nameOrder = left.name.localeCompare(right.name)
  return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id)
}

export function selectMasterCandidate(
  members: StackMemberCandidate[],
  excludedDeviceId?: string,
): StackMemberCandidate | null {
  const currentMaster = members
    .filter((member) => member.stackRole === StackRole.MASTER)
    .sort(compareStackMembers)[0]
  if (currentMaster) return currentMaster

  const preferred = excludedDeviceId
    ? members.filter((member) => member.id !== excludedDeviceId)
    : members
  const candidates = preferred.length > 0 ? preferred : members

  return [...candidates].sort(compareStackMembers)[0] ?? null
}

type StackMasterTransaction = Pick<Prisma.TransactionClient, '$queryRaw' | 'device'>

export async function ensureStackHasMaster(
  tx: StackMasterTransaction,
  stackId: string,
  excludedDeviceId?: string,
): Promise<StackMemberCandidate | null> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "device_stack" WHERE "id" = ${stackId} FOR UPDATE`,
  )

  const members = await tx.device.findMany({
    where: { deviceStackId: stackId },
    select: {
      id: true,
      name: true,
      stackMember: true,
      stackRole: true,
    },
  })
  const candidate = selectMasterCandidate(members, excludedDeviceId)
  if (!candidate) return null

  await tx.device.updateMany({
    where: {
      deviceStackId: stackId,
      stackRole: StackRole.MASTER,
      id: { not: candidate.id },
    },
    data: { stackRole: StackRole.MEMBER },
  })

  if (candidate.stackRole === StackRole.MASTER) return candidate

  await tx.device.update({
    where: { id: candidate.id },
    data: { stackRole: StackRole.MASTER },
  })
  return { ...candidate, stackRole: StackRole.MASTER }
}

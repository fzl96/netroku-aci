import { StackRole, type Prisma } from '@prisma/client'

export type StackMemberCandidate = {
  id: string
  name: string
  stackMember: number | null
  stackRole: StackRole | null
}

export function selectMasterCandidate(
  members: StackMemberCandidate[],
  excludedDeviceId?: string,
): StackMemberCandidate | null {
  const currentMaster = members.find((member) => member.stackRole === StackRole.MASTER)
  if (currentMaster) return currentMaster

  const preferred = excludedDeviceId
    ? members.filter((member) => member.id !== excludedDeviceId)
    : members
  const candidates = preferred.length > 0 ? preferred : members

  return (
    [...candidates].sort((left, right) => {
      const memberOrder =
        (left.stackMember ?? Number.POSITIVE_INFINITY) -
        (right.stackMember ?? Number.POSITIVE_INFINITY)
      if (memberOrder !== 0) return memberOrder

      const nameOrder = left.name.localeCompare(right.name)
      return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id)
    })[0] ?? null
  )
}

type StackMasterTransaction = Pick<Prisma.TransactionClient, 'device'>

export async function ensureStackHasMaster(
  tx: StackMasterTransaction,
  stackId: string,
  excludedDeviceId?: string,
): Promise<StackMemberCandidate | null> {
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
  if (!candidate || candidate.stackRole === StackRole.MASTER) return candidate

  await tx.device.update({
    where: { id: candidate.id },
    data: { stackRole: StackRole.MASTER },
  })
  return { ...candidate, stackRole: StackRole.MASTER }
}

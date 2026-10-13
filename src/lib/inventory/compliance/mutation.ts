import 'server-only'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { policySchema } from './policy'

const policiesSchema = z
  .array(policySchema)
  .length(2)
  .refine(
    (policies) => new Set(policies.map((policy) => policy.service)).size === 2,
    'Provide one NTP and one TACACS policy',
  )

export async function updateCompliancePolicies(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const parsed = policiesSchema.safeParse(input)
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid compliance policies')
  await prisma.$transaction(
    parsed.data.map((policy) =>
      prisma.compliancePolicy.upsert({
        where: { service: policy.service },
        create: policy,
        update: { enabled: policy.enabled, expectedIps: policy.expectedIps },
      }),
    ),
  )
  revalidatePath('/inventory/compliance')
  revalidatePath('/inventory/compliance/parameters')
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'compliance.policy.update',
    target: 'Global NTP and TACACS policies',
    payload: parsed.data,
  })
}

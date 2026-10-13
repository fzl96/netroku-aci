import 'server-only'

import { prisma } from '@/lib/prisma'
import { authorizeInventoryRead, readInventoryData } from '@/lib/inventory/authorize'
import { completePolicies } from './policy'
import { evaluateCompliance } from './evaluate'
import {
  reportWindow,
  type ComplianceRow,
  type ComplianceTarget,
  type ReportParams,
} from './report'

const configMetadata = { select: { id: true, platform: true, collectedAt: true } } as const
const policySelect = { service: true, enabled: true, expectedIps: true } as const

export async function getCompliancePolicies() {
  await authorizeInventoryRead()
  return readInventoryData(async () =>
    completePolicies(await prisma.compliancePolicy.findMany({ select: policySelect })),
  )
}

/** No cross-request result cache: each visit uses the current policies and saved configs.
 * Only this report's page of configs is read, and raw text never leaves this module. */
export async function getComplianceReport(params: ReportParams) {
  const viewer = await authorizeInventoryRead()
  return readInventoryData(() =>
    prisma.$transaction(
      async (tx) => {
        const [devices, stacks, storedPolicies] = await Promise.all([
          tx.device.findMany({
            where: { deviceStackId: null },
            select: {
              id: true,
              name: true,
              source: { select: { kind: true } },
              config: configMetadata,
            },
          }),
          tx.deviceStack.findMany({
            where: { devices: { some: {} } },
            select: {
              id: true,
              name: true,
              source: { select: { kind: true } },
              config: configMetadata,
              devices: {
                select: { id: true, name: true, source: { select: { kind: true } } },
                orderBy: [{ stackMember: 'asc' }, { id: 'asc' }],
              },
            },
          }),
          tx.compliancePolicy.findMany({ select: policySelect }),
        ])
        const policies = completePolicies(storedPolicies)
        const targets: ComplianceTarget[] = [
          ...devices.map((device) => ({
            id: device.id,
            name: device.name,
            kind: 'device' as const,
            members: [],
            aciLinked: device.source?.kind === 'ACI',
            config: device.config,
          })),
          ...stacks.map((stack) => ({
            id: stack.id,
            name: stack.name,
            kind: 'stack' as const,
            members: stack.devices.map(({ id, name }) => ({ id, name })),
            aciLinked:
              stack.source?.kind === 'ACI' ||
              (!stack.source && stack.devices.every((member) => member.source?.kind === 'ACI')),
            config: stack.config,
          })),
        ]
        const window = reportWindow(targets, params)
        const configIds = policies.some((policy) => policy.enabled)
          ? window.targets.flatMap((target) =>
              !target.aciLinked && target.config ? [target.config.id] : [],
            )
          : []
        const configs = configIds.length
          ? await tx.inventoryConfig.findMany({
              where: { id: { in: configIds } },
              select: { id: true, rawConfig: true, platform: true },
            })
          : []
        const byId = new Map(configs.map((config) => [config.id, config]))
        const rows: ComplianceRow[] = window.targets.map((target) => ({
          id: target.id,
          name: target.name,
          kind: target.kind,
          members: target.members,
          platform: target.config?.platform ?? null,
          collectedAt: target.config?.collectedAt.toISOString() ?? null,
          results: evaluateCompliance(
            target.config ? (byId.get(target.config.id) ?? null) : null,
            policies,
            target.aciLinked,
          ),
        }))
        return {
          rows,
          policies,
          query: params.query,
          page: window.page,
          total: window.total,
          totalPages: window.totalPages,
          isAdmin: viewer.role === 'admin',
        }
      },
      { isolationLevel: 'RepeatableRead' },
    ),
  )
}

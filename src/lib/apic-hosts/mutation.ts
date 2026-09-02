import 'server-only'

import { requireAdmin } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { invalidateEndpointReads } from '@/lib/endpoints/mutation'
import { prisma } from '@/lib/prisma'
import {
  apicHostSchema,
  apicHostUpdateSchema,
  type ApicHostFormValues,
  type ApicHostUpdateFormValues,
} from '@/lib/schemas/apic-host'

export type SafeApicHost = {
  id: string
  name: string
  host: string
  createdAt: Date
  updatedAt: Date
}

export type ApicHostActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

type Actor = { id: string; userName: string }
type AuditInput = Parameters<typeof recordAudit>[0]

export type ApicHostMutationDependencies = {
  requireAdmin: () => Promise<Actor>
  createHost: (data: { name: string; host: string }) => Promise<SafeApicHost>
  updateHost: (
    id: string,
    data: { name: string; host: string },
  ) => Promise<SafeApicHost | null>
  deleteHost: (id: string) => Promise<SafeApicHost | null>
  recordAudit: (input: AuditInput) => Promise<void>
  invalidateEndpointReads: (id: string) => void
  reportAuditError?: (error: unknown) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function toSafeApicHost(host: SafeApicHost): SafeApicHost {
  return {
    id: host.id,
    name: host.name,
    host: host.host,
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
  }
}

/** Owns APIC-host write sequencing, audit semantics, and dependent cache expiry. */
export function createApicHostMutation(dependencies: ApicHostMutationDependencies) {
  async function audit(input: AuditInput): Promise<void> {
    try {
      await dependencies.recordAudit(input)
    } catch (error) {
      dependencies.reportAuditError?.(error)
    }
  }

  async function createApicHost(
    data: ApicHostFormValues,
  ): Promise<ApicHostActionResult<SafeApicHost>> {
    try {
      const actor = await dependencies.requireAdmin()
      const parsed = apicHostSchema.safeParse(data)
      if (!parsed.success) return { success: false, error: 'Invalid data' }

      const host = toSafeApicHost(await dependencies.createHost(parsed.data))
      await audit({
        userId: actor.id,
        userName: actor.userName,
        action: 'apic_host.create',
        target: `${host.name} (${host.host})`,
      })
      return { success: true, data: host }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async function updateApicHost(
    id: string,
    data: ApicHostUpdateFormValues,
  ): Promise<ApicHostActionResult<SafeApicHost>> {
    try {
      const actor = await dependencies.requireAdmin()
      const parsed = apicHostUpdateSchema.safeParse(data)
      if (!parsed.success) return { success: false, error: 'Invalid data' }

      const storedHost = await dependencies.updateHost(id, parsed.data)
      if (!storedHost) return { success: false, error: 'Host not found' }
      const host = toSafeApicHost(storedHost)

      await audit({
        userId: actor.id,
        userName: actor.userName,
        action: 'apic_host.update',
        target: `${host.name} (${host.host})`,
      })
      dependencies.invalidateEndpointReads(id)
      return { success: true, data: host }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async function deleteApicHost(id: string): Promise<ApicHostActionResult<void>> {
    try {
      const actor = await dependencies.requireAdmin()
      const host = await dependencies.deleteHost(id)
      if (!host) return { success: false, error: 'Host not found' }

      await audit({
        userId: actor.id,
        userName: actor.userName,
        action: 'apic_host.delete',
        target: `${host.name} (${host.host})`,
      })
      dependencies.invalidateEndpointReads(id)
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  return { createApicHost, updateApicHost, deleteApicHost }
}

const apicHostMutation = createApicHostMutation({
  requireAdmin,
  createHost: data => prisma.apicHost.create({ data }),
  updateHost: async (id, data) => {
    const result = await prisma.apicHost.updateMany({ where: { id }, data })
    if (result.count === 0) return null
    return prisma.apicHost.findUniqueOrThrow({ where: { id } })
  },
  deleteHost: async id => {
    const existing = await prisma.apicHost.findUnique({ where: { id } })
    const result = await prisma.apicHost.deleteMany({ where: { id } })
    return result.count === 0 ? null : existing
  },
  recordAudit,
  invalidateEndpointReads,
  reportAuditError: error => console.error('[apic-hosts] failed to record audit', error),
})

export const {
  createApicHost,
  updateApicHost,
  deleteApicHost,
} = apicHostMutation

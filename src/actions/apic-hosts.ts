'use server'

import { cache } from 'react'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createApicHost as mutateCreateApicHost,
  deleteApicHost as mutateDeleteApicHost,
  updateApicHost as mutateUpdateApicHost,
  type SafeApicHost,
} from '@/lib/apic-hosts/mutation'
import type {
  ApicHostFormValues,
  ApicHostUpdateFormValues,
} from '@/lib/schemas/apic-host'

export type { SafeApicHost } from '@/lib/apic-hosts/mutation'

function toSafe(host: { id: string; name: string; host: string; createdAt: Date; updatedAt: Date }): SafeApicHost {
  return {
    id: host.id,
    name: host.name,
    host: host.host,
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
  }
}

async function _getApicHosts(): Promise<SafeApicHost[]> {
  await requireSession()
  const hosts = await prisma.apicHost.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return hosts.map(toSafe)
}

/** Cached per-request: safe to call from multiple server components without redundant DB hits. */
export const getApicHosts = cache(_getApicHosts)

export async function createApicHost(
  data: ApicHostFormValues
) {
  return mutateCreateApicHost(data)
}

export async function updateApicHost(
  id: string,
  data: ApicHostUpdateFormValues
) {
  return mutateUpdateApicHost(id, data)
}

export async function deleteApicHost(id: string) {
  return mutateDeleteApicHost(id)
}

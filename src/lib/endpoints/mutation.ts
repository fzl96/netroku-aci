import 'server-only'

import { revalidateTag } from 'next/cache'
import { requireSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import {
  EndpointResyncInProgressError,
  resyncEndpoints,
} from '@/lib/apic/endpoints'
import { prisma } from '@/lib/prisma'
import {
  createEndpointMutation,
  type EndpointResyncResult,
  type ScheduledEndpointResyncInput,
} from './mutation-core'

export type { EndpointResyncResult, ScheduledEndpointResyncInput }

const endpointMutation = createEndpointMutation({
  requireSession,
  findHost: id => prisma.apicHost.findFirst({ where: { id } }),
  resyncEndpoints,
  recordAudit,
  revalidateTag,
  isInProgressError: error => error instanceof EndpointResyncInProgressError,
})

export const {
  invalidateEndpointReads,
  resyncEndpointInventory,
  resyncEndpointInventoryForScheduler,
}: {
  invalidateEndpointReads: (apicHostId: string) => void
  resyncEndpointInventory: (input: {
    apicHostId: string
    username: string
    password: string
  }) => Promise<EndpointResyncResult>
  resyncEndpointInventoryForScheduler: (
    input: ScheduledEndpointResyncInput,
  ) => Promise<{ synced: number; total: number }>
} = endpointMutation

import { z } from 'zod'

const endpointStatusSchema = z.enum(['active', 'historical'])

export const endpointExportSchema = z.object({
  apicHostId: z.string().trim().min(1),
  scope: z.enum(['all', 'filtered']),
  groupBy: z.enum(['node', 'vlan']),
  filters: z.object({
    query: z.string().optional(),
    vlan: z.array(z.string()).optional(),
    node: z.array(z.string()).optional(),
    iface: z.array(z.string()).optional(),
    status: z.array(endpointStatusSchema).optional(),
  }).optional(),
})

export type EndpointExportRequest = z.infer<typeof endpointExportSchema>

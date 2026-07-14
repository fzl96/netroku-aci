import { z } from 'zod'

export const epgExportSchema = z.object({
  apicHostId: z.string().trim().min(1),
  scope: z.enum(['all', 'filtered']),
  groupBy: z.enum(['epg', 'port']),
  filters: z.object({
    query: z.string().optional(),
    tenant: z.array(z.string()).optional(),
    ap: z.array(z.string()).optional(),
    node: z.array(z.string()).optional(),
  }).optional(),
})

export type EpgExportRequest = z.infer<typeof epgExportSchema>

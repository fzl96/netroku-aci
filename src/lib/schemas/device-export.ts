import { z } from 'zod'

export const deviceExportSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('all') }),
  z.object({
    scope: z.literal('filtered'),
    filters: z.object({
      query: z.string().trim(),
      sites: z.array(z.string().trim().min(1)),
      sources: z.array(z.enum(['ACI', 'LEGACY', 'UNLINKED'])),
    }),
  }),
])

export type DeviceExportRequest = z.infer<typeof deviceExportSchema>

import { z } from 'zod'

export const apicHostSchema = z.object({
  name: z.string().min(1, 'Name is required').max(64, 'Name must be 64 characters or fewer'),
  host: z.string().min(1, 'Host is required').max(253, 'Host must be 253 characters or fewer'),
})

export type ApicHostFormValues = z.infer<typeof apicHostSchema>

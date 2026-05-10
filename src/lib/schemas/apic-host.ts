import { z } from 'zod'

export const apicHostSchema = z.object({
  name: z.string().min(1, 'Name is required').max(64, 'Name must be 64 characters or fewer'),
  host: z.string().min(1, 'Host is required').max(253, 'Host must be 253 characters or fewer'),
  username: z.string().min(1, 'Username is required').max(64, 'Username must be 64 characters or fewer'),
  password: z.string().min(1, 'Password is required'),
})

export const apicHostUpdateSchema = apicHostSchema.extend({
  password: z.string().optional(),
})

export type ApicHostFormValues = z.infer<typeof apicHostSchema>
export type ApicHostUpdateFormValues = z.infer<typeof apicHostUpdateSchema>

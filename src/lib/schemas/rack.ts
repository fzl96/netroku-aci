import { z } from 'zod'

export const rackSchema = z.object({
  name: z.string().min(1, 'Name is required').max(128, 'Name must be 128 characters or fewer'),
  heightU: z.number().int('Height must be a whole number').positive('Height must be a positive integer').max(60, 'Height must be 60U or fewer'),
  siteId: z.string().min(1, 'Site is required'),
})

export const rackUpdateSchema = rackSchema

export type RackFormValues = z.infer<typeof rackSchema>
export type RackUpdateFormValues = z.infer<typeof rackUpdateSchema>

import { z } from 'zod'

export const siteSchema = z.object({
  name: z.string().min(1, 'Name is required').max(128, 'Name must be 128 characters or fewer'),
  address: z.string().max(256, 'Address must be 256 characters or fewer').optional().nullable(),
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').optional().nullable(),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').optional().nullable(),
})

export const siteUpdateSchema = siteSchema

export type SiteFormValues = z.infer<typeof siteSchema>
export type SiteUpdateFormValues = z.infer<typeof siteUpdateSchema>

import { z } from 'zod'
import { DeviceStatus, StackRole } from '@prisma/client'

export const deviceSchema = z.object({
  name: z.string().min(1, 'Hostname is required').max(128, 'Hostname must be 128 characters or fewer'),
  serialNumber: z.string().min(1, 'Serial number is required').max(128, 'Serial number must be 128 characters or fewer'),
  assetTag: z.string().max(128, 'Asset tag must be 128 characters or fewer').optional().nullable(),
  status: z.enum(DeviceStatus).default(DeviceStatus.ACTIVE),
  vendor: z.string().min(1, 'Vendor is required').max(128, 'Vendor must be 128 characters or fewer'),
  model: z.string().min(1, 'Model is required').max(128, 'Model must be 128 characters or fewer'),
  heightU: z.number().int('Height must be a whole number').positive('Height must be a positive integer').max(60, 'Height must be 60U or fewer'),
  deviceStackName: z.string().max(128, 'Stack name must be 128 characters or fewer').optional().nullable(),
  stackRole: z.enum(StackRole).optional().nullable(),
  stackMember: z.number().int('Member number must be a whole number').positive('Member number must be a positive integer').max(32, 'Member number must be 32 or fewer').optional().nullable(),
})

export const deviceUpdateSchema = deviceSchema

export type DeviceFormValues = z.input<typeof deviceSchema>
export type DeviceUpdateFormValues = z.input<typeof deviceUpdateSchema>

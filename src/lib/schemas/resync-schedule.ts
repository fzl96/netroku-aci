import { z } from 'zod'
import { INTERVAL_MAX_MINUTES, INTERVAL_MIN_MINUTES } from '@/lib/apic/schedule-timing'

const intervalMinutes = z
  .number()
  .int('Interval must be a whole number of minutes')
  .min(INTERVAL_MIN_MINUTES, `Interval must be at least ${INTERVAL_MIN_MINUTES} minutes`)
  .max(INTERVAL_MAX_MINUTES, `Interval must be ${INTERVAL_MAX_MINUTES} minutes or fewer`)

const username = z
  .string()
  .trim()
  .min(1, 'Username is required')
  .max(128, 'Username must be 128 characters or fewer')

const password = z.string().min(1, 'Password is required').max(256, 'Password is too long')

export const resyncScheduleSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes,
  username,
  password,
})

/** Update form: an omitted or blank password means "keep the stored one". */
export const resyncScheduleUpdateSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes,
  username,
  password: z
    .string()
    .max(256, 'Password is too long')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
})

export type ResyncScheduleFormValues = z.infer<typeof resyncScheduleSchema>
export type ResyncScheduleUpdateFormValues = z.infer<typeof resyncScheduleUpdateSchema>

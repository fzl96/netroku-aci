import { z } from 'zod'

export const observationSchema = z.object({
  name: z.string(),
  serial: z.string().nullable(),
  model: z.string().nullable(),
  version: z.string().nullable(),
  managementIp: z.string().nullable(),
  sourceLabel: z.string(),
  seenAt: z.string().datetime(),
  present: z.boolean(),
  conflict: z.string().nullable().default(null),
})
export type Observation = z.infer<typeof observationSchema>
export function serialKey(value: string | null | undefined): string | null {
  const key = value?.trim().toLocaleLowerCase('en-US')
  return !key || ['unknown', 'n/a', 'na', 'none', 'null', 'not specified', '-', '0'].includes(key)
    ? null
    : key
}
export function sourceKey(...parts: string[]): string {
  return JSON.stringify(parts)
}
export const ownedFields = ['name', 'serialNumber', 'model', 'version'] as const
export function assertOwnedFields(
  existing: {
    name: string
    serialNumber: string
    model: string
    version?: string | null
    source?: unknown
  },
  patch: Partial<Record<(typeof ownedFields)[number], string | null | undefined>>,
) {
  if (!existing.source) return
  for (const field of ownedFields) {
    if (patch[field] !== undefined && (patch[field] ?? null) !== (existing[field] ?? null)) {
      throw new Error(`${field} is maintained by discovery. Unlink the source before editing it.`)
    }
  }
}
export function technicalPatch(
  existing: { name: string; serialNumber: string; model: string; version: string | null },
  observation: Observation,
) {
  const patch: Partial<typeof existing> = {}
  for (const [field, value] of Object.entries({
    name: observation.name,
    model: observation.model,
    version: observation.version,
  })) {
    const key = field as keyof typeof existing
    if (value?.trim() && value !== existing[key]) patch[key] = value
  }
  return patch
}

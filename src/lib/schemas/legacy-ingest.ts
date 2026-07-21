import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)
const optionalMetadata = z.string().trim().min(1).optional()
const percent = z.number().finite().min(0).max(100).nullable().optional()
const counter = z.string().regex(/^\d+$/)
const collectedAt = z.iso.datetime({ offset: true })

const legacyDeviceSchema = z.strictObject({
  site: nonEmpty,
  hostname: nonEmpty,
  management_ip: nonEmpty,
  device_type: nonEmpty,
  vendor: optionalMetadata,
  model: optionalMetadata,
  serial_number: optionalMetadata,
  software_version: optionalMetadata,
  location: optionalMetadata,
})

const envelopeShape = {
  schema_version: z.literal(1),
  run_id: z.uuid(),
  collected_at: collectedAt,
  complete: z.literal(true),
  device: legacyDeviceSchema,
}

const logSchema = z.strictObject({
  timestamp: collectedAt.nullable(),
  severity: z.string().trim().min(1).nullable(),
  message: z.string(),
  raw: z.string(),
})

export const legacyHealthPayloadSchema = z.strictObject({
  ...envelopeShape,
  health: z.strictObject({
    uptime: z.string().optional(),
    cpu_percent: percent,
    memory_percent: percent,
    storage_percent: percent,
    temperature_celsius: z.number().finite().nullable().optional(),
    fan_statuses: z.array(z.string()).optional().default([]),
    psu_statuses: z.array(z.string()).optional().default([]),
  }),
  logs: z.array(logSchema).max(500),
})

const interfaceSchema = z.strictObject({
  name: nonEmpty,
  description: z.string(),
  ip_address: z.string().nullable(),
  prefix_length: z.number().int().min(0).max(128).nullable(),
  mtu: z.number().int().positive().nullable(),
  speed: z.string(),
  admin_state: z.string(),
  oper_state: z.string(),
  input_errors: counter,
  output_errors: counter,
  crc_errors: counter,
})

export const legacyInterfacePayloadSchema = z.strictObject({
  ...envelopeShape,
  interfaces: z.array(interfaceSchema).max(20_000),
})

const endpointSchema = z.strictObject({
  mac: z.string().regex(/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/),
  ip: z.string().trim().min(1).nullable(),
  interface: nonEmpty,
  vlan: z.string(),
  vlan_name: z.string(),
  learning_type: z.string(),
})

export const legacyEndpointPayloadSchema = z.strictObject({
  ...envelopeShape,
  endpoints: z.array(endpointSchema).max(100_000),
})

export type LegacyHealthPayload = z.infer<typeof legacyHealthPayloadSchema>
export type LegacyInterfacePayload = z.infer<typeof legacyInterfacePayloadSchema>
export type LegacyEndpointPayload = z.infer<typeof legacyEndpointPayloadSchema>
export type LegacyIngestPayload =
  | LegacyHealthPayload
  | LegacyInterfacePayload
  | LegacyEndpointPayload

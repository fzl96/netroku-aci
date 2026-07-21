export function serializeLegacyCounter(value: bigint | null): string | null {
  return value === null ? null : value.toString()
}

export function serializeLegacyDate(value: Date | null): string | null {
  return value?.toISOString() ?? null
}

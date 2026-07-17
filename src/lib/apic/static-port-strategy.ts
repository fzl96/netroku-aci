export const STATIC_PORT_BULK_THRESHOLD = 100

export type StaticPortValidationStrategy = 'exact' | 'snapshot'

export function selectStaticPortValidationStrategy(
  rowCount: number,
): StaticPortValidationStrategy {
  return rowCount > STATIC_PORT_BULK_THRESHOLD ? 'snapshot' : 'exact'
}

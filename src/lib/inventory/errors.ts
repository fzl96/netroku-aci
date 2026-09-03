export type InventoryReadErrorCode = 'unauthorized' | 'read-failed'

export class InventoryReadError extends Error {
  constructor(
    readonly code: InventoryReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load inventory data', options)
    this.name = 'InventoryReadError'
  }
}

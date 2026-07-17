export interface DrawerRequestResult<T> {
  key: string
  data: T | null
  failed: boolean
}

export function makeDrawerRequestKey(
  mode: 'errors' | 'status',
  interfaceId: string,
  range: string,
): string {
  return `${mode}:${interfaceId}:${range}`
}

export function resolveDrawerRequest<T>(
  activeKey: string | null,
  result: DrawerRequestResult<T> | null,
): { loading: boolean; failed: boolean; data: T | null } {
  if (!activeKey || result?.key !== activeKey) {
    return {
      loading: Boolean(activeKey),
      failed: false,
      data: null,
    }
  }

  return {
    loading: false,
    failed: result.failed,
    data: result.data,
  }
}

export function buildTenantPath(tenant: string): string {
  return `/api/node/mo/uni/tn-${tenant}.json`
}

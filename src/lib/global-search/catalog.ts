import type { RecordGroup } from './types'

/** Static SQL identifiers only. User input must never enter this catalog. */
export const SEARCH_CATALOG: Record<
  RecordGroup,
  {
    table: string
    fields: string[]
    title: string
    detail: string
    join: string
    sourceId: string
    sourceName: string
    identity: string
    current: string
    mac?: true
  }
> = {
  'aci-endpoints': {
    table: 'endpoint',
    fields: ['mac', 'ip', 'vlan', 'node', 'interface', 'epgDescr', 'dn'],
    title: 'r.mac',
    detail: `concat_ws(' · ', nullif(r.ip, ''), r.vlan, r.node, r.interface)`,
    join: 'JOIN apic_host s ON s.id = r."apicHostId"',
    sourceId: 'r."apicHostId"',
    sourceName: `s.name || ' (' || s.host || ')'`,
    identity: 'r.mac',
    current: 'r."isActive"',
    mac: true,
  },
  epgs: {
    table: 'epg_snapshot',
    fields: ['name', 'tenant', 'appProfile', 'description', 'bridgeDomain', 'dn'],
    title: 'r.name',
    detail: `concat_ws(' / ', r.tenant, r."appProfile")`,
    join: 'JOIN apic_host s ON s.id = r."apicHostId"',
    sourceId: 'r."apicHostId"',
    sourceName: `s.name || ' (' || s.host || ')'`,
    identity: 'r.dn',
    current: 'true',
  },
  nodes: {
    table: 'node_snapshot',
    fields: ['name', 'nodeId', 'serial', 'oobMgmtAddr', 'dn'],
    title: `coalesce(nullif(r.name, ''), 'Node ' || r."nodeId")`,
    detail: `concat_ws(' · ', r."nodeId", nullif(r.serial, ''), r."oobMgmtAddr")`,
    join: 'JOIN apic_host s ON s.id = r."apicHostId"',
    sourceId: 'r."apicHostId"',
    sourceName: `s.name || ' (' || s.host || ')'`,
    identity: 'r.id',
    current: 'r.present',
  },
  'legacy-devices': {
    table: 'legacy_device',
    fields: ['hostname', 'managementIp', 'serialNumber', 'site', 'vendor', 'model', 'location'],
    title: 'r.hostname',
    detail: `concat_ws(' · ', r."managementIp", r."serialNumber")`,
    join: '',
    sourceId: 'r.id',
    sourceName: 'r.site',
    identity: 'r.id',
    current: 'r.active',
  },
  'legacy-endpoints': {
    table: 'legacy_endpoint',
    fields: ['mac', 'ip', 'vlan', 'vlanName', 'interface', 'learningType'],
    title: 'r.mac',
    detail: `concat_ws(' · ', r.ip, r.vlan, r.interface)`,
    join: 'JOIN legacy_device s ON s.id = r."deviceId"',
    sourceId: 'r."deviceId"',
    sourceName: `s.site || ' / ' || s.hostname`,
    identity: 'r.mac',
    current: 'r."isActive"',
    mac: true,
  },
  sites: {
    table: 'site',
    fields: ['name', 'address'],
    title: 'r.name',
    detail: `coalesce(r.address, '')`,
    join: '',
    sourceId: 'r.id',
    sourceName: `''`,
    identity: 'r.id',
    current: 'true',
  },
  racks: {
    table: 'rack',
    fields: ['name'],
    title: 'r.name',
    detail: `r."heightU"::text || 'U'`,
    join: 'JOIN site s ON s.id = r."siteId"',
    sourceId: 'r."siteId"',
    sourceName: 's.name',
    identity: 'r.id',
    current: 'true',
  },
  devices: {
    table: 'device',
    fields: ['name', 'serialNumber', 'assetTag', 'management_ip', 'vendor', 'model'],
    title: 'r.name',
    detail: `concat_ws(' · ', r."serialNumber", r.management_ip, r.status::text)`,
    join: 'LEFT JOIN rack k ON k.id = r."rackId" LEFT JOIN site s ON s.id = k."siteId"',
    sourceId: `coalesce(k.id, '')`,
    sourceName: `concat_ws(' / ', s.name, k.name)`,
    identity: 'r.id',
    current: 'true',
  },
}

export function searchTextExpression(fields: string[], alias = 'r'): string {
  return `lower(${fields.map((field) => `coalesce(${alias ? `${alias}.` : ''}"${field}", '')`).join(" || ' ' || ")})`
}

export function macExpression(alias = 'r'): string {
  return `translate(lower(${alias ? `${alias}.` : ''}mac), ':.- ', '')`
}

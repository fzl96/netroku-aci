import Papa from 'papaparse'

type CsvCell = string | number | boolean
type PayloadRow = Record<string, unknown>

type ExportColumn = {
  header: string
  value?: (row: PayloadRow) => unknown
}

type WorkflowConfig = {
  filename: string
  columns: ExportColumn[]
  identity: (row: PayloadRow) => string
  objectLabel: HistoryPayloadSummary['objectLabel']
}

export type HistoryPayloadCsvExport = {
  csv: string
  filename: string
}

export type HistoryPayloadSummary = {
  rowCount: number
  uniqueCount: number
  objectLabel: 'EPG' | 'bridge domain' | 'interface selector'
}

const columns = (...headers: string[]): ExportColumn[] =>
  headers.map(header => ({ header }))

const identity = (...fields: string[]) => (row: PayloadRow): string =>
  JSON.stringify(fields.map(field => row[field]))

const WORKFLOWS: Record<string, WorkflowConfig> = {
  'static-ports': {
    filename: 'static-ports',
    identity: identity('tenant', 'ap', 'epg'),
    objectLabel: 'EPG',
    columns: columns(
      'tenant',
      'ap',
      'epg',
      'vlan',
      'node1',
      'node2',
      'port_type',
      'interface_or_ipg',
      'mode',
      'immediacy',
    ),
  },
  'interface-selectors': {
    filename: 'interface-selectors',
    identity: identity('interface_profile', 'selector_name'),
    objectLabel: 'interface selector',
    columns: columns(
      'interface_profile',
      'selector_name',
      'port',
      'ipg_name',
      'ipg_type',
      'description',
    ),
  },
  'bridge-domains:l2': {
    filename: 'bridge-domains-l2',
    identity: identity('tenant', 'bd'),
    objectLabel: 'bridge domain',
    columns: columns('tenant', 'bd', 'vrf', 'bd_desc'),
  },
  'bridge-domains:l3': {
    filename: 'bridge-domains-l3',
    identity: identity('tenant', 'bd'),
    objectLabel: 'bridge domain',
    columns: columns('tenant', 'bd', 'vrf', 'subnet', 'l3out', 'bd_desc'),
  },
  epg: {
    filename: 'epg',
    identity: identity('tenant', 'anp', 'epg'),
    objectLabel: 'EPG',
    columns: [
      ...columns('tenant', 'anp', 'epg', 'bd_tenant', 'bd', 'phys_domain', 'contract_tenant'),
      { header: 'cons_contract', value: row => joinList(row.consContracts) },
      { header: 'prov_contract', value: row => joinList(row.provContracts) },
      ...columns('epg_desc'),
    ],
  },
  'epg:consumer': {
    filename: 'epg-consumer',
    identity: identity('tenant', 'anp', 'epg'),
    objectLabel: 'EPG',
    columns: columns(
      'tenant',
      'anp',
      'epg',
      'bd_tenant',
      'bd',
      'phys_domain',
      'contract_tenant',
      'contract',
      'epg_desc',
    ),
  },
  'epg:provider': {
    filename: 'epg-provider',
    identity: identity('tenant', 'anp', 'epg'),
    objectLabel: 'EPG',
    columns: columns(
      'tenant',
      'anp',
      'epg',
      'bd_tenant',
      'bd',
      'phys_domain',
      'contract_tenant',
      'contract',
      'epg_desc',
    ),
  },
}

function joinList(value: unknown): string {
  return Array.isArray(value) ? value.join(',') : ''
}

function csvCell(value: unknown): CsvCell {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return String(value)
}

function workflowFromTarget(target: string | null): WorkflowConfig | null {
  if (!target) return null
  return WORKFLOWS[target.split(' @ ', 1)[0]] ?? null
}

function supportedPayload(input: {
  action: string
  target: string | null
  payload: unknown
}): { workflow: WorkflowConfig; rows: PayloadRow[] } | null {
  if (input.action !== 'deploy' && input.action !== 'rollback') return null

  const workflow = workflowFromTarget(input.target)
  if (
    !workflow ||
    !Array.isArray(input.payload) ||
    input.payload.length === 0 ||
    !input.payload.every(row => typeof row === 'object' && row !== null && !Array.isArray(row))
  ) {
    return null
  }

  return { workflow, rows: input.payload as PayloadRow[] }
}

export function buildHistoryPayloadSummary(input: {
  action: string
  target: string | null
  payload: unknown
}): HistoryPayloadSummary | null {
  const supported = supportedPayload(input)
  if (!supported) return null

  return {
    rowCount: supported.rows.length,
    uniqueCount: new Set(supported.rows.map(supported.workflow.identity)).size,
    objectLabel: supported.workflow.objectLabel,
  }
}

export function formatHistoryPayloadSummary(summary: HistoryPayloadSummary): string {
  const rowLabel = summary.rowCount === 1 ? 'row' : 'rows'
  const objectLabel = summary.uniqueCount === 1
    ? summary.objectLabel
    : `${summary.objectLabel}s`
  return `${summary.rowCount} ${rowLabel} · ${summary.uniqueCount} unique ${objectLabel} in payload`
}

export function buildHistoryPayloadCsvExport(input: {
  action: string
  target: string | null
  payload: unknown
  createdAt: Date | string
}): HistoryPayloadCsvExport | null {
  const supported = supportedPayload(input)
  if (!supported) return null

  const { workflow, rows } = supported
  const fields = workflow.columns.map(column => column.header)
  const data = rows.map(row => workflow.columns.map(column =>
    csvCell(column.value ? column.value(row) : row[column.header]),
  ))
  const date = new Date(input.createdAt).toISOString().slice(0, 10)

  return {
    csv: Papa.unparse({ fields, data }),
    filename: `${workflow.filename}-${input.action}-${date}.csv`,
  }
}

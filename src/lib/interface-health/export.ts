export type InterfaceExportSample = {
  sampledAt: Date
  adminSt: string
  operSt: string
  operSpeed: string
  rxBytes: bigint
  rxPkts: bigint
  rxErrors: bigint
  rxDiscards: bigint
  rxCrcErrors: bigint
  rxAlignErrors: bigint
  txBytes: bigint
  txPkts: bigint
  txErrors: bigint
  txDiscards: bigint
  dRxBytes: bigint | null
  dRxErrors: bigint | null
  dRxDiscards: bigint | null
  dRxCrcErrors: bigint | null
  dRxAlignErrors: bigint | null
  dTxBytes: bigint | null
  dTxErrors: bigint | null
  dTxDiscards: bigint | null
  interface: {
    node: string
    ifName: string
    usage: string
    description: string | null
    dn: string
  }
}

export const INTERFACE_EXPORT_HEADER = [
  'sampledAt',
  'node',
  'ifName',
  'usage',
  'description',
  'adminSt',
  'operSt',
  'operSpeed',
  'rxBytes',
  'rxPkts',
  'rxErrors',
  'rxDiscards',
  'rxCrcErrors',
  'rxAlignErrors',
  'txBytes',
  'txPkts',
  'txErrors',
  'txDiscards',
  'dRxBytes',
  'dRxErrors',
  'dRxDiscards',
  'dRxCrcErrors',
  'dRxAlignErrors',
  'dTxBytes',
  'dTxErrors',
  'dTxDiscards',
] as const

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function bigIntOrEmpty(value: bigint | null): string {
  return value === null ? '' : value.toString()
}

function safeFilenameSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'host'
  )
}

export function buildInterfaceSamplesCsv(samples: InterfaceExportSample[]): string {
  const lines: string[] = [INTERFACE_EXPORT_HEADER.join(',')]
  for (const sample of samples) {
    lines.push(
      [
        csvEscape(sample.sampledAt.toISOString()),
        csvEscape(sample.interface.node),
        csvEscape(sample.interface.ifName),
        csvEscape(sample.interface.usage),
        csvEscape(sample.interface.description),
        csvEscape(sample.adminSt),
        csvEscape(sample.operSt),
        csvEscape(sample.operSpeed),
        csvEscape(sample.rxBytes.toString()),
        csvEscape(sample.rxPkts.toString()),
        csvEscape(sample.rxErrors.toString()),
        csvEscape(sample.rxDiscards.toString()),
        csvEscape(sample.rxCrcErrors.toString()),
        csvEscape(sample.rxAlignErrors.toString()),
        csvEscape(sample.txBytes.toString()),
        csvEscape(sample.txPkts.toString()),
        csvEscape(sample.txErrors.toString()),
        csvEscape(sample.txDiscards.toString()),
        csvEscape(bigIntOrEmpty(sample.dRxBytes)),
        csvEscape(bigIntOrEmpty(sample.dRxErrors)),
        csvEscape(bigIntOrEmpty(sample.dRxDiscards)),
        csvEscape(bigIntOrEmpty(sample.dRxCrcErrors)),
        csvEscape(bigIntOrEmpty(sample.dRxAlignErrors)),
        csvEscape(bigIntOrEmpty(sample.dTxBytes)),
        csvEscape(bigIntOrEmpty(sample.dTxErrors)),
        csvEscape(bigIntOrEmpty(sample.dTxDiscards)),
      ].join(','),
    )
  }
  return lines.join('\n') + '\n'
}

export function interfaceExportFilename(hostName: string, now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-')
  return ['interfaces', safeFilenameSegment(hostName), timestamp].join('-')
}

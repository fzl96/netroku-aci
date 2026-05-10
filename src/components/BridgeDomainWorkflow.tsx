'use client'

import { WorkflowShell } from '@/components/WorkflowShell'
import { UploadSection } from '@/components/UploadSection'
import { PreviewSection, type PreviewColumn } from '@/components/PreviewSection'
import { DeploySection } from '@/components/DeploySection'
import {
  BD_L2_REQUIRED_COLUMNS_HELP,
  BD_L3_REQUIRED_COLUMNS_HELP,
  validateBridgeDomainL2Csv,
  validateBridgeDomainL3Csv,
} from '@/lib/apic/bridge-domains/csv'
import type {
  ParsedBridgeDomainL2Row,
  ParsedBridgeDomainL3Row,
  ParsedBridgeDomainRow,
} from '@/lib/apic/bridge-domains/types'
import type { CsvValidationError } from '@/lib/apic/types'

type Variant = 'l2' | 'l3'
type Mode = 'deploy' | 'rollback'
type BridgeDomainValidator = (
  rawRows: Record<string, string>[],
  headers: string[],
) => { rows: ParsedBridgeDomainRow[]; errors: CsvValidationError[] }

const L2_COLUMNS: PreviewColumn<ParsedBridgeDomainL2Row>[] = [
  { header: '#', cell: (_r, i) => i + 1, className: 'font-mono text-[var(--text-faint)] tabular-nums select-none' },
  { header: 'Tenant', cell: r => r.tenant, className: 'text-[var(--text)]' },
  { header: 'Bridge Domain', cell: r => r.bd, className: 'font-mono text-[var(--text)]' },
  { header: 'VRF', cell: r => r.vrf, className: 'font-mono text-[var(--text)]' },
  { header: 'Mode', cell: () => 'L2 Only', className: 'text-[var(--text)]' },
  { header: 'Unknown MAC', cell: () => 'flood', className: 'font-mono text-[var(--text)]' },
  { header: 'ARP Flood', cell: () => 'true', className: 'font-mono text-[var(--text)]' },
  { header: 'Unicast Route', cell: () => 'no', className: 'font-mono text-[var(--text)]' },
  { header: 'Description', cell: r => r.bd_desc ?? '', className: 'text-[var(--text-subtle)]' },
]

const L3_COLUMNS: PreviewColumn<ParsedBridgeDomainL3Row>[] = [
  { header: '#', cell: (_r, i) => i + 1, className: 'font-mono text-[var(--text-faint)] tabular-nums select-none' },
  { header: 'Tenant', cell: r => r.tenant, className: 'text-[var(--text)]' },
  { header: 'Bridge Domain', cell: r => r.bd, className: 'font-mono text-[var(--text)]' },
  { header: 'VRF', cell: r => r.vrf, className: 'font-mono text-[var(--text)]' },
  { header: 'Subnet', cell: r => r.subnet, className: 'font-mono text-[var(--text)]' },
  { header: 'L3Out', cell: r => r.l3out, className: 'font-mono text-[var(--text)]' },
  { header: 'Unknown MAC', cell: () => 'proxy', className: 'font-mono text-[var(--text)]' },
  { header: 'ARP Flood', cell: () => 'false', className: 'font-mono text-[var(--text)]' },
  { header: 'Unicast Route', cell: () => 'yes', className: 'font-mono text-[var(--text)]' },
  { header: 'Description', cell: r => r.bd_desc ?? '', className: 'text-[var(--text-subtle)]' },
]

const CONFIG: Record<Variant, {
  pageBadge: Record<Mode, string>
  pageSubtitle: Record<Mode, string>
  feature: 'bridge-domains-l2' | 'bridge-domains-l3'
  requiredColumnsHelp: string
  columns: PreviewColumn<ParsedBridgeDomainRow>[]
  validator: BridgeDomainValidator
}> = {
  l2: {
    pageBadge: { deploy: 'L2 Only', rollback: 'L2 Rollback' },
    pageSubtitle: {
      deploy: 'Deploy bridge domains with L2-only flood behavior from CSV',
      rollback: 'Remove L2-only bridge domains using a CSV',
    },
    feature: 'bridge-domains-l2',
    requiredColumnsHelp: BD_L2_REQUIRED_COLUMNS_HELP,
    columns: L2_COLUMNS as PreviewColumn<ParsedBridgeDomainRow>[],
    validator: validateBridgeDomainL2Csv as BridgeDomainValidator,
  },
  l3: {
    pageBadge: { deploy: 'L3 + Subnet', rollback: 'L3 Rollback' },
    pageSubtitle: {
      deploy: 'Deploy bridge domains, append subnet, and attach L3Out from CSV',
      rollback: 'Remove L3 bridge domains, including subnet and L3Out children, using a CSV',
    },
    feature: 'bridge-domains-l3',
    requiredColumnsHelp: BD_L3_REQUIRED_COLUMNS_HELP,
    columns: L3_COLUMNS as PreviewColumn<ParsedBridgeDomainRow>[],
    validator: validateBridgeDomainL3Csv as BridgeDomainValidator,
  },
}

function rowLabel(row: ParsedBridgeDomainRow): string {
  if ('subnet' in row) {
    return `Row ${row.rowIndex} - ${row.tenant}/${row.bd} - ${row.subnet} -> ${row.l3out}`
  }
  return `Row ${row.rowIndex} - ${row.tenant}/${row.bd}`
}

export function BridgeDomainWorkflow({ variant, mode = 'deploy' }: { variant: Variant; mode?: Mode }) {
  const cfg = CONFIG[variant]
  return (
    <WorkflowShell<ParsedBridgeDomainRow>
      title="Bridge Domains"
      badge={cfg.pageBadge[mode]}
      subtitle={cfg.pageSubtitle[mode]}
      steps={[
        { n: 1, label: 'Upload', sub: 'Parse and validate CSV' },
        { n: 2, label: 'Review', sub: 'Check against APIC state' },
        mode === 'deploy'
          ? { n: 3, label: 'Deploy', sub: 'Push bridge domains to fabric' }
          : { n: 3, label: 'Rollback', sub: 'Remove bridge domains from fabric' },
      ]}
      queuedNoun={mode === 'deploy' ? 'queued' : 'to remove'}
      connectDescription={`Enter APIC controller credentials to begin ${mode === 'deploy' ? 'deploying' : 'rolling back'} bridge domains.`}
      renderUpload={(onUploaded) => (
        <UploadSection<ParsedBridgeDomainRow>
          onUploaded={onUploaded}
          validator={cfg.validator}
          requiredColumnsHelp={cfg.requiredColumnsHelp}
        />
      )}
      renderPreview={({ rows, apicHost, apicToken, onDeploy, onChangeCSV, onReconnect }) => (
        <PreviewSection<ParsedBridgeDomainRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature={cfg.feature}
          columns={cfg.columns}
          formatRowLabel={rowLabel}
          onDeploy={onDeploy}
          onChangeCSV={onChangeCSV}
          onReconnect={onReconnect}
        />
      )}
      renderDeploy={({ rows, apicHost, apicToken, onUploadAnother, onReconnect }) => (
        <DeploySection<ParsedBridgeDomainRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature={cfg.feature}
          itemNoun="bridge domain"
          onUploadAnother={onUploadAnother}
          onReconnect={onReconnect}
        />
      )}
    />
  )
}

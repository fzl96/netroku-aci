'use client'

import { WorkflowShell } from '@/components/WorkflowShell'
import { DeploySection } from '@/components/DeploySection'
import { PreviewSection, type PreviewColumn } from '@/components/PreviewSection'
import { UploadSection } from '@/components/UploadSection'
import {
  EPG_ONLY_REQUIRED_COLUMNS_HELP,
  EPG_REQUIRED_COLUMNS_HELP,
  validateEpgContractCsv,
  validateEpgCsv,
} from '@/lib/apic/epgs/csv'
import type {
  EpgContractRole,
  ParsedAnyEpgRow,
} from '@/lib/apic/epgs/types'
import type { CsvValidationError } from '@/lib/apic/types'

type Mode = 'deploy' | 'rollback'
type EpgValidator = (
  rawRows: Record<string, string>[],
  headers: string[],
) => { rows: ParsedAnyEpgRow[]; errors: CsvValidationError[] }

const EPG_COLUMNS: PreviewColumn<ParsedAnyEpgRow>[] = [
  { header: '#', cell: (_r, i) => i + 1, className: 'font-mono text-[var(--text-faint)] tabular-nums select-none' },
  { header: 'Tenant', cell: r => r.tenant, className: 'text-[var(--text)]' },
  { header: 'ANP', cell: r => r.anp, className: 'font-mono text-[var(--text)]' },
  { header: 'EPG', cell: r => r.epg, className: 'font-mono text-[var(--text)]' },
  { header: 'Bridge Domain', cell: r => r.bd, className: 'font-mono text-[var(--text)]' },
  { header: 'Description', cell: r => r.epg_desc ?? '', className: 'text-[var(--text-subtle)]' },
]

const CONTRACT_COLUMNS: PreviewColumn<ParsedAnyEpgRow>[] = [
  ...EPG_COLUMNS.slice(0, 5),
  { header: 'Contract', cell: r => 'contract' in r ? r.contract : '', className: 'font-mono text-[var(--text)]' },
  EPG_COLUMNS[5],
]

function rowLabel(row: ParsedAnyEpgRow): string {
  return 'contract' in row
    ? `Row ${row.rowIndex} - ${row.tenant}/${row.anp}/${row.epg} -> ${row.contract}`
    : `Row ${row.rowIndex} - ${row.tenant}/${row.anp}/${row.epg}`
}

function roleLabel(role?: EpgContractRole): string {
  if (role === 'consumer') return 'Consumer'
  if (role === 'provider') return 'Provider'
  return 'EPG'
}

function featureFor(
  mode: Mode,
  role?: EpgContractRole,
): 'epg' | 'epg-consumer' | 'epg-provider' | 'epg-consumer-contract' | 'epg-provider-contract' {
  if (mode === 'rollback') {
    if (role === 'consumer') return 'epg-consumer-contract'
    if (role === 'provider') return 'epg-provider-contract'
    return 'epg'
  }
  if (!role) return 'epg'
  return role === 'provider' ? 'epg-provider' : 'epg-consumer'
}

export function EpgContractWorkflow({ mode, role }: { mode: Mode; role?: EpgContractRole }) {
  const isRollback = mode === 'rollback'
  const isContractWorkflow = Boolean(role)
  const label = roleLabel(role)
  const feature = featureFor(mode, role)
  const validator = (isContractWorkflow ? validateEpgContractCsv : validateEpgCsv) as EpgValidator

  const pageBadge = isRollback
    ? role ? `${label} Contract Rollback` : 'EPG Rollback'
    : role ? `EPG ${label}` : 'EPG'
  const title = role ? 'EPG Contracts' : 'EPG'
  const pageSubtitle = isRollback
    ? role
      ? `Remove ${label.toLowerCase()} contract attachments after validating the expected EPG and BD`
      : 'Remove EPGs after validating the expected BD relation'
    : role
      ? `Create EPGs and attach ${label.toLowerCase()} contracts from CSV`
      : 'Create EPGs and attach them to bridge domains without contracts'

  return (
    <WorkflowShell<ParsedAnyEpgRow>
      title={title}
      badge={pageBadge}
      subtitle={pageSubtitle}
      steps={[
        { n: 1, label: 'Upload', sub: 'Parse and validate CSV' },
        { n: 2, label: 'Review', sub: 'Check against APIC state' },
        isRollback
          ? { n: 3, label: 'Rollback', sub: role ? `Remove ${label.toLowerCase()} contract relations` : 'Remove EPGs from fabric' }
          : { n: 3, label: 'Deploy', sub: role ? `Create EPGs and attach ${label.toLowerCase()} contracts` : 'Create EPGs without contract attachments' },
      ]}
      queuedNoun={isRollback && role ? 'contract relations to remove' : isRollback ? 'to remove' : 'queued'}
      connectDescription={`Enter APIC controller credentials to begin ${isRollback ? 'rolling back' : 'deploying'} ${role ? 'EPG contract policy' : 'EPGs'}.`}
      renderUpload={(onUploaded) => (
        <UploadSection<ParsedAnyEpgRow>
          onUploaded={onUploaded}
          validator={validator}
          requiredColumnsHelp={isContractWorkflow ? EPG_REQUIRED_COLUMNS_HELP : EPG_ONLY_REQUIRED_COLUMNS_HELP}
        />
      )}
      renderPreview={({ rows, apicHost, apicToken, onDeploy, onChangeCSV, onReconnect }) => (
        <PreviewSection<ParsedAnyEpgRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature={feature}
          columns={isContractWorkflow ? CONTRACT_COLUMNS : EPG_COLUMNS}
          formatRowLabel={rowLabel}
          onDeploy={onDeploy}
          onChangeCSV={onChangeCSV}
          onReconnect={onReconnect}
        />
      )}
      renderDeploy={({ rows, apicHost, apicToken, onUploadAnother, onReconnect }) => (
        <DeploySection<ParsedAnyEpgRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature={feature}
          itemNoun={isRollback && role ? 'contract relation' : 'EPG'}
          onUploadAnother={onUploadAnother}
          onReconnect={onReconnect}
        />
      )}
    />
  )
}

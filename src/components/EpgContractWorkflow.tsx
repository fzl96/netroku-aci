'use client'

import { WorkflowShell } from '@/components/WorkflowShell'
import { DeploySection } from '@/components/DeploySection'
import { PreviewSection, type PreviewColumn } from '@/components/PreviewSection'
import { UploadSection } from '@/components/UploadSection'
import {
  EPG_REQUIRED_COLUMNS_HELP,
  validateEpgCsv,
} from '@/lib/apic/epgs/csv'
import type { ParsedEpgRow } from '@/lib/apic/epgs/types'
import type { CsvValidationError } from '@/lib/apic/types'

type Mode = 'deploy' | 'rollback'
type EpgValidator = (
  rawRows: Record<string, string>[],
  headers: string[],
) => { rows: ParsedEpgRow[]; errors: CsvValidationError[] }

const EPG_COLUMNS: PreviewColumn<ParsedEpgRow>[] = [
  { header: '#', cell: (_r, i) => i + 1, className: 'font-mono text-faint tabular-nums select-none' },
  { header: 'Tenant', cell: r => r.tenant, className: 'text-foreground' },
  { header: 'ANP', cell: r => r.anp, className: 'font-mono text-foreground' },
  { header: 'EPG', cell: r => r.epg, className: 'font-mono text-foreground' },
  { header: 'Bridge Domain', cell: r => r.bd, className: 'font-mono text-foreground' },
  { header: 'Consumed Contracts', cell: r => r.consContracts.join(', '), className: 'font-mono text-foreground' },
  { header: 'Provided Contracts', cell: r => r.provContracts.join(', '), className: 'font-mono text-foreground' },
  { header: 'Description', cell: r => r.epg_desc ?? '', className: 'text-subtle' },
]

function rowLabel(row: ParsedEpgRow): string {
  return `Row ${row.rowIndex} - ${row.tenant}/${row.anp}/${row.epg}`
}

export function EpgContractWorkflow({ mode }: { mode: Mode }) {
  const isRollback = mode === 'rollback'
  const validator = validateEpgCsv as EpgValidator

  const pageBadge = isRollback ? 'Rollback' : 'Deploy'
  const pageSubtitle = isRollback
    ? 'Delete EPGs or remove selected consumed/provided contract attachments from CSV'
    : 'Create EPGs and optionally attach consumed/provided contracts from CSV'

  return (
    <WorkflowShell<ParsedEpgRow>
      title="EPG"
      badge={pageBadge}
      subtitle={pageSubtitle}
      steps={[
        { n: 1, label: 'Upload', sub: 'Parse and validate CSV' },
        { n: 2, label: 'Review', sub: 'Check against APIC state' },
        isRollback
          ? { n: 3, label: 'Rollback', sub: 'Remove EPGs or contract relations' }
          : { n: 3, label: 'Deploy', sub: 'Create EPGs and attach optional contracts' },
      ]}
      queuedNoun={isRollback ? 'to remove' : 'queued'}
      connectDescription={`Enter APIC controller credentials to begin ${isRollback ? 'rolling back' : 'deploying'} EPGs.`}
      renderUpload={(onUploaded) => (
        <UploadSection<ParsedEpgRow>
          onUploaded={onUploaded}
          validator={validator}
          requiredColumnsHelp={EPG_REQUIRED_COLUMNS_HELP}
        />
      )}
      renderPreview={({ rows, apicHost, apicToken, onDeploy, onChangeCSV, onReconnect }) => (
        <PreviewSection<ParsedEpgRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature="epg"
          columns={EPG_COLUMNS}
          formatRowLabel={rowLabel}
          onDeploy={onDeploy}
          onChangeCSV={onChangeCSV}
          onReconnect={onReconnect}
        />
      )}
      renderDeploy={({ rows, apicHost, apicToken, onUploadAnother, onReconnect }) => (
        <DeploySection<ParsedEpgRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature="epg"
          itemNoun="EPG"
          onUploadAnother={onUploadAnother}
          onReconnect={onReconnect}
        />
      )}
    />
  )
}

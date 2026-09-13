'use client'

import { WorkflowShell } from '@/components/WorkflowShell'
import { DeploySection } from '@/components/DeploySection'
import { PreviewSection, type PreviewColumn } from '@/components/PreviewSection'
import { UploadSection } from '@/components/UploadSection'
import { ESG_SELECTOR_REQUIRED_COLUMNS_HELP, validateEsgSelectorCsv } from '@/lib/apic/esgs/csv'
import { effectiveEpgAnp, type ParsedEsgSelectorRow } from '@/lib/apic/esgs/types'

type Mode = 'deploy' | 'rollback'

const SELECTOR_COLUMNS: PreviewColumn<ParsedEsgSelectorRow>[] = [
  {
    header: '#',
    cell: (_r, i) => i + 1,
    className: 'font-mono text-faint tabular-nums select-none',
  },
  { header: 'Tenant', cell: (r) => r.tenant, className: 'text-foreground' },
  { header: 'ANP', cell: (r) => r.anp, className: 'font-mono text-foreground' },
  { header: 'ESG', cell: (r) => r.esg, className: 'font-mono text-foreground' },
  {
    header: 'Type',
    cell: (r) => (r.selector_type === 'epg' ? 'EPG' : 'IP'),
    className: 'text-foreground',
  },
  {
    header: 'Value',
    cell: (r) =>
      r.selector_type === 'epg' ? `${effectiveEpgAnp(r)}/${r.selector_value}` : r.selector_value,
    className: 'font-mono text-foreground',
  },
  { header: 'Description', cell: (r) => r.selector_desc ?? '', className: 'text-subtle' },
]

function rowLabel(row: ParsedEsgSelectorRow): string {
  const value =
    row.selector_type === 'epg'
      ? `EPG ${effectiveEpgAnp(row)}/${row.selector_value}`
      : `IP ${row.selector_value}`
  return `Row ${row.rowIndex} - ${row.tenant}/${row.anp}/${row.esg} - ${value}`
}

export function EsgSelectorWorkflow({ mode }: { mode: Mode }) {
  const isRollback = mode === 'rollback'

  return (
    <WorkflowShell<ParsedEsgSelectorRow>
      title="ESG Selectors"
      badge={isRollback ? 'Rollback' : 'Add'}
      subtitle={
        isRollback
          ? 'Remove EPG and IP selectors from endpoint security groups using a CSV'
          : 'Add EPG and IP selectors to existing endpoint security groups from CSV'
      }
      steps={[
        { n: 1, label: 'Upload', sub: 'Parse and validate CSV' },
        { n: 2, label: 'Review', sub: 'Check against APIC state' },
        isRollback
          ? { n: 3, label: 'Rollback', sub: 'Remove selectors from ESGs' }
          : { n: 3, label: 'Deploy', sub: 'Add selectors to ESGs' },
      ]}
      queuedNoun={isRollback ? 'to remove' : 'queued'}
      connectDescription={`Enter APIC controller credentials to begin ${isRollback ? 'removing' : 'adding'} ESG selectors.`}
      renderUpload={(onUploaded) => (
        <UploadSection<ParsedEsgSelectorRow>
          onUploaded={onUploaded}
          validator={validateEsgSelectorCsv}
          requiredColumnsHelp={ESG_SELECTOR_REQUIRED_COLUMNS_HELP}
        />
      )}
      renderPreview={({ rows, apicHost, apicToken, onDeploy, onChangeCSV, onReconnect }) => (
        <PreviewSection<ParsedEsgSelectorRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature="esg-selector"
          columns={SELECTOR_COLUMNS}
          formatRowLabel={rowLabel}
          onDeploy={onDeploy}
          onChangeCSV={onChangeCSV}
          onReconnect={onReconnect}
        />
      )}
      renderDeploy={({ rows, apicHost, apicToken, onUploadAnother, onReconnect }) => (
        <DeploySection<ParsedEsgSelectorRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature="esg-selector"
          itemNoun="selector"
          onUploadAnother={onUploadAnother}
          onReconnect={onReconnect}
        />
      )}
    />
  )
}

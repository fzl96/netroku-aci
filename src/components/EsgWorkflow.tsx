'use client'

import { WorkflowShell } from '@/components/WorkflowShell'
import { DeploySection } from '@/components/DeploySection'
import { PreviewSection, type PreviewColumn } from '@/components/PreviewSection'
import { UploadSection } from '@/components/UploadSection'
import { ESG_REQUIRED_COLUMNS_HELP, validateEsgCsv } from '@/lib/apic/esgs/csv'
import { effectiveContractTenant, type ParsedEsgRow } from '@/lib/apic/esgs/types'

type Mode = 'deploy' | 'rollback'

const ESG_COLUMNS: PreviewColumn<ParsedEsgRow>[] = [
  {
    header: '#',
    cell: (_r, i) => i + 1,
    className: 'font-mono text-faint tabular-nums select-none',
  },
  { header: 'Tenant', cell: (r) => r.tenant, className: 'text-foreground' },
  { header: 'ANP', cell: (r) => r.anp, className: 'font-mono text-foreground' },
  { header: 'ESG', cell: (r) => r.esg, className: 'font-mono text-foreground' },
  { header: 'VRF', cell: (r) => r.vrf, className: 'font-mono text-foreground' },
  {
    header: 'Contract Tenant',
    cell: (r) => effectiveContractTenant(r),
    className: 'font-mono text-foreground',
  },
  {
    header: 'Consumed Contracts',
    cell: (r) => r.consContracts.join(', '),
    className: 'font-mono text-foreground',
  },
  {
    header: 'Provided Contracts',
    cell: (r) => r.provContracts.join(', '),
    className: 'font-mono text-foreground',
  },
  { header: 'Description', cell: (r) => r.esg_desc ?? '', className: 'text-subtle' },
]

function rowLabel(row: ParsedEsgRow): string {
  return `Row ${row.rowIndex} - ${row.tenant}/${row.anp}/${row.esg}`
}

export function EsgWorkflow({ mode }: { mode: Mode }) {
  const isRollback = mode === 'rollback'

  return (
    <WorkflowShell<ParsedEsgRow>
      title="ESG"
      badge={isRollback ? 'Rollback' : 'Deploy'}
      subtitle={
        isRollback
          ? 'Delete endpoint security groups and their contracts using a CSV'
          : 'Create endpoint security groups and optionally attach consumed/provided contracts from CSV'
      }
      steps={[
        { n: 1, label: 'Upload', sub: 'Parse and validate CSV' },
        { n: 2, label: 'Review', sub: 'Check against APIC state' },
        isRollback
          ? { n: 3, label: 'Rollback', sub: 'Remove ESGs from fabric' }
          : { n: 3, label: 'Deploy', sub: 'Create ESGs and attach optional contracts' },
      ]}
      queuedNoun={isRollback ? 'to remove' : 'queued'}
      connectDescription={`Enter APIC controller credentials to begin ${isRollback ? 'rolling back' : 'deploying'} ESGs.`}
      renderUpload={(onUploaded) => (
        <UploadSection<ParsedEsgRow>
          onUploaded={onUploaded}
          validator={validateEsgCsv}
          requiredColumnsHelp={ESG_REQUIRED_COLUMNS_HELP}
        />
      )}
      renderPreview={({ rows, apicHost, apicToken, onDeploy, onChangeCSV, onReconnect }) => (
        <PreviewSection<ParsedEsgRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature="esg"
          columns={ESG_COLUMNS}
          formatRowLabel={rowLabel}
          onDeploy={onDeploy}
          onChangeCSV={onChangeCSV}
          onReconnect={onReconnect}
        />
      )}
      renderDeploy={({ rows, apicHost, apicToken, onUploadAnother, onReconnect }) => (
        <DeploySection<ParsedEsgRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature="esg"
          itemNoun="ESG"
          onUploadAnother={onUploadAnother}
          onReconnect={onReconnect}
        />
      )}
    />
  )
}

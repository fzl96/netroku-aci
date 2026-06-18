'use client'

import { WorkflowShell } from '@/components/WorkflowShell'
import { UploadSection } from '@/components/UploadSection'
import { PreviewSection, type PreviewColumn } from '@/components/PreviewSection'
import { DeploySection } from '@/components/DeploySection'
import { validateSelectorCsv, SELECTOR_REQUIRED_COLUMNS_HELP } from '@/lib/apic/selectors/csv'
import type { ParsedSelectorRow } from '@/lib/apic/selectors/types'

type Mode = 'deploy' | 'rollback'

const MODE_CONFIG: Record<Mode, {
  pageBadge: string
  pageSubtitle: string
  step3label: string
  step3sub: string
  queuedNoun: string
}> = {
  deploy: {
    pageBadge: 'Deployer',
    pageSubtitle: 'Bind ports to IPGs by deploying interface selectors from CSV',
    step3label: 'Deploy',
    step3sub: 'Push selectors to fabric',
    queuedNoun: 'queued',
  },
  rollback: {
    pageBadge: 'Rollback',
    pageSubtitle: 'Remove interface selectors from the ACI fabric using a CSV',
    step3label: 'Rollback',
    step3sub: 'Remove selectors from fabric',
    queuedNoun: 'to remove',
  },
}

const SELECTOR_COLUMNS: PreviewColumn<ParsedSelectorRow>[] = [
  { header: '#', cell: (_r, i) => i + 1, className: 'font-mono text-faint tabular-nums select-none' },
  { header: 'Profile', cell: r => r.interface_profile, className: 'font-mono text-foreground' },
  { header: 'Selector', cell: r => r.selector_name, className: 'text-foreground' },
  { header: 'Port', cell: r => r.port, className: 'font-mono text-foreground' },
  { header: 'IPG Type', cell: r => r.ipg_type, className: 'text-foreground' },
  { header: 'IPG', cell: r => r.ipg_name, className: 'font-mono text-foreground' },
  { header: 'Description', cell: r => r.description ?? '', className: 'text-subtle' },
]

function selectorRowLabel(r: ParsedSelectorRow): string {
  return `Row ${r.rowIndex} — ${r.interface_profile}/${r.selector_name} · ${r.port} → ${r.ipg_name}`
}

interface InterfaceSelectorWorkflowProps {
  mode: Mode
}

export function InterfaceSelectorWorkflow({ mode }: InterfaceSelectorWorkflowProps) {
  const cfg = MODE_CONFIG[mode]
  return (
    <WorkflowShell<ParsedSelectorRow>
      title="Interface Selectors"
      badge={cfg.pageBadge}
      subtitle={cfg.pageSubtitle}
      steps={[
        { n: 1, label: 'Upload', sub: 'Parse and validate CSV' },
        { n: 2, label: 'Review', sub: 'Check against APIC state' },
        { n: 3, label: cfg.step3label, sub: cfg.step3sub },
      ]}
      queuedNoun={cfg.queuedNoun}
      connectDescription={`Enter APIC controller credentials to begin ${mode === 'deploy' ? 'deploying' : 'rolling back'} interface selectors.`}
      renderUpload={(onUploaded) => (
        <UploadSection<ParsedSelectorRow>
          onUploaded={onUploaded}
          validator={validateSelectorCsv}
          requiredColumnsHelp={SELECTOR_REQUIRED_COLUMNS_HELP}
        />
      )}
      renderPreview={({ rows, apicHost, apicToken, onDeploy, onChangeCSV, onReconnect }) => (
        <PreviewSection<ParsedSelectorRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature="interface-selectors"
          columns={SELECTOR_COLUMNS}
          formatRowLabel={selectorRowLabel}
          onDeploy={onDeploy}
          onChangeCSV={onChangeCSV}
          onReconnect={onReconnect}
        />
      )}
      renderDeploy={({ rows, apicHost, apicToken, onUploadAnother, onReconnect }) => (
        <DeploySection<ParsedSelectorRow>
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          feature="interface-selectors"
          onUploadAnother={onUploadAnother}
          onReconnect={onReconnect}
        />
      )}
    />
  )
}

'use client'

import { WorkflowShell } from '@/components/WorkflowShell'
import { UploadSection } from '@/components/UploadSection'
import { PreviewSection } from '@/components/PreviewSection'
import { DeploySection } from '@/components/DeploySection'
import type { ParsedRow } from '@/lib/apic/types'

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
    pageSubtitle: 'Deploy VLAN/port bindings to the ACI fabric from CSV',
    step3label: 'Deploy',
    step3sub: 'Push bindings to fabric',
    queuedNoun: 'queued',
  },
  rollback: {
    pageBadge: 'Rollback',
    pageSubtitle: 'Remove VLAN/port bindings from the ACI fabric using a CSV',
    step3label: 'Rollback',
    step3sub: 'Remove bindings from fabric',
    queuedNoun: 'to remove',
  },
}

interface StaticPortWorkflowProps {
  mode: Mode
}

export function StaticPortWorkflow({ mode }: StaticPortWorkflowProps) {
  const cfg = MODE_CONFIG[mode]
  return (
    <WorkflowShell<ParsedRow>
      title="Static Ports"
      badge={cfg.pageBadge}
      subtitle={cfg.pageSubtitle}
      steps={[
        { n: 1, label: 'Upload', sub: 'Parse and validate CSV' },
        { n: 2, label: 'Review', sub: 'Check against APIC state' },
        { n: 3, label: cfg.step3label, sub: cfg.step3sub },
      ]}
      queuedNoun={cfg.queuedNoun}
      connectDescription={`Enter APIC controller credentials to begin ${mode === 'deploy' ? 'deploying' : 'rolling back'} static port bindings.`}
      renderUpload={(onUploaded) => <UploadSection onUploaded={onUploaded} />}
      renderPreview={({ rows, apicHost, apicToken, onDeploy, onChangeCSV, onReconnect }) => (
        <PreviewSection
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          onDeploy={onDeploy}
          onChangeCSV={onChangeCSV}
          onReconnect={onReconnect}
        />
      )}
      renderDeploy={({ rows, apicHost, apicToken, onUploadAnother, onReconnect }) => (
        <DeploySection
          rows={rows}
          apicHost={apicHost}
          apicToken={apicToken}
          mode={mode}
          onUploadAnother={onUploadAnother}
          onReconnect={onReconnect}
        />
      )}
    />
  )
}

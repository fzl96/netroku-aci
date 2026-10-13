'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SERVICE_LABELS, sortedIps, type Policy } from '@/lib/inventory/compliance/policy'
import { saveCompliancePolicies } from '@/lib/inventory/compliance/actions'

export function CompliancePolicyForm({ policies }: { policies: Policy[] }) {
  const router = useRouter()
  const [values, setValues] = useState(
    policies.map((policy) => ({
      service: policy.service,
      enabled: policy.enabled,
      ips: policy.expectedIps.join('\n'),
    })),
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await saveCompliancePolicies(
            values.map((value) => ({
              service: value.service,
              enabled: value.enabled,
              expectedIps: value.ips.split(/[\s,;]+/).filter(Boolean),
            })),
          )
          if (!result.success) {
            setError(result.error)
            return
          }
          toast.success('Compliance parameters saved')
          setValues((current) =>
            current.map((value) => ({
              ...value,
              ips: sortedIps(value.ips.split(/[\s,;]+/).filter(Boolean)).join('\n'),
            })),
          )
          router.refresh()
        })
      }}
    >
      <p className="text-sm leading-relaxed text-subtle">
        These global IP lists apply to both IOS-XE and NX-OS. Enabled checks require an exact match:
        missing and extra IPs fail compliance. Order, VRF, and source interface are ignored.
      </p>
      {values.map((value, index) => (
        <section
          key={value.service}
          className="rounded-2xl border border-border bg-card p-5 md:p-6"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-foreground">
              {SERVICE_LABELS[value.service]} servers
            </h2>
            <div className="flex items-center gap-3">
              <label htmlFor={`${value.service}-enabled`} className="text-sm text-subtle">
                Enable check
              </label>
              <Switch
                className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&_[data-state=checked]]:translate-x-3.5 [&_[data-state=unchecked]]:translate-x-0"
                id={`${value.service}-enabled`}
                checked={value.enabled}
                disabled={pending}
                onCheckedChange={(enabled) =>
                  setValues((current) =>
                    current.map((entry, i) => (i === index ? { ...entry, enabled } : entry)),
                  )
                }
              />
            </div>
          </div>
          <label
            htmlFor={`${value.service}-ips`}
            className="mt-5 block text-sm font-medium text-foreground"
          >
            Required IPv4 addresses
          </label>
          <Textarea
            id={`${value.service}-ips`}
            value={value.ips}
            rows={5}
            disabled={pending}
            aria-describedby={`${value.service}-help`}
            className="mt-2 font-mono"
            onChange={(event) =>
              setValues((current) =>
                current.map((entry, i) =>
                  i === index ? { ...entry, ips: event.target.value } : entry,
                ),
              )
            }
          />
          <p id={`${value.service}-help`} className="mt-2 text-xs leading-relaxed text-subtle">
            Enter one IPv4 address per line, or separate addresses with commas. Duplicates are
            removed.
            {value.enabled
              ? ' At least one address is required.'
              : ' Devices show Not evaluated while this check is disabled.'}
          </p>
        </section>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save parameters'}
      </Button>
    </form>
  )
}

import { IconServer } from '@tabler/icons-react'

export function NoEpgHost() {
  return (
    <section className="flex flex-col items-center justify-center py-28 text-center">
      <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border bg-card">
        <IconServer size={24} className="text-faint" />
      </div>
      <h2 className="font-serif text-base font-semibold">No APIC hosts configured</h2>
      <p className="mt-1 max-w-[280px] text-xs text-subtle">
        Add an APIC host in Settings to view EPG inventory.
      </p>
    </section>
  )
}

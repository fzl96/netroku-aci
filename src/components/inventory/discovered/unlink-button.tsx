'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { unlinkSource } from '@/lib/inventory/sources/actions'
export function UnlinkButton({ id }: { id: string }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState('')
  const router = useRouter()
  return (
    <div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (
            !window.confirm(
              'Unlink discovery? The inventory asset and its last accepted values will be retained and become manually editable.',
            )
          )
            return
          start(async () => {
            const result = await unlinkSource(id)
            if (!result.success) setError(result.error)
            else router.refresh()
          })
        }}
      >
        Unlink source
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

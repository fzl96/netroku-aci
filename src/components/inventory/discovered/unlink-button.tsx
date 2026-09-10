'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { unlinkSource } from '@/lib/inventory/sources/actions'

export function UnlinkButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const [busy, start] = useTransition()
  const router = useRouter()

  function handleUnlink() {
    start(async () => {
      const result = await unlinkSource(id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setOpen(false)
      toast.success('Source unlinked')
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" className="text-xs" onClick={() => setOpen(true)}>
        Unlink source
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Unlink this source?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              The device stays in inventory with its last accepted values, and those fields become
              editable by hand. Scans stop updating it until you link it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end gap-1 rounded-b-xl border-t border-subtle bg-muted px-4 py-3">
            <AlertDialogCancel
              disabled={busy}
              className="border-0 bg-transparent px-4 py-2 text-sm text-muted-foreground shadow-none transition-colors hover:bg-transparent hover:text-foreground"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlink}
              disabled={busy}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? 'Unlinking…' : 'Unlink source'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

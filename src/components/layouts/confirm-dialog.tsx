import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/responsive-dialog"

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={title}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Abbrechen
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            onOpenChange(false)
            onConfirm()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </ResponsiveDialog>
  )
}

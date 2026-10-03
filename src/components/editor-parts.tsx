import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Switch } from "@/components/switch"
import { Button } from "@/components/ui/button"

/** "Aktiv" switch row for the task/reward editors (pausing keeps history). */
export function ActiveToggle({
  id,
  checked,
  onCheckedChange,
  hint,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  hint: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-input px-3.5 py-2.5">
      <span className="flex flex-col">
        <span id={id} className="text-sm font-medium">
          Aktiv
        </span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch
        label="Aktiv"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

/**
 * Save/cancel row of the editors plus an optional two-step delete: the first
 * tap arms the button ("Wirklich löschen?"), the second deletes. Avoids a
 * blocking browser confirm() inside the sheet.
 */
export function EditorFooter({
  saving,
  submitLabel,
  onCancel,
  onDelete,
  deleteConfirmText,
}: {
  saving: boolean
  submitLabel: string
  onCancel: () => void
  onDelete?: () => Promise<void>
  /** Shown while the delete button is armed. */
  deleteConfirmText?: string
}) {
  const [armed, setArmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async (): Promise<void> => {
    if (onDelete === undefined || deleting) {
      return
    }
    if (!armed) {
      setArmed(true)
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch {
      setDeleteError("Nicht gelöscht. Bitte erneut versuchen.")
      setArmed(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      {armed && deleteConfirmText !== undefined ? (
        <p role="status" className="text-sm text-destructive">
          {deleteConfirmText}
        </p>
      ) : null}
      {deleteError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {onDelete !== undefined ? (
          <Button
            type="button"
            variant="destructive"
            className="h-11 rounded-xl sm:mr-auto sm:h-10"
            disabled={saving || deleting}
            onClick={() => void handleDelete()}
            onBlur={() => setArmed(false)}
          >
            <Trash2 aria-hidden="true" />
            {armed ? "Wirklich löschen?" : "Löschen"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl sm:h-10"
          onClick={onCancel}
          disabled={saving || deleting}
        >
          Abbrechen
        </Button>
        <Button
          type="submit"
          className="h-11 rounded-xl sm:h-10"
          disabled={saving || deleting}
        >
          {saving ? "Wird gespeichert …" : submitLabel}
        </Button>
      </div>
    </div>
  )
}

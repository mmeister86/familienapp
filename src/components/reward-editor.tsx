import { useCallback, useState } from "react"
import type { FormEvent } from "react"
import { useMutation } from "convex/react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { api } from "../../convex/_generated/api"
import type { RewardItem } from "@/lib/rewards"

type RewardEditorProps = {
  token: string
  /** Null = create mode; a reward = edit mode. */
  reward: RewardItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FieldErrors = Partial<Record<"title" | "cost", string>>

const MAX_TITLE_LENGTH = 200
const MAX_EMOJI_LENGTH = 10

const COST_ERROR_MESSAGE = "Die Kosten müssen eine ganze Zahl ≥ 1 sein."
const SAVE_FAILED_MESSAGE = "Speichern fehlgeschlagen. Bitte erneut versuchen."

type EditorForm = {
  title: string
  emoji: string
  cost: string
  active: boolean
}

function initialForm(reward: RewardItem | null): EditorForm {
  return {
    title: reward?.title ?? "",
    emoji: reward?.emoji ?? "",
    cost: reward === null ? "" : String(reward.cost),
    active: reward?.active ?? true,
  }
}

// Parent-only create/edit form. Dialog on md+, bottom sheet on phones.
// Enter submits (native form), Esc closes (handled by the primitives).
export function RewardEditor({
  token,
  reward,
  open,
  onOpenChange,
}: RewardEditorProps) {
  const isMobile = useIsMobile()
  const createReward = useMutation(api.rewards.create)
  const updateReward = useMutation(api.rewards.update)

  const [form, setForm] = useState<EditorForm>(() => initialForm(reward))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Autofocus the title whenever its input (re)mounts while the editor is
  // open. A callback ref (not an effect on `open`): the dialog/sheet portal
  // mounts a commit after `open` flips, so an effect would run too early.
  const focusTitle = useCallback(
    (node: HTMLInputElement | null): void => {
      if (node !== null && open) {
        node.focus()
      }
    },
    [open],
  )

  // Reset the form on the closed -> open transition. Done during render
  // (React's "adjust state when props change" pattern): the session check
  // keeps reactive query updates from wiping in-progress edits while open.
  const [session, setSession] = useState({ open, reward })
  if (session.open !== open || session.reward !== reward) {
    setSession({ open, reward })
    if (open) {
      setForm(initialForm(reward))
      setFieldErrors({})
      setServerError(null)
      setSaving(false)
    }
  }

  const updateField = <K extends keyof EditorForm>(
    key: K,
    value: EditorForm[K],
  ): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (form.title.trim() === "") {
      errors.title = "Bitte einen Titel eingeben."
    }
    const cost = Number(form.cost)
    if (form.cost.trim() === "" || !Number.isInteger(cost) || cost < 1) {
      errors.cost = COST_ERROR_MESSAGE
    }
    return errors
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setServerError(null)
    try {
      const title = form.title.trim()
      const emoji = form.emoji.trim()
      const cost = Number(form.cost)
      if (reward === null) {
        await createReward({
          token,
          title,
          ...(emoji === "" ? {} : { emoji }),
          cost,
        })
      } else {
        await updateReward({
          token,
          rewardId: reward._id,
          title,
          emoji: emoji === "" ? null : emoji,
          cost,
          active: form.active,
        })
      }
      onOpenChange(false)
    } catch {
      setServerError(SAVE_FAILED_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (saving) {
      return
    }
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    void save()
  }

  const heading = reward === null ? "Neue Belohnung" : "Belohnung bearbeiten"

  const editorForm = (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn("flex flex-col gap-4", isMobile && "px-5 pb-5")}
    >
      <label
        htmlFor="reward-editor-title"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Titel
        <Input
          id="reward-editor-title"
          ref={focusTitle}
          value={form.title}
          maxLength={MAX_TITLE_LENGTH + 1}
          onChange={(event) => updateField("title", event.target.value)}
          placeholder="z. B. Eis essen"
          aria-invalid={fieldErrors.title !== undefined}
          aria-describedby={
            fieldErrors.title !== undefined
              ? "reward-editor-title-error"
              : undefined
          }
        />
      </label>
      {fieldErrors.title !== undefined ? (
        <p
          id="reward-editor-title-error"
          role="alert"
          className="-mt-2 text-sm font-normal text-destructive"
        >
          {fieldErrors.title}
        </p>
      ) : null}

      <label
        htmlFor="reward-editor-emoji"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Emoji
        <Input
          id="reward-editor-emoji"
          value={form.emoji}
          maxLength={MAX_EMOJI_LENGTH}
          onChange={(event) => updateField("emoji", event.target.value)}
          placeholder="z. B. 🍦"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reward-editor-cost" className="text-sm font-medium">
          Kosten
        </label>
        <Input
          id="reward-editor-cost"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={form.cost}
          onChange={(event) => updateField("cost", event.target.value)}
          placeholder="z. B. 50"
          aria-invalid={fieldErrors.cost !== undefined}
          aria-describedby={
            fieldErrors.cost !== undefined
              ? "reward-editor-cost-error"
              : undefined
          }
        />
        {fieldErrors.cost !== undefined ? (
          <p
            id="reward-editor-cost-error"
            role="alert"
            className="text-sm font-normal text-destructive"
          >
            {fieldErrors.cost}
          </p>
        ) : null}
      </div>

      {reward !== null ? (
        <label
          htmlFor="reward-editor-active"
          className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium"
        >
          <input
            id="reward-editor-active"
            type="checkbox"
            checked={form.active}
            onChange={(event) => updateField("active", event.target.checked)}
            className="size-5 shrink-0 accent-primary"
          />
          Aktiv
        </label>
      ) : null}

      {serverError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Abbrechen
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? "Wird gespeichert …"
            : reward === null
              ? "Erstellen"
              : "Speichern"}
        </Button>
      </div>
    </form>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] gap-0 overflow-y-auto rounded-t-xl"
        >
          <SheetHeader className="pb-4">
            <SheetTitle>{heading}</SheetTitle>
          </SheetHeader>
          {editorForm}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        {editorForm}
      </DialogContent>
    </Dialog>
  )
}

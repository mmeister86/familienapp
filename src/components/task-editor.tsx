import { useCallback, useState } from "react"
import type { FormEvent } from "react"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { nativeFieldClassName } from "@/components/chips"
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
import type { Id } from "../../convex/_generated/dataModel"
import {
  RECURRENCE_LABELS,
  WEEKDAY_SHORT,
  todayBerlinString,
  type Recurrence,
  type TaskAdminItem,
} from "@/lib/tasks"

type TaskEditorProps = {
  token: string
  /** Null = create mode; a task = edit mode. */
  task: TaskAdminItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FieldErrors = Partial<
  Record<
    | "title"
    | "notes"
    | "points"
    | "startDate"
    | "endDate"
    | "weeklyDays"
    | "dayOfMonth"
    | "everyNDays",
    string
  >
>

const RECURRENCE_KINDS: Recurrence["kind"][] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "afterCompletion",
]

const MAX_TITLE_LENGTH = 200
const MAX_NOTES_LENGTH = 2000

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type EditorForm = {
  title: string
  notes: string
  assigneeId: string
  points: string
  kind: Recurrence["kind"]
  weeklyDays: number[]
  dayOfMonth: string
  everyNDays: string
  dueDate: string
  startDate: string
  endDate: string
  active: boolean
}

function initialForm(task: TaskAdminItem | null): EditorForm {
  const recurrence = task?.recurrence
  return {
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    assigneeId: task?.assigneeId ?? "",
    points: task?.points === undefined ? "" : String(task.points),
    kind: recurrence?.kind ?? "none",
    weeklyDays:
      recurrence?.kind === "weekly" ? [...recurrence.days].sort() : [],
    dayOfMonth:
      recurrence?.kind === "monthly" ? String(recurrence.dayOfMonth) : "1",
    everyNDays:
      recurrence?.kind === "afterCompletion"
        ? String(recurrence.everyNDays)
        : "1",
    dueDate: recurrence?.kind === "none" ? (recurrence.dueDate ?? "") : "",
    startDate: task?.startDate ?? todayBerlinString(),
    endDate: task?.endDate ?? "",
    active: task?.active ?? true,
  }
}

// Parent-only create/edit form. Dialog on md+, bottom sheet on phones.
// Enter submits (native form), Esc closes (handled by the primitives).
export function TaskEditor({ token, task, open, onOpenChange }: TaskEditorProps) {
  const isMobile = useIsMobile()
  const directory = useQuery(api.users.list, open ? { token } : "skip")
  const createTask = useMutation(api.tasks.create)
  const updateTask = useMutation(api.tasks.update)

  const [form, setForm] = useState<EditorForm>(() => initialForm(task))
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

  // Points only exist for child assignees (backend rule) — the field is
  // hidden for "Familie" and parent assignees. Role comes from the directory
  // query, never from hardcoded slugs or names.
  const showPoints =
    form.assigneeId !== "" &&
    directory?.find((member) => member._id === form.assigneeId)?.role ===
      "child"

  // Reset the form on the closed -> open transition. Done during render
  // (React's "adjust state when props change" pattern): the session check
  // keeps reactive query updates from wiping in-progress edits while open.
  const [session, setSession] = useState({ open, task })
  if (session.open !== open || session.task !== task) {
    setSession({ open, task })
    if (open) {
      setForm(initialForm(task))
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

  const toggleDay = (day: number): void => {
    setForm((prev) => ({
      ...prev,
      weeklyDays: prev.weeklyDays.includes(day)
        ? prev.weeklyDays.filter((candidate) => candidate !== day)
        : [...prev.weeklyDays, day],
    }))
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    const trimmedTitle = form.title.trim()
    if (trimmedTitle === "") {
      errors.title = "Bitte einen Titel eingeben."
    } else if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      errors.title = `Der Titel darf höchstens ${String(MAX_TITLE_LENGTH)} Zeichen haben.`
    }
    if (form.notes.length > MAX_NOTES_LENGTH) {
      errors.notes = `Die Notizen dürfen höchstens ${String(MAX_NOTES_LENGTH)} Zeichen haben.`
    }
    if (showPoints && form.points !== "") {
      const points = Number(form.points)
      if (!Number.isInteger(points) || points < 0) {
        errors.points = "Punkte müssen eine ganze Zahl ≥ 0 sein."
      }
    }
    if (form.startDate === "") {
      errors.startDate = "Bitte ein Startdatum wählen."
    } else if (!DATE_PATTERN.test(form.startDate)) {
      errors.startDate = "Bitte ein gültiges Startdatum wählen."
    }
    if (
      form.endDate !== "" &&
      DATE_PATTERN.test(form.startDate) &&
      form.endDate < form.startDate
    ) {
      errors.endDate = "Das Enddatum darf nicht vor dem Startdatum liegen."
    }
    if (form.kind === "weekly" && form.weeklyDays.length === 0) {
      errors.weeklyDays = "Bitte mindestens einen Wochentag wählen."
    }
    if (form.kind === "monthly") {
      const day = Number(form.dayOfMonth)
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        errors.dayOfMonth = "Bitte einen Monatstag zwischen 1 und 31 wählen."
      }
    }
    if (form.kind === "afterCompletion") {
      const n = Number(form.everyNDays)
      if (!Number.isInteger(n) || n < 1) {
        errors.everyNDays = "Bitte eine Anzahl Tage ab 1 wählen."
      }
    }
    return errors
  }

  // Only called after validate() passed, so the parses cannot fail.
  const buildRecurrence = (): Recurrence => {
    switch (form.kind) {
      case "none":
        return form.dueDate === ""
          ? { kind: form.kind }
          : { kind: form.kind, dueDate: form.dueDate }
      case "daily":
        return { kind: form.kind }
      case "weekly":
        return {
          kind: form.kind,
          days: [...form.weeklyDays].sort((a, b) => a - b),
        }
      case "monthly":
        return { kind: form.kind, dayOfMonth: Number(form.dayOfMonth) }
      case "afterCompletion":
        return { kind: form.kind, everyNDays: Number(form.everyNDays) }
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setServerError(null)
    try {
      const recurrence = buildRecurrence()
      const trimmedTitle = form.title.trim()
      const trimmedNotes = form.notes.trim()
      // Hidden field (family/parent assignee) submits no points; while the
      // directory is still loading the role is unknown, so edits keep the
      // stored value instead of clearing it.
      const pointsValue =
        directory === undefined
          ? undefined
          : showPoints && form.points !== ""
            ? Number(form.points)
            : undefined
      if (task === null) {
        await createTask({
          token,
          title: trimmedTitle,
          ...(trimmedNotes === "" ? {} : { notes: trimmedNotes }),
          ...(form.assigneeId === ""
            ? {}
            : { assigneeId: form.assigneeId as Id<"users"> }),
          ...(pointsValue === undefined ? {} : { points: pointsValue }),
          recurrence,
          startDate: form.startDate,
          ...(form.endDate === "" ? {} : { endDate: form.endDate }),
        })
      } else {
        await updateTask({
          token,
          taskId: task._id,
          title: trimmedTitle,
          notes: trimmedNotes === "" ? null : trimmedNotes,
          assigneeId:
            form.assigneeId === ""
              ? null
              : (form.assigneeId as Id<"users">),
          ...(directory === undefined
            ? {}
            : { points: pointsValue ?? null }),
          recurrence,
          startDate: form.startDate,
          endDate: form.endDate === "" ? null : form.endDate,
          active: form.active,
        })
      }
      onOpenChange(false)
    } catch {
      setServerError("Speichern fehlgeschlagen. Bitte erneut versuchen.")
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

  const heading = task === null ? "Neue Aufgabe" : "Aufgabe bearbeiten"

  const editorForm = (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn("flex flex-col gap-4", isMobile && "px-5 pb-5")}
    >
      <label
        htmlFor="task-editor-title"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Titel
        <Input
          id="task-editor-title"
          ref={focusTitle}
          value={form.title}
          maxLength={MAX_TITLE_LENGTH + 1}
          onChange={(event) => updateField("title", event.target.value)}
          placeholder="z. B. Zimmer aufräumen"
          aria-invalid={fieldErrors.title !== undefined}
          aria-describedby={
            fieldErrors.title !== undefined
              ? "task-editor-title-error"
              : undefined
          }
        />
      </label>
      {fieldErrors.title !== undefined ? (
        <p
          id="task-editor-title-error"
          role="alert"
          className="-mt-2 text-sm font-normal text-destructive"
        >
          {fieldErrors.title}
        </p>
      ) : null}

      <label
        htmlFor="task-editor-notes"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Notizen
        <textarea
          id="task-editor-notes"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Optional"
          rows={3}
          aria-invalid={fieldErrors.notes !== undefined}
          aria-describedby={
            fieldErrors.notes !== undefined
              ? "task-editor-notes-error"
              : undefined
          }
          className={cn(nativeFieldClassName, "min-h-20 resize-y")}
        />
      </label>
      {fieldErrors.notes !== undefined ? (
        <p
          id="task-editor-notes-error"
          role="alert"
          className="-mt-2 text-sm font-normal text-destructive"
        >
          {fieldErrors.notes}
        </p>
      ) : null}

      <label
        htmlFor="task-editor-assignee"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Für
        <select
          id="task-editor-assignee"
          value={form.assigneeId}
          disabled={directory === undefined}
          onChange={(event) => updateField("assigneeId", event.target.value)}
          className={nativeFieldClassName}
        >
          <option value="">Familie</option>
          {directory === undefined ? (
            <option value="" disabled>
              Wird geladen …
            </option>
          ) : (
            directory.map((member) => (
              <option key={member._id} value={member._id}>
                {member.emoji} {member.name}
              </option>
            ))
          )}
        </select>
      </label>

      {showPoints ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-editor-points" className="text-sm font-medium">
            Punkte
          </label>
          <Input
            id="task-editor-points"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={form.points}
            onChange={(event) => updateField("points", event.target.value)}
            placeholder="z. B. 5"
            aria-invalid={fieldErrors.points !== undefined}
            aria-describedby={
              fieldErrors.points !== undefined
                ? "task-editor-points-error"
                : undefined
            }
          />
          {fieldErrors.points !== undefined ? (
            <p
              id="task-editor-points-error"
              role="alert"
              className="text-sm font-normal text-destructive"
            >
              {fieldErrors.points}
            </p>
          ) : null}
        </div>
      ) : null}

      <label
        htmlFor="task-editor-recurrence"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Wiederholung
        <select
          id="task-editor-recurrence"
          value={form.kind}
          onChange={(event) =>
            updateField("kind", event.target.value as Recurrence["kind"])
          }
          className={nativeFieldClassName}
        >
          {RECURRENCE_KINDS.map((recurrenceKind) => (
            <option key={recurrenceKind} value={recurrenceKind}>
              {RECURRENCE_LABELS[recurrenceKind]}
            </option>
          ))}
        </select>
      </label>

      {form.kind === "none" ? (
        <label
          htmlFor="task-editor-duedate"
          className="flex flex-col gap-1.5 text-sm font-medium"
        >
          Fälligkeitsdatum (optional)
          <Input
            id="task-editor-duedate"
            type="date"
            value={form.dueDate}
            onChange={(event) => updateField("dueDate", event.target.value)}
          />
        </label>
      ) : null}

      {form.kind === "weekly" ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Wochentage</legend>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Wochentage"
          >
            {WEEKDAY_SHORT.map((label, index) => {
              const day = index + 1
              const pressed = form.weeklyDays.includes(day)
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={pressed ? `${label} abwählen` : `${label} auswählen`}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    pressed
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-input hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {fieldErrors.weeklyDays !== undefined ? (
            <p role="alert" className="text-sm font-normal text-destructive">
              {fieldErrors.weeklyDays}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {form.kind === "monthly" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-editor-dayofmonth" className="text-sm font-medium">
            Monatstag
          </label>
          <Input
            id="task-editor-dayofmonth"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={form.dayOfMonth}
            onChange={(event) => updateField("dayOfMonth", event.target.value)}
            aria-invalid={fieldErrors.dayOfMonth !== undefined}
            aria-describedby={
              fieldErrors.dayOfMonth !== undefined
                ? "task-editor-dayofmonth-error"
                : undefined
            }
          />
          {fieldErrors.dayOfMonth !== undefined ? (
            <p
              id="task-editor-dayofmonth-error"
              role="alert"
              className="text-sm font-normal text-destructive"
            >
              {fieldErrors.dayOfMonth}
            </p>
          ) : null}
        </div>
      ) : null}

      {form.kind === "afterCompletion" ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="task-editor-everyndays"
            className="text-sm font-medium"
          >
            Tage nach Erledigung
          </label>
          <Input
            id="task-editor-everyndays"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.everyNDays}
            onChange={(event) => updateField("everyNDays", event.target.value)}
            aria-invalid={fieldErrors.everyNDays !== undefined}
            aria-describedby={
              fieldErrors.everyNDays !== undefined
                ? "task-editor-everyndays-error"
                : undefined
            }
          />
          {fieldErrors.everyNDays !== undefined ? (
            <p
              id="task-editor-everyndays-error"
              role="alert"
              className="text-sm font-normal text-destructive"
            >
              {fieldErrors.everyNDays}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-editor-start" className="text-sm font-medium">
            Startdatum
          </label>
          <Input
            id="task-editor-start"
            type="date"
            value={form.startDate}
            onChange={(event) => updateField("startDate", event.target.value)}
            aria-invalid={fieldErrors.startDate !== undefined}
            aria-describedby={
              fieldErrors.startDate !== undefined
                ? "task-editor-start-error"
                : undefined
            }
          />
          {fieldErrors.startDate !== undefined ? (
            <p
              id="task-editor-start-error"
              role="alert"
              className="text-sm font-normal text-destructive"
            >
              {fieldErrors.startDate}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-editor-end" className="text-sm font-medium">
            Enddatum (optional)
          </label>
          <Input
            id="task-editor-end"
            type="date"
            value={form.endDate}
            onChange={(event) => updateField("endDate", event.target.value)}
            aria-invalid={fieldErrors.endDate !== undefined}
            aria-describedby={
              fieldErrors.endDate !== undefined
                ? "task-editor-end-error"
                : undefined
            }
          />
          {fieldErrors.endDate !== undefined ? (
            <p
              id="task-editor-end-error"
              role="alert"
              className="text-sm font-normal text-destructive"
            >
              {fieldErrors.endDate}
            </p>
          ) : null}
        </div>
      </div>

      {task !== null ? (
        <label
          htmlFor="task-editor-active"
          className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium"
        >
          <input
            id="task-editor-active"
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
            : task === null
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

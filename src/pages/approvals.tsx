import { useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import { Link } from "react-router"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { api } from "../../convex/_generated/api"
import {
  AssigneeChip,
  PointsChip,
  nativeFieldClassName,
} from "@/components/chips"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import {
  formatRelativeTimeDe,
  formatShortDay,
  type TaskPendingItem,
} from "@/lib/tasks"

const MAX_REJECT_NOTE_LENGTH = 500

const SAVE_FAILED_MESSAGE = "Speichern fehlgeschlagen. Bitte erneut versuchen."

function CompletedLabel({ item }: { item: TaskPendingItem }) {
  if (item.completedAt === undefined) {
    return null
  }
  return (
    <span className="whitespace-nowrap">
      {formatRelativeTimeDe(item.completedAt)}
    </span>
  )
}

export function ApprovalsPage() {
  const { token, user } = useSession()
  const isParent = user?.role === "parent"
  const pending = useQuery(
    api.taskInstances.listPending,
    token && isParent ? { token } : "skip",
  )
  const approveTask = useMutation(api.tasks.approve)
  const rejectTask = useMutation(api.tasks.reject)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<TaskPendingItem | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [rejectError, setRejectError] = useState<string | null>(null)

  if (user !== undefined && !isParent) {
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Freigaben</h1>
        <p className="text-muted-foreground">Nur für Eltern.</p>
        <Button render={<Link to="/" />}>Zurück zu Heute</Button>
      </section>
    )
  }

  if (token === null || pending === undefined) {
    return (
      <section aria-label="Freigaben" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32 bg-muted" />
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-16 bg-muted" />
          <Skeleton className="h-16 bg-muted" />
        </div>
      </section>
    )
  }

  const busy = busyId !== null

  const handleApprove = async (item: TaskPendingItem): Promise<void> => {
    if (busy) {
      return
    }
    setBusyId(item._id)
    setActionError(null)
    try {
      await approveTask({ token, instanceId: item._id })
    } catch {
      setActionError(SAVE_FAILED_MESSAGE)
    } finally {
      setBusyId(null)
    }
  }

  const openReject = (item: TaskPendingItem): void => {
    setRejectTarget(item)
    setRejectNote("")
    setRejectError(null)
  }

  const closeReject = (): void => {
    if (busy) {
      return
    }
    setRejectTarget(null)
    setRejectNote("")
    setRejectError(null)
  }

  const handleRejectSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (busy || rejectTarget === null) {
      return
    }
    if (rejectNote.trim().length > MAX_REJECT_NOTE_LENGTH) {
      setRejectError(
        `Die Notiz darf höchstens ${String(MAX_REJECT_NOTE_LENGTH)} Zeichen haben.`,
      )
      return
    }
    const target = rejectTarget
    const note = rejectNote.trim()
    setBusyId(target._id)
    setRejectError(null)
    void (async (): Promise<void> => {
      try {
        await rejectTask({
          token,
          instanceId: target._id,
          ...(note === "" ? {} : { note }),
        })
        setRejectTarget(null)
        setRejectNote("")
      } catch {
        setRejectError(SAVE_FAILED_MESSAGE)
      } finally {
        setBusyId(null)
      }
    })()
  }

  // Enter submits the dialog, Shift+Enter inserts a newline. Esc closes
  // (handled by the Dialog primitive).
  const handleNoteKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Freigaben</h1>

      {actionError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {/* Phase 4 adds a "Belohnungen" section below this one. */}
      <section
        aria-labelledby="approvals-tasks-heading"
        className="flex flex-col gap-3"
      >
        <h2
          id="approvals-tasks-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Aufgaben
        </h2>

        {pending.length === 0 ? (
          <p className="text-muted-foreground">Keine offenen Freigaben. 🎉</p>
        ) : (
          <>
            {/* Cards below lg. */}
            <ul className="flex flex-col gap-2 lg:hidden">
              {pending.map((item) => (
                <li
                  key={item._id}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-3"
                >
                  <p className="min-w-0 text-base font-medium break-words">
                    {item.taskTitle}
                  </p>
                  {item.taskNotes ? (
                    <p className="line-clamp-2 text-sm break-words text-muted-foreground">
                      {item.taskNotes}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <AssigneeChip
                      name={item.assigneeName}
                      emoji={item.assigneeEmoji}
                    />
                    {item.pointsSnapshot === undefined ? (
                      <span className="text-muted-foreground">–</span>
                    ) : (
                      <PointsChip points={item.pointsSnapshot} />
                    )}
                    <CompletedLabel item={item} />
                    {item.date !== undefined ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {formatShortDay(item.date)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11 flex-1"
                      disabled={busy}
                      aria-label={`Bestätigen: ${item.taskTitle}`}
                      onClick={() => void handleApprove(item)}
                    >
                      Bestätigen
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 flex-1"
                      disabled={busy}
                      aria-label={`Ablehnen: ${item.taskTitle}`}
                      onClick={() => openReject(item)}
                    >
                      Ablehnen
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Table on lg. */}
            <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">
                      Aufgabe
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Kind
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Punkte
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Erledigt
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((item) => (
                    <tr
                      key={item._id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="max-w-64 px-4 py-3 font-medium">
                        <span className="block break-words">
                          {item.taskTitle}
                        </span>
                        {item.taskNotes ? (
                          <span className="line-clamp-1 block font-normal break-words text-muted-foreground">
                            {item.taskNotes}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <AssigneeChip
                          name={item.assigneeName}
                          emoji={item.assigneeEmoji}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.pointsSnapshot === undefined ? (
                          <span className="text-muted-foreground">–</span>
                        ) : (
                          <PointsChip points={item.pointsSnapshot} />
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <CompletedLabel item={item} />
                          {item.date !== undefined ? (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                              {formatShortDay(item.date)}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            aria-label={`Bestätigen: ${item.taskTitle}`}
                            onClick={() => void handleApprove(item)}
                          >
                            Bestätigen
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            aria-label={`Ablehnen: ${item.taskTitle}`}
                            onClick={() => openReject(item)}
                          >
                            Ablehnen
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeReject()
          }
        }}
      >
        <DialogContent showCloseButton={!busy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {rejectTarget === null
                ? "Aufgabe ablehnen"
                : `„${rejectTarget.taskTitle}" ablehnen`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRejectSubmit} noValidate className="flex flex-col gap-4">
            <label
              htmlFor="approvals-reject-note"
              className="flex flex-col gap-1.5 text-sm font-medium"
            >
              Notiz für das Kind (optional)
              <textarea
                id="approvals-reject-note"
                value={rejectNote}
                onChange={(event) => setRejectNote(event.target.value)}
                onKeyDown={handleNoteKeyDown}
                placeholder="Was soll anders gemacht werden?"
                rows={4}
                maxLength={MAX_REJECT_NOTE_LENGTH + 1}
                aria-invalid={
                  rejectNote.trim().length > MAX_REJECT_NOTE_LENGTH
                }
                aria-describedby={
                  rejectError !== null
                    ? "approvals-reject-note-error"
                    : undefined
                }
                className={cn(nativeFieldClassName, "min-h-20 resize-y")}
              />
            </label>
            {rejectError !== null ? (
              <p
                id="approvals-reject-note-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {rejectError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={closeReject}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={busy}>
                Ablehnen
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState } from "react"
import type { FormEvent, KeyboardEvent, ReactNode } from "react"
import { Link } from "react-router"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { Check, Gift, X } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Avatar } from "@/components/avatar"
import { PointsChip, nativeFieldClassName } from "@/components/chips"
import { ListGroup } from "@/components/list"
import { PageHeader } from "@/components/page-header"
import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import type { RedemptionItem } from "@/lib/rewards"
import {
  formatRelativeTimeDe,
  formatShortDay,
  type TaskPendingItem,
} from "@/lib/tasks"

const MAX_REJECT_NOTE_LENGTH = 500

const SAVE_FAILED_MESSAGE = "Nicht gespeichert. Bitte erneut versuchen."

type ApprovalRowProps = {
  personName: string | undefined
  personEmoji: string | undefined
  personColor: string | undefined
  leading?: ReactNode
  title: string
  notes?: string
  meta: ReactNode
  points: number | undefined
  busy: boolean
  approveLabel: string
  rejectLabel: string
  onApprove: () => void
  onReject: () => void
}

// One approval: who, what, when, plus approve/reject. Stacked with
// full-width buttons on phones; one line with inline actions from `md`.
function ApprovalRow({
  personName,
  personEmoji,
  personColor,
  leading,
  title,
  notes,
  meta,
  points,
  busy,
  approveLabel,
  rejectLabel,
  onApprove,
  onReject,
}: ApprovalRowProps) {
  return (
    <li className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {leading ?? (
          <Avatar emoji={personEmoji} color={personColor} size="md" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[1rem] leading-snug font-semibold break-words">
            {title}
          </p>
          {notes ? (
            <p className="line-clamp-2 text-sm break-words text-muted-foreground">
              {notes}
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {personName ?? "Familie"}
            </span>
            {meta}
          </p>
        </div>
        {points !== undefined ? (
          <PointsChip points={points} className="mt-0.5" />
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl md:h-9"
          disabled={busy}
          aria-label={rejectLabel}
          onClick={onReject}
        >
          <X aria-hidden="true" />
          Ablehnen
        </Button>
        <Button
          type="button"
          className="h-11 rounded-xl bg-success text-white hover:bg-success/90 md:h-9"
          disabled={busy}
          aria-label={approveLabel}
          onClick={onApprove}
        >
          <Check aria-hidden="true" />
          Bestätigen
        </Button>
      </div>
    </li>
  )
}

function RewardBadge({ emoji }: { emoji: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xl"
    >
      {emoji ?? <Gift className="size-5 text-gold" />}
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
  const requested = useQuery(
    api.rewards.listRequested,
    token && isParent ? { token } : "skip",
  )
  const approveTask = useMutation(api.tasks.approve)
  const rejectTask = useMutation(api.tasks.reject)
  const approveRedemption = useMutation(api.rewards.approveRedemption)
  const rejectRedemption = useMutation(api.rewards.rejectRedemption)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<TaskPendingItem | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [rejectError, setRejectError] = useState<string | null>(null)

  if (user !== undefined && !isParent) {
    return (
      <section className="flex flex-col items-start gap-4">
        <PageHeader title="Freigaben" subtitle="Nur für Eltern." />
        <Button render={<Link to="/" />}>Zurück zu Heute</Button>
      </section>
    )
  }

  if (token === null || pending === undefined || requested === undefined) {
    return (
      <section aria-label="Freigaben" className="flex flex-col gap-5">
        <Skeleton className="h-10 w-40 bg-muted" />
        <Skeleton className="h-36 rounded-2xl bg-muted" aria-hidden="true" />
      </section>
    )
  }

  const busy = busyId !== null

  const run = async (
    id: string,
    action: () => Promise<unknown>,
  ): Promise<void> => {
    if (busy) {
      return
    }
    setBusyId(id)
    setActionError(null)
    try {
      await action()
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

  const total = pending.length + requested.length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Freigaben"
        subtitle={
          total === 0
            ? "Nichts offen"
            : total === 1
              ? "1 wartet auf euch"
              : `${String(total)} warten auf euch`
        }
      />

      {actionError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-card px-6 py-10 text-center shadow-[0_0_0_1px_var(--border)]">
          <span aria-hidden="true" className="text-5xl">
            ✅
          </span>
          <p className="text-lg font-semibold">Alles freigegeben</p>
          <p className="text-sm text-muted-foreground">
            Neue Anfragen der Kinder erscheinen hier.
          </p>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <ListGroup
          title="Erledigte Aufgaben"
          titleId="approvals-tasks-heading"
          trailing={
            <span className="text-sm text-muted-foreground tabular-nums">
              {pending.length}
            </span>
          }
        >
          {pending.map((item) => (
            <ApprovalRow
              key={item._id}
              personName={item.assigneeName}
              personEmoji={item.assigneeEmoji}
              personColor={item.assigneeColor}
              title={item.taskTitle}
              notes={item.taskNotes}
              points={item.pointsSnapshot}
              meta={
                <>
                  {item.completedAt !== undefined ? (
                    <span>
                      erledigt {formatRelativeTimeDe(item.completedAt)}
                    </span>
                  ) : null}
                  {item.date !== undefined ? (
                    <span>für {formatShortDay(item.date)}</span>
                  ) : null}
                </>
              }
              busy={busy}
              approveLabel={`Bestätigen: ${item.taskTitle}`}
              rejectLabel={`Ablehnen: ${item.taskTitle}`}
              onApprove={() =>
                void run(item._id, () =>
                  approveTask({ token, instanceId: item._id }),
                )
              }
              onReject={() => openReject(item)}
            />
          ))}
        </ListGroup>
      ) : null}

      {requested.length > 0 ? (
        <ListGroup
          title="Wünsche"
          titleId="approvals-rewards-heading"
          trailing={
            <span className="text-sm text-muted-foreground tabular-nums">
              {requested.length}
            </span>
          }
        >
          {requested.map((item: RedemptionItem) => (
            <ApprovalRow
              key={item._id}
              personName={item.userName}
              personEmoji={item.userEmoji}
              personColor={item.userColor}
              leading={<RewardBadge emoji={item.rewardEmoji} />}
              title={item.rewardTitle}
              points={item.costSnapshot}
              meta={
                <span>angefragt {formatRelativeTimeDe(item.requestedAt)}</span>
              }
              busy={busy}
              approveLabel={`Bestätigen: ${item.rewardTitle}`}
              rejectLabel={`Ablehnen: ${item.rewardTitle}`}
              onApprove={() =>
                void run(item._id, () =>
                  approveRedemption({ token, redemptionId: item._id }),
                )
              }
              onReject={() =>
                void run(item._id, () =>
                  rejectRedemption({ token, redemptionId: item._id }),
                )
              }
            />
          ))}
        </ListGroup>
      ) : null}

      <ResponsiveDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeReject()
          }
        }}
        dismissible={!busy}
        title={
          rejectTarget === null
            ? "Aufgabe ablehnen"
            : `„${rejectTarget.taskTitle}“ ablehnen`
        }
        description="Die Aufgabe wird wieder offen. Die Notiz sieht das Kind direkt an der Aufgabe."
      >
        <form
          onSubmit={handleRejectSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <label
            htmlFor="approvals-reject-note"
            className="flex flex-col gap-1.5 text-sm font-medium"
          >
            Notiz (optional)
            <textarea
              id="approvals-reject-note"
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              onKeyDown={handleNoteKeyDown}
              placeholder="Was soll anders gemacht werden?"
              rows={4}
              maxLength={MAX_REJECT_NOTE_LENGTH + 1}
              aria-invalid={rejectNote.trim().length > MAX_REJECT_NOTE_LENGTH}
              aria-describedby={
                rejectError !== null ? "approvals-reject-note-error" : undefined
              }
              className={cn(nativeFieldClassName, "min-h-24 resize-y")}
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
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl sm:h-10"
              disabled={busy}
              onClick={closeReject}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="h-11 rounded-xl sm:h-10"
              disabled={busy}
            >
              Ablehnen
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </div>
  )
}

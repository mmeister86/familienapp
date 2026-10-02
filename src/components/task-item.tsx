import { useState } from "react"
import { useMutation } from "convex/react"
import { cn } from "cn"
import { Check, Clock } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { AssigneeChip, PointsChip } from "@/components/chips"
import { useSession } from "@/hooks/useSession"
import { formatShortDay, type TaskInstanceItem } from "@/lib/tasks"

type TaskItemProps = {
  item: TaskInstanceItem
  token: string
  /** Red accent + date chip for items in the overdue section. */
  overdue?: boolean
}

// One checkbox row of the Today/Anytime/Upcoming lists. Done items render
// struck-through and the checkbox becomes the undo action. Pending items show
// a disabled waiting checkbox plus a badge (parents approve via Approvals);
// the completer (or a parent) can withdraw the pending completion.
export function TaskItem({ item, token, overdue = false }: TaskItemProps) {
  const complete = useMutation(api.tasks.complete)
  const undo = useMutation(api.tasks.undo)
  const { user } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const done = item.status === "done"
  const awaitingApproval = item.status === "pending"
  const canWithdraw =
    awaitingApproval &&
    user !== undefined &&
    (user.role === "parent" || item.completedBy === user._id)

  const toggle = async (): Promise<void> => {
    if (busy || awaitingApproval) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (done) {
        await undo({ token, instanceId: item._id })
      } else {
        await complete({ token, instanceId: item._id })
      }
    } catch {
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.")
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (): Promise<void> => {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await undo({ token, instanceId: item._id })
    } catch {
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-xl border bg-card p-2",
          overdue && !done && "border-destructive/50",
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={
            awaitingApproval
              ? `Wartet auf Freigabe: ${item.taskTitle}`
              : done
                ? `Als offen markieren: ${item.taskTitle}`
                : `Als erledigt markieren: ${item.taskTitle}`
          }
          disabled={busy || awaitingApproval}
          onClick={() => void toggle()}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 items-center justify-center rounded-md border-2 transition-colors",
              done
                ? "border-primary bg-primary text-primary-foreground"
                : awaitingApproval
                  ? "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : overdue
                    ? "border-destructive"
                    : "border-muted-foreground/50",
            )}
          >
            {done ? (
              <Check className="size-4" />
            ) : awaitingApproval ? (
              <Clock className="size-4" />
            ) : null}
          </span>
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-1 pr-1">
          <p
            className={cn(
              "text-base leading-snug font-medium break-words",
              done && "text-muted-foreground line-through",
            )}
          >
            {item.taskTitle}
          </p>
          {item.taskNotes ? (
            <p className="line-clamp-2 text-sm break-words text-muted-foreground">
              {item.taskNotes}
            </p>
          ) : null}
          {item.status === "open" && item.rejectNote ? (
            <p className="rounded-lg bg-amber-500/10 px-2 py-1 text-sm break-words text-amber-700 dark:text-amber-300">
              Notiz: {item.rejectNote}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {awaitingApproval ? (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                Wartet auf Freigabe
              </span>
            ) : null}
            <AssigneeChip
              name={item.assigneeName}
              emoji={item.assigneeEmoji}
            />
            {item.pointsSnapshot !== undefined ? (
              <PointsChip points={item.pointsSnapshot} />
            ) : null}
            {overdue && item.date !== undefined && !done ? (
              <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {formatShortDay(item.date)}
              </span>
            ) : null}
            {canWithdraw ? (
              <button
                type="button"
                disabled={busy}
                aria-label={`Zurückziehen: ${item.taskTitle}`}
                onClick={() => void withdraw()}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 min-h-8"
              >
                Zurückziehen
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {error !== null ? (
        <p role="alert" className="px-2 pt-1 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  )
}

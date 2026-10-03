import { useState } from "react"
import { useMutation } from "convex/react"
import { cn } from "cn"
import { Check, Clock, Repeat } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Avatar } from "@/components/avatar"
import { PointsChip } from "@/components/chips"
import { useSession } from "@/hooks/useSession"
import { celebrateCompletion } from "@/lib/confetti"
import { formatShortDay, type TaskInstanceItem } from "@/lib/tasks"

type TaskItemProps = {
  item: TaskInstanceItem
  token: string
  /** Red accent + date chip for items in the overdue section. */
  overdue?: boolean
  /** Show who the task belongs to (off when the list is grouped by person). */
  showAssignee?: boolean
}

// Neutral colour for family tasks (no assignee).
const FAMILY_COLOR = "var(--primary)"

// One checkbox row of the Today/Anytime/Upcoming lists, rendered as an <li>
// inside a ListGroup. Done items render struck-through and the checkbox
// becomes the undo action. Pending items show a disabled waiting checkbox plus
// a badge (parents approve via Approvals); the completer (or a parent) can
// withdraw the pending completion.
export function TaskItem({
  item,
  token,
  overdue = false,
  showAssignee = true,
}: TaskItemProps) {
  const complete = useMutation(api.tasks.complete)
  const undo = useMutation(api.tasks.undo)
  const { user } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Pop the check only right after the user ticks it, not on every mount.
  const [justCompleted, setJustCompleted] = useState(false)

  const done = item.status === "done"
  const awaitingApproval = item.status === "pending"
  const canWithdraw =
    awaitingApproval &&
    user !== undefined &&
    (user.role === "parent" || item.completedBy === user._id)
  const color = item.assigneeColor ?? FAMILY_COLOR

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
        setJustCompleted(true)
        // Celebrate only the completion itself (not undo/withdraw), and only
        // for kids. celebrateCompletion honours reduced motion.
        if (user?.role === "child") {
          celebrateCompletion()
        }
      }
    } catch {
      setError("Nicht gespeichert. Tippe erneut, um es nochmal zu versuchen.")
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
      setError("Nicht zurückgezogen. Bitte erneut versuchen.")
    } finally {
      setBusy(false)
    }
  }

  const showDate = overdue && item.date !== undefined && !done

  return (
    <li className="flex items-start gap-1 py-1 pr-4 pl-1.5">
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
        className="pressable flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:active:scale-100"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-[1.625rem] items-center justify-center rounded-full border-2 transition-colors",
            done && "text-white",
            done && justCompleted && "animate-check-pop",
            awaitingApproval &&
              "border-dashed border-warning bg-warning/10 text-warning",
            !done && !awaitingApproval && overdue && "border-destructive",
            busy && "opacity-60",
          )}
          style={
            done
              ? { backgroundColor: color, borderColor: color }
              : !awaitingApproval && !overdue
                ? {
                    borderColor: `color-mix(in oklab, ${color} 55%, var(--muted-foreground) 20%)`,
                  }
                : undefined
          }
        >
          {done ? (
            <Check className="size-4" strokeWidth={3} />
          ) : awaitingApproval ? (
            <Clock className="size-3.5" strokeWidth={2.5} />
          ) : null}
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2.5">
        <p
          className={cn(
            "text-[1rem] leading-snug font-medium break-words",
            done && "text-muted-foreground line-through decoration-1",
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
          <p className="rounded-lg bg-warning/10 px-2.5 py-1.5 text-sm break-words text-warning">
            Notiz: {item.rejectNote}
          </p>
        ) : null}

        {awaitingApproval ||
        showAssignee ||
        showDate ||
        item.recurring ||
        canWithdraw ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-muted-foreground">
            {awaitingApproval ? (
              <span className="inline-flex items-center rounded-full bg-warning/12 px-2 py-0.5 text-xs font-semibold text-warning">
                Wartet auf Freigabe
              </span>
            ) : null}
            {showAssignee ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar
                  emoji={item.assigneeEmoji}
                  color={item.assigneeColor}
                  size="xs"
                />
                {item.assigneeName ?? "Familie"}
              </span>
            ) : null}
            {showDate && item.date !== undefined ? (
              <span className="font-medium text-destructive">
                {formatShortDay(item.date)}
              </span>
            ) : null}
            {item.recurring ? (
              <span className="inline-flex items-center gap-1">
                <Repeat aria-hidden="true" className="size-3.5" />
                <span>Wiederkehrend</span>
              </span>
            ) : null}
            {canWithdraw ? (
              <button
                type="button"
                disabled={busy}
                aria-label={`Zurückziehen: ${item.taskTitle}`}
                onClick={() => void withdraw()}
                className="-mx-1 min-h-8 rounded-md px-1 font-medium text-foreground/80 underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Zurückziehen
              </button>
            ) : null}
          </div>
        ) : null}

        {error !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {item.pointsSnapshot !== undefined ? (
        <div className="pt-3">
          <PointsChip points={item.pointsSnapshot} />
        </div>
      ) : null}
    </li>
  )
}

import { useState } from "react"
import { useMutation } from "convex/react"
import { cn } from "cn"
import { Check, Star } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { formatShortDay, type TaskInstanceItem } from "@/lib/tasks"

type TaskItemProps = {
  item: TaskInstanceItem
  token: string
  /** Red accent + date chip for items in the overdue section. */
  overdue?: boolean
}

// One checkbox row of the Today/Anytime/Upcoming lists. Done items render
// struck-through and the checkbox becomes the undo action.
export function TaskItem({ item, token, overdue = false }: TaskItemProps) {
  const complete = useMutation(api.tasks.complete)
  const undo = useMutation(api.tasks.undo)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const done = item.status === "done"

  const toggle = async (): Promise<void> => {
    if (pending) {
      return
    }
    setPending(true)
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
      setPending(false)
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
            done
              ? `Als offen markieren: ${item.taskTitle}`
              : `Als erledigt markieren: ${item.taskTitle}`
          }
          disabled={pending}
          onClick={() => void toggle()}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 items-center justify-center rounded-md border-2 transition-colors",
              done
                ? "border-primary bg-primary text-primary-foreground"
                : overdue
                  ? "border-destructive"
                  : "border-muted-foreground/50",
            )}
          >
            {done ? <Check className="size-4" /> : null}
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
          <div className="flex flex-wrap items-center gap-1.5">
            {item.assigneeName ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                <span aria-hidden="true">{item.assigneeEmoji}</span>
                {item.assigneeName}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                Familie
              </span>
            )}
            {item.pointsSnapshot !== undefined ? (
              <span
                aria-label={`${String(item.pointsSnapshot)} Punkte`}
                className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
              >
                <Star aria-hidden="true" className="size-3" />
                {item.pointsSnapshot}
              </span>
            ) : null}
            {overdue && item.date !== undefined && !done ? (
              <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {formatShortDay(item.date)}
              </span>
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

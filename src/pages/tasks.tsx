import { useState } from "react"
import { Link, useLocation } from "react-router"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { ChevronRight, Plus, Repeat } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Avatar } from "@/components/avatar"
import { PointsChip } from "@/components/chips"
import { ListGroup } from "@/components/list"
import { PageHeader } from "@/components/page-header"
import { TaskEditor } from "@/components/task-editor"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import {
  RECURRENCE_LABELS,
  formatRecurrenceDetail,
  formatShortDay,
  type TaskAdminItem,
} from "@/lib/tasks"

type EditorState = {
  open: boolean
  task: TaskAdminItem | null
}

// German date range: "Fr, 3. Okt." or "Fr, 3. Okt. – Fr, 10. Okt.".
function formatRange(task: TaskAdminItem): string {
  const start = formatShortDay(task.startDate)
  return task.endDate === undefined
    ? `ab ${start}`
    : `${start} – ${formatShortDay(task.endDate)}`
}

function recurrenceText(task: TaskAdminItem): string {
  const detail = formatRecurrenceDetail(task.recurrence)
  const label = RECURRENCE_LABELS[task.recurrence.kind]
  return detail === null ? label : `${label}, ${detail}`
}

// One task definition. The whole row opens the editor (edit + delete live
// there), which is the native list pattern on phones and stays a single
// keyboard stop on laptops.
function TaskRow({
  task,
  onEdit,
}: {
  task: TaskAdminItem
  onEdit: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Aufgabe bearbeiten: ${task.title}`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:bg-muted active:bg-muted md:hover:bg-muted/60"
      >
        <Avatar
          emoji={task.assigneeEmoji}
          color={task.assigneeColor}
          size="md"
          className={cn(!task.active && "opacity-50")}
        />
        <span
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-0.5 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:items-center md:gap-4",
            !task.active && "opacity-60",
          )}
        >
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate text-[1rem] font-semibold">
                {task.title}
              </span>
              {!task.active ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Pausiert
                </span>
              ) : null}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {task.assigneeName ?? "Familie"}
              {task.notes ? ` – ${task.notes}` : ""}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Repeat aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{recurrenceText(task)}</span>
          </span>
          <span className="hidden text-sm text-muted-foreground md:block">
            {formatRange(task)}
          </span>
        </span>
        {/* Fixed slot from md so the columns line up with and without points. */}
        <span
          className={cn(
            "shrink-0 justify-end md:flex md:w-12",
            task.points === undefined ? "hidden" : "flex",
          )}
        >
          {task.points !== undefined ? (
            <PointsChip points={task.points} />
          ) : null}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground/60"
        />
      </button>
    </li>
  )
}

export function TasksPage() {
  const { token, user } = useSession()
  const isParent = user?.role === "parent"
  const tasks = useQuery(api.tasks.list, token && isParent ? { token } : "skip")
  const removeTask = useMutation(api.tasks.remove)
  const [editor, setEditor] = useState<EditorState>({ open: false, task: null })
  const location = useLocation()

  // `n` shortcut intent from useShortcuts: every shortcut press navigates
  // with a fresh location key, so consuming each key once opens a blank
  // editor exactly once per press (during render, no effect needed).
  const [consumedKey, setConsumedKey] = useState<string | null>(null)
  if (location.key !== consumedKey) {
    setConsumedKey(location.key)
    const state = location.state as { openNewTask?: boolean } | null
    if (state?.openNewTask === true) {
      setEditor({ open: true, task: null })
    }
  }

  if (user !== undefined && !isParent) {
    return (
      <section className="flex flex-col items-start gap-4">
        <PageHeader title="Aufgaben" subtitle="Nur für Eltern." />
        <Button render={<Link to="/" />}>Zurück zu Heute</Button>
      </section>
    )
  }

  if (token === null || tasks === undefined) {
    return (
      <section aria-label="Aufgaben" className="flex flex-col gap-5">
        <Skeleton className="h-10 w-40 bg-muted" />
        <Skeleton className="h-48 rounded-2xl bg-muted" aria-hidden="true" />
      </section>
    )
  }

  const active = tasks.filter((task) => task.active)
  const paused = tasks.filter((task) => !task.active)

  const handleDelete = async (task: TaskAdminItem): Promise<void> => {
    await removeTask({ token, taskId: task._id })
    setEditor((prev) => ({ ...prev, open: false }))
  }

  const newTaskButton = (
    <Button
      type="button"
      onClick={() => setEditor({ open: true, task: null })}
      aria-label="Neue Aufgabe"
      className="size-11 rounded-full p-0 md:h-10 md:w-auto md:rounded-xl md:px-4"
    >
      <Plus aria-hidden="true" className="size-5 md:size-4" />
      <span className="hidden md:inline">Neue Aufgabe</span>
      <kbd
        aria-hidden="true"
        className="hidden rounded border border-primary-foreground/30 px-1.5 text-xs md:inline"
      >
        n
      </kbd>
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Aufgaben"
        subtitle={`${String(active.length)} aktiv${paused.length > 0 ? `, ${String(paused.length)} pausiert` : ""}`}
        actions={newTaskButton}
      />

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-10 text-center shadow-[0_0_0_1px_var(--border)]">
          <p className="text-lg font-semibold">Noch keine Aufgaben</p>
          <p className="text-sm text-muted-foreground">
            Lege wiederkehrende Aufgaben wie „Müll rausbringen“ einmal an. Sie
            erscheinen dann automatisch bei Heute.
          </p>
          <Button
            type="button"
            className="h-11 rounded-xl"
            onClick={() => setEditor({ open: true, task: null })}
          >
            <Plus aria-hidden="true" />
            Erste Aufgabe anlegen
          </Button>
        </div>
      ) : null}

      {active.length > 0 ? (
        <ListGroup title="Aktiv" titleId="tasks-active">
          {active.map((task) => (
            <TaskRow
              key={task._id}
              task={task}
              onEdit={() => setEditor({ open: true, task })}
            />
          ))}
        </ListGroup>
      ) : null}

      {paused.length > 0 ? (
        <ListGroup title="Pausiert" titleId="tasks-paused">
          {paused.map((task) => (
            <TaskRow
              key={task._id}
              task={task}
              onEdit={() => setEditor({ open: true, task })}
            />
          ))}
        </ListGroup>
      ) : null}

      <TaskEditor
        token={token}
        task={editor.task}
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        onDelete={handleDelete}
      />
    </div>
  )
}

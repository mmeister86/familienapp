import { useState } from "react"
import { Link, useLocation } from "react-router"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { api } from "../../convex/_generated/api"
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
    ? start
    : `${start} – ${formatShortDay(task.endDate)}`
}

function AssigneeLabel({ task }: { task: TaskAdminItem }) {
  if (task.assigneeName === undefined) {
    return <span>Familie</span>
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true">{task.assigneeEmoji}</span>
      {task.assigneeName}
    </span>
  )
}

function RecurrenceLabel({ task }: { task: TaskAdminItem }) {
  const detail = formatRecurrenceDetail(task.recurrence)
  return (
    <span>
      {RECURRENCE_LABELS[task.recurrence.kind]}
      {detail === null ? null : (
        <span className="block text-xs font-normal text-muted-foreground">
          {detail}
        </span>
      )}
    </span>
  )
}

export function TasksPage() {
  const { token, user } = useSession()
  const isParent = user?.role === "parent"
  const tasks = useQuery(
    api.tasks.list,
    token && isParent ? { token } : "skip",
  )
  const removeTask = useMutation(api.tasks.remove)
  const [editor, setEditor] = useState<EditorState>({ open: false, task: null })
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
        <h1 className="text-2xl font-semibold tracking-tight">Aufgaben</h1>
        <p className="text-muted-foreground">Nur für Eltern.</p>
        <Button render={<Link to="/" />}>Zurück zu Heute</Button>
      </section>
    )
  }

  if (token === null || tasks === undefined) {
    return (
      <section aria-label="Aufgaben" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32 bg-muted" />
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-16 bg-muted" />
          <Skeleton className="h-16 bg-muted" />
        </div>
      </section>
    )
  }

  const handleDelete = async (task: TaskAdminItem): Promise<void> => {
    const confirmed = window.confirm(
      "Aufgabe wirklich löschen? Alle zugehörigen Termine werden ebenfalls gelöscht.",
    )
    if (!confirmed) {
      return
    }
    setDeleteError(null)
    try {
      await removeTask({ token, taskId: task._id })
    } catch {
      setDeleteError("Löschen fehlgeschlagen. Bitte erneut versuchen.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Aufgaben</h1>
        <Button
          type="button"
          onClick={() => setEditor({ open: true, task: null })}
        >
          <Plus aria-hidden="true" />
          Neue Aufgabe
          <kbd
            aria-label="Tastenkürzel: N"
            className="hidden rounded border border-primary-foreground/30 px-1.5 text-xs sm:inline"
          >
            n
          </kbd>
        </Button>
      </div>

      {deleteError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Aufgaben angelegt.</p>
      ) : (
        <>
          {/* Cards below lg. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {tasks.map((task) => (
              <li
                key={task._id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border bg-card p-3",
                  !task.active && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-base font-medium break-words">
                    {task.title}
                  </p>
                  {!task.active ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      Pausiert
                    </span>
                  ) : null}
                </div>
                {task.notes ? (
                  <p className="line-clamp-2 text-sm break-words text-muted-foreground">
                    {task.notes}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  <AssigneeLabel task={task} />
                  {" · "}
                  {RECURRENCE_LABELS[task.recurrence.kind]}
                  {formatRecurrenceDetail(task.recurrence) === null
                    ? null
                    : ` (${formatRecurrenceDetail(task.recurrence)})`}
                  {" · "}
                  {formatRange(task)}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 flex-1"
                    aria-label={`Aufgabe bearbeiten: ${task.title}`}
                    onClick={() => setEditor({ open: true, task })}
                  >
                    <Pencil aria-hidden="true" />
                    Bearbeiten
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="min-h-11 flex-1"
                    aria-label={`Aufgabe löschen: ${task.title}`}
                    onClick={() => void handleDelete(task)}
                  >
                    <Trash2 aria-hidden="true" />
                    Löschen
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Table-like list on lg. */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Titel
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Für
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Wiederholung
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Zeitraum
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task._id}
                    className={cn(
                      "border-b border-border last:border-0",
                      !task.active && "opacity-60",
                    )}
                  >
                    <td className="max-w-64 px-4 py-3 font-medium">
                      <span className="block break-words">{task.title}</span>
                      {task.notes ? (
                        <span className="line-clamp-1 block font-normal break-words text-muted-foreground">
                          {task.notes}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <AssigneeLabel task={task} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RecurrenceLabel task={task} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatRange(task)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {task.active ? (
                        "Aktiv"
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                          Pausiert
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11"
                          aria-label={`Aufgabe bearbeiten: ${task.title}`}
                          onClick={() => setEditor({ open: true, task })}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11"
                          aria-label={`Aufgabe löschen: ${task.title}`}
                          onClick={() => void handleDelete(task)}
                        >
                          <Trash2 aria-hidden="true" />
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

      <TaskEditor
        token={token}
        task={editor.task}
        open={editor.open}
        onOpenChange={(open) =>
          setEditor((prev) => ({ ...prev, open }))
        }
      />
    </div>
  )
}

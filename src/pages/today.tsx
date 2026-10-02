import { useMemo } from "react"
import { useQuery } from "convex/react"
import { Users } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { TaskItem } from "@/components/task-item"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import type { TaskInstanceItem } from "@/lib/tasks"

type PersonGroup = {
  key: string
  emoji: string | null
  name: string
  items: TaskInstanceItem[]
}

// Group items by assignee; family tasks (no assignee) form their own "Familie"
// group, sorted first, then members alphabetically.
function groupByPerson(items: TaskInstanceItem[]): PersonGroup[] {
  const groups = new Map<string, PersonGroup>()
  for (const item of items) {
    const key = item.assigneeId ?? "family"
    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, {
        key,
        emoji: item.assigneeEmoji ?? null,
        name: item.assigneeName ?? "Familie",
        items: [item],
      })
    } else {
      existing.items.push(item)
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === "family") {
      return -1
    }
    if (b.key === "family") {
      return 1
    }
    return a.name.localeCompare(b.name, "de")
  })
}

function LoadingState() {
  return (
    <section aria-label="Heute" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-32 bg-muted" />
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-16 bg-muted" />
        <Skeleton className="h-16 bg-muted" />
        <Skeleton className="h-16 bg-muted" />
      </div>
    </section>
  )
}

export function TodayPage() {
  const { token, user } = useSession()
  const data = useQuery(api.taskInstances.listToday, token ? { token } : "skip")
  const isParent = user?.role === "parent"

  const overdueGroups = useMemo(
    () => (data === undefined ? [] : groupByPerson(data.overdue)),
    [data],
  )
  const todayGroups = useMemo(
    () => (data === undefined ? [] : groupByPerson(data.today)),
    [data],
  )

  if (token === null || data === undefined) {
    return <LoadingState />
  }

  if (data.overdue.length === 0 && data.today.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Heute</h1>
        <p className="text-muted-foreground">Alles erledigt! 🎉</p>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Heute</h1>

      {data.overdue.length > 0 ? (
        <section aria-labelledby="today-overdue" className="flex flex-col gap-3">
          <h2
            id="today-overdue"
            className="text-lg font-semibold text-destructive"
          >
            Überfällig ({data.overdue.length})
          </h2>
          {isParent ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
              {overdueGroups.map((group) => (
                <section key={group.key} aria-label={group.name}>
                  <h3 className="flex items-center gap-2 pb-2 text-base font-semibold">
                    {group.emoji === null ? (
                      <Users aria-hidden="true" className="size-5" />
                    ) : (
                      <span aria-hidden="true">{group.emoji}</span>
                    )}
                    {group.name}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {group.items.map((item) => (
                      <TaskItem
                        key={item._id}
                        item={item}
                        token={token}
                        overdue
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.overdue.map((item) => (
                <TaskItem key={item._id} item={item} token={token} overdue />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="today-today" className="flex flex-col gap-3">
        <h2 id="today-today" className="text-lg font-semibold">
          Heute
        </h2>
        {data.today.length === 0 ? (
          <p className="text-muted-foreground">Keine Aufgaben für heute.</p>
        ) : isParent ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
            {todayGroups.map((group) => (
              <section key={group.key} aria-label={group.name}>
                <h3 className="flex items-center gap-2 pb-2 text-base font-semibold">
                  {group.emoji === null ? (
                    <Users aria-hidden="true" className="size-5" />
                  ) : (
                    <span aria-hidden="true">{group.emoji}</span>
                  )}
                  {group.name}
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <TaskItem key={item._id} item={item} token={token} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.today.map((item) => (
              <TaskItem key={item._id} item={item} token={token} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { ListGroup } from "@/components/list"
import { PageHeader } from "@/components/page-header"
import { TaskItem } from "@/components/task-item"
import { TaskListSwitcher } from "@/components/task-list-switcher"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import { todayBerlinString, upcomingDayParts } from "@/lib/tasks"

export function UpcomingPage() {
  const { token, user } = useSession()
  const days = useQuery(
    api.taskInstances.listUpcoming,
    token ? { token } : "skip",
  )
  const today = todayBerlinString()
  const isParent = user?.role === "parent"

  if (token === null || days === undefined) {
    return (
      <section aria-label="Demnächst" className="flex flex-col gap-5">
        <Skeleton className="h-10 w-48 bg-muted" />
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-24 rounded-2xl bg-muted" />
          <Skeleton className="h-24 rounded-2xl bg-muted" />
        </div>
      </section>
    )
  }

  const plannedDays = days.filter((day) => day.items.length > 0)
  const emptyDays = days.length - plannedDays.length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Demnächst" subtitle="Die nächsten 7 Tage">
        <TaskListSwitcher />
      </PageHeader>

      {plannedDays.length === 0 ? (
        <p className="rounded-3xl bg-card px-6 py-10 text-center text-muted-foreground shadow-[0_0_0_1px_var(--border)]">
          In den nächsten 7 Tagen ist nichts geplant.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {plannedDays.map((day) => {
            const parts = upcomingDayParts(day.date, today)
            return (
              <ListGroup
                key={day.date}
                titleId={`upcoming-${day.date}`}
                title={
                  <span className="flex items-baseline gap-2">
                    {parts.label}
                    <span className="text-sm font-normal text-muted-foreground">
                      {parts.date}
                    </span>
                  </span>
                }
                trailing={
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {day.items.length}
                  </span>
                }
              >
                {day.items.map((item) => (
                  <TaskItem
                    key={item._id}
                    item={item}
                    token={token}
                    showAssignee={isParent || item.assigneeId === undefined}
                  />
                ))}
              </ListGroup>
            )
          })}
          {emptyDays > 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              {emptyDays === 1
                ? "An einem Tag ist nichts geplant."
                : `An ${String(emptyDays)} Tagen ist nichts geplant.`}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

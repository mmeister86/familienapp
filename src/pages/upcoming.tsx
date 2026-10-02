import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { TaskItem } from "@/components/task-item"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import { formatUpcomingHeader, todayBerlinString } from "@/lib/tasks"

export function UpcomingPage() {
  const { token } = useSession()
  const days = useQuery(
    api.taskInstances.listUpcoming,
    token ? { token } : "skip",
  )
  const today = todayBerlinString()

  if (token === null || days === undefined) {
    return (
      <section aria-label="Nächste 7 Tage" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48 bg-muted" />
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-16 bg-muted" />
          <Skeleton className="h-16 bg-muted" />
        </div>
      </section>
    )
  }

  const entirelyEmpty = days.every((day) => day.items.length === 0)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Nächste 7 Tage</h1>
      {entirelyEmpty ? (
        <p className="text-muted-foreground">Nichts geplant.</p>
      ) : (
        days.map((day) => (
          <section
            key={day.date}
            aria-labelledby={`upcoming-${day.date}`}
            className="flex flex-col gap-2"
          >
            <h2 id={`upcoming-${day.date}`} className="text-lg font-semibold">
              {formatUpcomingHeader(day.date, today)}
            </h2>
            {day.items.length === 0 ? (
              <p aria-hidden="true" className="text-muted-foreground">
                —
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {day.items.map((item) => (
                  <TaskItem key={item._id} item={item} token={token} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  )
}

import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { TaskItem } from "@/components/task-item"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"

export function AnytimePage() {
  const { token } = useSession()
  const items = useQuery(
    api.taskInstances.listAnytime,
    token ? { token } : "skip",
  )

  if (token === null || items === undefined) {
    return (
      <section aria-label="Anytime" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32 bg-muted" />
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-16 bg-muted" />
          <Skeleton className="h-16 bg-muted" />
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Anytime</h1>
        <p className="text-muted-foreground">Ohne festes Datum</p>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">
          Keine offenen Aufgaben ohne Datum.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <TaskItem key={item._id} item={item} token={token} />
          ))}
        </ul>
      )}
    </section>
  )
}

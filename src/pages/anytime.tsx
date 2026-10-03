import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { ListGroup } from "@/components/list"
import { PageHeader } from "@/components/page-header"
import { TaskItem } from "@/components/task-item"
import { TaskListSwitcher } from "@/components/task-list-switcher"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"

export function AnytimePage() {
  const { token, user } = useSession()
  const items = useQuery(
    api.taskInstances.listAnytime,
    token ? { token } : "skip",
  )
  const isParent = user?.role === "parent"

  if (token === null || items === undefined) {
    return (
      <section aria-label="Irgendwann" className="flex flex-col gap-5">
        <Skeleton className="h-10 w-40 bg-muted" />
        <Skeleton className="h-32 rounded-2xl bg-muted" aria-hidden="true" />
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Irgendwann" subtitle="Aufgaben ohne festes Datum">
        <TaskListSwitcher />
      </PageHeader>
      {items.length === 0 ? (
        <p className="rounded-3xl bg-card px-6 py-10 text-center text-muted-foreground shadow-[0_0_0_1px_var(--border)]">
          Keine offenen Aufgaben ohne Datum.
        </p>
      ) : (
        <ListGroup>
          {items.map((item) => (
            <TaskItem
              key={item._id}
              item={item}
              token={token}
              showAssignee={isParent || item.assigneeId === undefined}
            />
          ))}
        </ListGroup>
      )}
    </div>
  )
}

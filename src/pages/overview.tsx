import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Avatar } from "@/components/avatar"
import { BriefingCard } from "@/components/briefing-card"
import { ChildDayCard } from "@/components/child-day-card"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import { formatLongDay, todayBerlinString } from "@/lib/tasks"

function LoadingState() {
  return (
    <section aria-label="Übersicht" className="flex flex-col gap-5">
      <Skeleton className="h-10 w-44 bg-muted" />
      <Skeleton className="h-40 rounded-3xl bg-muted" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Skeleton className="h-80 rounded-3xl bg-muted" />
        <Skeleton className="h-80 rounded-3xl bg-muted" />
      </div>
    </section>
  )
}

export function OverviewPage() {
  const { token, user } = useSession()
  const children = useQuery(api.overview.children, token ? { token } : "skip")
  const isParent = user?.role === "parent"

  // Track the current time so the stale check and day labels stay fresh while
  // the page remains open. Date.now() must not be called during render (purity),
  // so it is initialized lazily and refreshed on an interval.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (token === null || children === undefined) {
    return <LoadingState />
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Übersicht"
        subtitle={formatLongDay(todayBerlinString(new Date(now)))}
      />

      {isParent ? <BriefingCard token={token} now={now} /> : null}

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        {children.map((child) =>
          child.snapshot === null ? (
            <section
              key={child.slug}
              className="flex items-center gap-3 rounded-3xl bg-card p-5 shadow-[0_0_0_1px_var(--border)]"
            >
              <Avatar emoji={child.emoji} color={child.color} size="md" />
              <div>
                <h2 className="font-semibold">{child.name}</h2>
                <p className="text-sm text-muted-foreground">
                  Noch keine Daten vom Wand-Dashboard.
                </p>
              </div>
            </section>
          ) : (
            <ChildDayCard
              key={child.slug}
              name={child.name}
              color={child.color}
              emoji={child.emoji}
              snapshot={child.snapshot}
              now={now}
            />
          ),
        )}
      </div>
    </div>
  )
}

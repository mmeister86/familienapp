import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { BriefingCard } from "@/components/briefing-card"
import { ChildDayCard } from "@/components/child-day-card"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"

function LoadingState() {
  return (
    <section aria-label="Übersicht" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40 bg-muted" />
      <Skeleton className="h-32 bg-muted" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-64 bg-muted" />
        <Skeleton className="h-64 bg-muted" />
      </div>
    </section>
  )
}

export function OverviewPage() {
  const { token, user } = useSession()
  const children = useQuery(api.overview.children, token ? { token } : "skip")
  const briefing = useQuery(
    api.overview.latestBriefing,
    token && user?.role === "parent" ? { token } : "skip",
  )

  // Capture the render time once (lazy initializer) so the stale check has a
  // stable reference; Date.now() must not be called during render (purity).
  const [now] = useState(() => Date.now())

  if (token === null || children === undefined) {
    return <LoadingState />
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>

      {briefing ? <BriefingCard briefing={briefing} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {children.map((child) =>
          child.snapshot === null ? (
            <section
              key={child.slug}
              className="rounded-xl border bg-card p-4 text-sm text-muted-foreground"
            >
              <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
                <span aria-hidden="true">{child.emoji}</span>
                <span style={{ color: child.color }}>{child.name}</span>
              </h2>
              Noch keine Daten vom Dashboard.
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

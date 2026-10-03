import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Avatar } from "@/components/avatar"
import { ChildDayCard } from "@/components/child-day-card"
import { ListGroup } from "@/components/list"
import { PageHeader } from "@/components/page-header"
import { PointsHero } from "@/components/points"
import { TaskItem } from "@/components/task-item"
import { TaskListSwitcher } from "@/components/task-list-switcher"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import {
  formatLongDay,
  todayBerlinString,
  type TaskInstanceItem,
} from "@/lib/tasks"

type PersonGroup = {
  key: string
  emoji: string | null
  color: string | null
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
        color: item.assigneeColor ?? null,
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

function openCount(items: TaskInstanceItem[]): number {
  return items.filter((item) => item.status === "open").length
}

function progressLabel(items: TaskInstanceItem[]): string | null {
  if (items.length === 0) {
    return null
  }
  const done = items.filter((item) => item.status !== "open").length
  return `${String(done)} von ${String(items.length)} erledigt`
}

function LoadingState() {
  return (
    <section aria-label="Heute" className="flex flex-col gap-5">
      <Skeleton className="h-10 w-36 bg-muted" />
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-40 rounded-2xl bg-muted" />
        <Skeleton className="h-28 rounded-2xl bg-muted" />
      </div>
    </section>
  )
}

function GroupTitle({ group }: { group: PersonGroup }) {
  return (
    <span className="flex items-center gap-2">
      <Avatar emoji={group.emoji} color={group.color} size="sm" />
      {group.name}
    </span>
  )
}

function OpenBadge({ count }: { count: number }) {
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">Fertig ✓</span>
  }
  return (
    <span className="text-sm text-muted-foreground tabular-nums">
      {count} offen
    </span>
  )
}

export function TodayPage() {
  const { token, user } = useSession()
  const data = useQuery(api.taskInstances.listToday, token ? { token } : "skip")
  const isParent = user?.role === "parent"
  const isChild = user?.role === "child"
  const balance = useQuery(
    api.points.getBalance,
    token && isChild ? { token } : "skip",
  )
  const overview = useQuery(
    api.overview.children,
    token && isChild ? { token } : "skip",
  )
  const ownSnapshot = overview?.[0]?.snapshot ?? null

  // Track the current time so the card's stale check and day labels stay fresh
  // while the page remains open. Date.now() must not be called during render
  // (purity), so it is initialized lazily and refreshed on an interval. Mirrors
  // the Overview page's tracking.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const todayGroups = useMemo(
    () => (data === undefined ? [] : groupByPerson(data.today)),
    [data],
  )

  if (token === null || data === undefined) {
    return <LoadingState />
  }

  const progress = progressLabel(data.today)
  const dateLabel = formatLongDay(todayBerlinString(new Date(now)))
  const nothingOpen = data.overdue.length === 0 && openCount(data.today) === 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Heute"
        subtitle={progress === null ? dateLabel : `${dateLabel} – ${progress}`}
      >
        <TaskListSwitcher />
      </PageHeader>

      {isChild ? <PointsHero balance={balance?.balance} to="/points" /> : null}

      {ownSnapshot !== null ? (
        <ChildDayCard
          name={user?.name ?? ""}
          color={user?.color ?? ""}
          emoji={user?.emoji ?? ""}
          snapshot={ownSnapshot}
          now={now}
        />
      ) : null}

      {nothingOpen ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-card px-6 py-10 text-center shadow-[0_0_0_1px_var(--border)]">
          <span aria-hidden="true" className="text-5xl">
            🎉
          </span>
          <p className="text-lg font-semibold">Alles erledigt für heute</p>
          <p className="text-sm text-muted-foreground">
            Schau in{" "}
            <Link
              to="/upcoming"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Demnächst
            </Link>
            , was als Nächstes ansteht.
          </p>
        </div>
      ) : null}

      {data.overdue.length > 0 ? (
        <ListGroup
          title={<span className="text-destructive">Überfällig</span>}
          titleId="today-overdue"
          trailing={
            <span className="text-sm text-destructive tabular-nums">
              {data.overdue.length}
            </span>
          }
        >
          {data.overdue.map((item) => (
            <TaskItem
              key={item._id}
              item={item}
              token={token}
              overdue
              showAssignee={isParent || item.assigneeId === undefined}
            />
          ))}
        </ListGroup>
      ) : null}

      {data.today.length === 0 ? (
        nothingOpen ? null : (
          <p className="px-1 text-muted-foreground">
            Für heute ist nichts geplant.
          </p>
        )
      ) : isParent ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {todayGroups.map((group) => (
            <ListGroup
              key={group.key}
              title={<GroupTitle group={group} />}
              titleId={`today-${group.key}`}
              trailing={<OpenBadge count={openCount(group.items)} />}
            >
              {group.items.map((item) => (
                <TaskItem
                  key={item._id}
                  item={item}
                  token={token}
                  showAssignee={false}
                />
              ))}
            </ListGroup>
          ))}
        </div>
      ) : (
        <ListGroup
          title="Meine Aufgaben"
          titleId="today-mine"
          trailing={<OpenBadge count={openCount(data.today)} />}
        >
          {data.today.map((item) => (
            <TaskItem
              key={item._id}
              item={item}
              token={token}
              showAssignee={item.assigneeId === undefined}
            />
          ))}
        </ListGroup>
      )}
    </div>
  )
}

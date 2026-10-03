import { useState } from "react"
import type { ReactNode } from "react"
import { cn } from "cn"
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Info,
  NotebookPen,
  TriangleAlert,
  UtensilsCrossed,
} from "lucide-react"
import type { ChildDay, Exam, Homework } from "../../convex/lib/validators"
import { todayBerlin } from "../../convex/lib/dates"
import { Avatar } from "@/components/avatar"
import {
  changeLabel,
  daySwitchLabel,
  formatBerlinTime,
  formatEventTime,
  isStale,
  isWithinDays,
} from "@/lib/dashboard"

export type ChildSnapshotView = {
  days: ChildDay[]
  homework: Homework[]
  exams: Exam[]
  sourceUpdatedAt: number
  receivedAt: number
}

const HOMEWORK_WINDOW_DAYS = 7
const EXAM_WINDOW_DAYS = 7

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function TimetableList({ day }: { day: ChildDay }) {
  if (day.timetable.length === 0) {
    return <EmptyLine>Kein Unterricht.</EmptyLine>
  }
  return (
    <ul className="flex flex-col">
      {day.timetable.map((lesson, index) => {
        const cancelled = lesson.change?.type === "cancelled"
        return (
          <li
            key={index}
            className="grid grid-cols-[3.25rem_1fr_auto] items-baseline gap-x-3 py-1.5 text-[0.9375rem] [&+&]:border-t [&+&]:border-border/70"
          >
            <span className="text-sm text-muted-foreground tabular-nums">
              {lesson.start ?? ""}
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "font-medium",
                  cancelled && "text-muted-foreground line-through",
                )}
              >
                {lesson.subject}
              </span>
              {lesson.change ? (
                <span
                  className={cn(
                    "text-[0.8125rem] font-medium",
                    cancelled ? "text-destructive" : "text-warning",
                  )}
                >
                  {changeLabel(lesson.change.type)}
                  {lesson.change.note ? `: ${lesson.change.note}` : ""}
                </span>
              ) : null}
            </span>
            <span className="text-sm text-muted-foreground">
              {lesson.room ?? ""}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function EventsList({ day }: { day: ChildDay }) {
  if (day.events.length === 0) {
    return <EmptyLine>Keine Termine.</EmptyLine>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {day.events.map((event, index) => (
        <li
          key={index}
          className="grid grid-cols-[3.25rem_1fr] items-baseline gap-x-3 text-[0.9375rem]"
        >
          <span className="text-sm text-muted-foreground tabular-nums">
            {event.allDay ? "ganzt." : formatEventTime(event.start, false)}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{event.title}</span>
            {event.location ? (
              <span className="text-muted-foreground"> · {event.location}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground [&_svg]:size-4">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

/** "fällig heute" / "fällig morgen" / "fällig Mo 05.10." */
function dueLabel(date: string, today: string): string {
  const label = daySwitchLabel(date, today)
  return label === "Heute" || label === "Morgen" ? label.toLowerCase() : label
}

export function ChildDayCard({
  name,
  color,
  emoji,
  snapshot,
  now,
}: {
  name: string
  color: string
  emoji: string
  snapshot: ChildSnapshotView
  now: number
}) {
  const [dayIndex, setDayIndex] = useState(0)

  if (snapshot.days.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-3xl bg-card p-5 shadow-[0_0_0_1px_var(--border)]">
        <Avatar emoji={emoji} color={color} size="md" />
        <div>
          <h2 className="font-semibold">{name}</h2>
          <p className="text-sm text-muted-foreground">
            Noch keine Tagesdaten.
          </p>
        </div>
      </section>
    )
  }

  const today = todayBerlin(now)
  const day = snapshot.days[Math.min(dayIndex, snapshot.days.length - 1)]
  const homework = snapshot.homework.filter((item) =>
    isWithinDays(item.dueDate, today, HOMEWORK_WINDOW_DAYS),
  )
  const exams = snapshot.exams.filter((item) =>
    isWithinDays(item.date, today, EXAM_WINDOW_DAYS),
  )
  const stale = isStale(snapshot.sourceUpdatedAt, now)

  return (
    <section
      aria-label={`Tag von ${name}`}
      className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-3xl bg-card p-5 shadow-[0_0_0_1px_var(--border)]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <Avatar emoji={emoji} color={color} size="md" />
          {name}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          Stand {formatBerlinTime(snapshot.sourceUpdatedAt)}
        </span>
      </div>

      {stale ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          Daten sind älter als 2 Stunden. Läuft das Wand-Dashboard?
        </p>
      ) : null}

      <div
        role="group"
        aria-label="Tag wählen"
        className="no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-1.5 overflow-x-auto px-5 lg:flex-wrap lg:overflow-visible"
      >
        {snapshot.days.map((entry, index) => {
          const active = index === dayIndex
          return (
            <button
              key={entry.date}
              type="button"
              aria-pressed={active}
              onClick={() => setDayIndex(index)}
              className={cn(
                "pressable h-9 shrink-0 snap-start rounded-full px-3.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground md:hover:text-foreground",
              )}
            >
              {daySwitchLabel(entry.date, today)}
            </button>
          )
        })}
      </div>

      {day.notices && day.notices.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {day.notices.map((notice, index) => (
            <li
              key={index}
              className="flex items-start gap-2 rounded-xl bg-accent px-3 py-2 text-sm"
            >
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {notice}
            </li>
          ))}
        </ul>
      ) : null}

      <Section title="Stundenplan" icon={<BookOpen />}>
        <TimetableList day={day} />
      </Section>

      <Section title="Termine" icon={<CalendarDays />}>
        <EventsList day={day} />
      </Section>

      <Section title="Essen" icon={<UtensilsCrossed />}>
        {day.meal === undefined ? (
          <EmptyLine>Kein Essen.</EmptyLine>
        ) : day.meal.ordered ? (
          <p className="text-[0.9375rem]">
            <span className="font-medium">{day.meal.title ?? "Bestellt"}</span>
            {day.meal.description ? (
              <span className="text-muted-foreground">
                {" "}
                {day.meal.description}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm font-medium text-warning">Nichts bestellt.</p>
        )}
      </Section>

      <Section title="Hausaufgaben" icon={<NotebookPen />}>
        {homework.length === 0 ? (
          <EmptyLine>Nichts fällig.</EmptyLine>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {homework.map((item, index) => (
              <li key={index} className="text-[0.9375rem]">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{item.subject}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    fällig {dueLabel(item.dueDate, today)}
                  </span>
                </span>
                <span className="text-muted-foreground">{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Arbeiten" icon={<GraduationCap />}>
        {exams.length === 0 ? (
          <EmptyLine>Keine Arbeiten in den nächsten 7 Tagen.</EmptyLine>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {exams.map((exam, index) => (
              <li
                key={index}
                className="flex items-baseline justify-between gap-2 text-[0.9375rem]"
              >
                <span>
                  <span className="font-medium">{exam.subject}</span>
                  {exam.text ? (
                    <span className="text-muted-foreground"> {exam.text}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-medium text-destructive">
                  {daySwitchLabel(exam.date, today)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </section>
  )
}

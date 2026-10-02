import { useState } from "react"
import type { ReactNode } from "react"
import type { ChildDay, Exam, Homework } from "../../convex/lib/validators"
import { todayBerlin } from "../../convex/lib/dates"
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

function TimetableList({ day }: { day: ChildDay }) {
  if (day.timetable.length === 0) {
    return <p className="text-sm text-muted-foreground">Kein Unterricht.</p>
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {day.timetable.map((lesson, index) => {
        const cancelled = lesson.change?.type === "cancelled"
        return (
          <li key={index} className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular-nums text-muted-foreground">
              {lesson.start ? `${lesson.start}–${lesson.end ?? ""}` : ""}
            </span>
            <span className={cancelled ? "line-through" : undefined}>
              {lesson.subject}
            </span>
            {lesson.room ? (
              <span className="text-muted-foreground">{lesson.room}</span>
            ) : null}
            {lesson.change ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                {changeLabel(lesson.change.type)}
                {lesson.change.note ? `: ${lesson.change.note}` : ""}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function EventsList({ day }: { day: ChildDay }) {
  if (day.events.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Termine.</p>
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {day.events.map((event, index) => (
        <li key={index} className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular-nums text-muted-foreground">
            {formatEventTime(event.start, event.allDay)}
          </span>
          <span>{event.title}</span>
          {event.location ? (
            <span className="text-muted-foreground">{event.location}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
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
      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden="true">{emoji}</span>
          <span style={{ color }}>{name}</span>
        </h2>
        <p className="mt-2">Noch keine Tagesdaten.</p>
      </section>
    )
  }

  const today = todayBerlin(now)
  const day =
    snapshot.days[Math.min(dayIndex, snapshot.days.length - 1)]
  const homework = snapshot.homework.filter((item) =>
    isWithinDays(item.dueDate, today, HOMEWORK_WINDOW_DAYS),
  )
  const exams = snapshot.exams.filter((item) =>
    isWithinDays(item.date, today, EXAM_WINDOW_DAYS),
  )
  const stale = isStale(snapshot.sourceUpdatedAt, now)

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden="true">{emoji}</span>
          <span style={{ color }}>{name}</span>
        </h2>
        <span className="text-xs text-muted-foreground">
          Stand: {formatBerlinTime(snapshot.sourceUpdatedAt)}
        </span>
      </div>

      {stale ? (
        <p
          role="status"
          className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
        >
          Daten sind älter als 2 Stunden — läuft das Dashboard?
        </p>
      ) : null}

      <div role="group" aria-label="Tag wählen" className="flex flex-wrap gap-1">
        {snapshot.days.map((entry, index) => (
          <button
            key={entry.date}
            type="button"
            aria-pressed={index === dayIndex}
            onClick={() => setDayIndex(index)}
            className={
              index === dayIndex
                ? "rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
            }
          >
            {daySwitchLabel(entry.date, today)}
          </button>
        ))}
      </div>

      {day.notices && day.notices.length > 0 ? (
        <p className="rounded-md bg-muted px-2 py-1 text-xs">
          {day.notices.join(" · ")}
        </p>
      ) : null}

      <Section title="Stundenplan">
        <TimetableList day={day} />
      </Section>

      <Section title="Termine">
        <EventsList day={day} />
      </Section>

      <Section title="Essen">
        {day.meal === undefined ? (
          <p className="text-sm text-muted-foreground">Kein Essen.</p>
        ) : day.meal.ordered ? (
          <p className="text-sm">
            {day.meal.title ?? "Bestellt"}
            {day.meal.description ? ` — ${day.meal.description}` : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Nichts bestellt.</p>
        )}
      </Section>

      <Section title="Hausaufgaben">
        {homework.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nichts fällig.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {homework.map((item, index) => (
              <li key={index}>
                <span className="font-medium">{item.subject}</span>{" "}
                <span className="text-muted-foreground">(bis {item.dueDate})</span>{" "}
                {item.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Arbeiten">
        {exams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine anstehenden Arbeiten.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {exams.map((exam, index) => (
              <li key={index}>
                <span className="font-medium">{exam.subject}</span>{" "}
                <span className="text-muted-foreground">({exam.date})</span>
                {exam.text ? ` ${exam.text}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </section>
  )
}

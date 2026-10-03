import type { FunctionReturnType } from "convex/server"
import type { api } from "../../convex/_generated/api"
import type { Recurrence } from "../../convex/lib/recurrence"

// A single row of the Today/Anytime/Upcoming lists: instance fields plus the
// resolved task title/notes, the public assignee projection, and whether the
// parent task recurs. Visibility is enforced server-side.
export type TaskInstanceItem = FunctionReturnType<
  typeof api.taskInstances.listToday
>["today"][number]

// One row of the parent-only Tasks admin list (task doc + assignee projection).
export type TaskAdminItem = FunctionReturnType<typeof api.tasks.list>[number]

// One row of the parent-only Approvals screen (pending instance, enriched
// like Today items and ordered by completedAt ascending, server-side).
export type TaskPendingItem = FunctionReturnType<
  typeof api.taskInstances.listPending
>[number]

// One entry of the parent-only user directory (assignee picker).
export type DirectoryUser = FunctionReturnType<typeof api.users.list>[number]

export type { Recurrence }

// German recurrence labels (exact strings from the spec).
export const RECURRENCE_LABELS: Record<Recurrence["kind"], string> = {
  none: "Einmalig",
  daily: "Täglich",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
  afterCompletion: "Nach Erledigung",
}

// Monday-first short weekday names, index = isoWeekday - 1.
export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const

// Today's date as YYYY-MM-DD in Europe/Berlin, computed client-side with
// Intl (never toISOString, which is UTC and off by one near midnight).
export function todayBerlinString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

// Calendar-day arithmetic on YYYY-MM-DD strings (UTC-based, like the backend).
export function addDaysString(dateStr: string, n: number): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + n)
  const y = String(date.getUTCFullYear()).padStart(4, "0")
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function dateFromString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  // Local noon/midnight construction: only the calendar day (incl. weekday)
  // matters for formatting, so the machine timezone is irrelevant.
  return new Date(year, month - 1, day)
}

// "Fr, 3. Okt." style German day label.
export function formatShortDay(dateStr: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(dateFromString(dateStr))
}

// "Samstag, 3. Oktober" — page subtitles and day headings.
export function formatLongDay(dateStr: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dateFromString(dateStr))
}

// Day heading for the Upcoming list: a primary label ("Morgen", "Montag")
// plus the calendar date ("5. Oktober").
export function upcomingDayParts(
  dateStr: string,
  todayStr: string,
): { label: string; date: string } {
  const date = dateFromString(dateStr)
  const calendar = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
  }).format(date)
  if (dateStr === addDaysString(todayStr, 1)) {
    return { label: "Morgen", date: calendar }
  }
  if (dateStr === addDaysString(todayStr, 2)) {
    return { label: "Übermorgen", date: calendar }
  }
  return {
    label: new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(date),
    date: calendar,
  }
}

// Upcoming day header: "Morgen · Fr, 3. Okt." for tomorrow, else "Sa, 4. Okt.".
export function formatUpcomingHeader(dateStr: string, todayStr: string): string {
  const label = formatShortDay(dateStr)
  return dateStr === addDaysString(todayStr, 1) ? `Morgen · ${label}` : label
}

const relativeTimeFormatDe = new Intl.RelativeTimeFormat("de", {
  numeric: "auto",
})

// German relative time ("vor 5 Minuten") for a completedAt timestamp.
// Picks the largest sensible unit; future timestamps read "in …". Every unit
// divides the raw second difference directly so chained rounding cannot skew
// the unit boundaries (e.g. 89.5 minutes reads "vor 1 Stunde", not "vor 2
// Stunden").
export function formatRelativeTimeDe(
  timestamp: number,
  now: number = Date.now(),
): string {
  const diffSeconds = Math.round((timestamp - now) / 1000)
  if (Math.abs(diffSeconds) < 60) {
    return relativeTimeFormatDe.format(diffSeconds, "second")
  }
  const minutes = Math.round(diffSeconds / 60)
  if (Math.abs(minutes) < 60) {
    return relativeTimeFormatDe.format(minutes, "minute")
  }
  const hours = Math.round(diffSeconds / 3600)
  if (Math.abs(hours) < 24) {
    return relativeTimeFormatDe.format(hours, "hour")
  }
  const days = Math.round(diffSeconds / 86400)
  if (Math.abs(days) < 7) {
    return relativeTimeFormatDe.format(days, "day")
  }
  const weeks = Math.round(diffSeconds / 604800)
  if (Math.abs(weeks) < 5) {
    return relativeTimeFormatDe.format(weeks, "week")
  }
  const months = Math.round(diffSeconds / 2592000)
  if (Math.abs(months) < 12) {
    return relativeTimeFormatDe.format(months, "month")
  }
  return relativeTimeFormatDe.format(
    Math.round(diffSeconds / 31536000),
    "year",
  )
}

// One-line German detail for a recurrence ("Mo, Mi, Fr", "Monatstag 15",
// "3 Tage nach Erledigung"), or null when the label alone suffices.
export function formatRecurrenceDetail(recurrence: Recurrence): string | null {
  switch (recurrence.kind) {
    case "none":
      return recurrence.dueDate === undefined
        ? null
        : formatShortDay(recurrence.dueDate)
    case "daily":
      return null
    case "weekly":
      return recurrence.days.map((day) => WEEKDAY_SHORT[day - 1]).join(", ")
    case "monthly":
      return `Monatstag ${String(recurrence.dayOfMonth)}`
    case "afterCompletion":
      return recurrence.everyNDays === 1
        ? "1 Tag nach Erledigung"
        : `${String(recurrence.everyNDays)} Tage nach Erledigung`
  }
}

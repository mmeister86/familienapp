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

// Upcoming day header: "Morgen · Fr, 3. Okt." for tomorrow, else "Sa, 4. Okt.".
export function formatUpcomingHeader(dateStr: string, todayStr: string): string {
  const label = formatShortDay(dateStr)
  return dateStr === addDaysString(todayStr, 1) ? `Morgen · ${label}` : label
}

// German relative time ("vor 5 Minuten") for a completedAt timestamp.
// Picks the largest sensible unit; future timestamps read "in …".
export function formatRelativeTimeDe(
  timestamp: number,
  now: number = Date.now(),
): string {
  const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" })
  const diffSeconds = Math.round((timestamp - now) / 1000)
  if (Math.abs(diffSeconds) < 60) {
    return rtf.format(diffSeconds, "second")
  }
  const minutes = Math.round(diffSeconds / 60)
  if (Math.abs(minutes) < 60) {
    return rtf.format(minutes, "minute")
  }
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) {
    return rtf.format(hours, "hour")
  }
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 7) {
    return rtf.format(days, "day")
  }
  const weeks = Math.round(days / 7)
  if (Math.abs(weeks) < 5) {
    return rtf.format(weeks, "week")
  }
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) {
    return rtf.format(months, "month")
  }
  return rtf.format(Math.round(days / 365), "year")
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

// Pure display helpers for the Overview and "Mein Tag" cards.
import type { LessonChange } from "../../convex/lib/validators"
import { addDays, compareDates } from "../../convex/lib/dates"

// A card counts as stale after two hours without a dashboard push (PLAN §7).
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000

export function isStale(sourceUpdatedAt: number, now: number): boolean {
  return now - sourceUpdatedAt > STALE_AFTER_MS
}

export function formatBerlinTime(ms: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms))
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const

// "Heute" / "Morgen" / "So 04.10." for the day switcher and card heading.
export function daySwitchLabel(date: string, today: string): string {
  if (date === today) {
    return "Heute"
  }
  if (date === addDays(today, 1)) {
    return "Morgen"
  }
  // Noon UTC keeps the calendar weekday stable regardless of the machine tz.
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]
  return `${weekday} ${date.slice(8, 10)}.${date.slice(5, 7)}.`
}

export function isWithinDays(
  date: string,
  today: string,
  days: number,
): boolean {
  return (
    compareDates(date, today) >= 0 &&
    compareDates(date, addDays(today, days)) <= 0
  )
}

export function formatEventTime(start: string, allDay: boolean): string {
  if (allDay) {
    return "Ganztägig"
  }
  const ms = Date.parse(start)
  return Number.isNaN(ms) ? "" : formatBerlinTime(ms)
}

export function changeLabel(type: LessonChange["type"]): string {
  switch (type) {
    case "cancelled":
      return "Entfällt"
    case "substitution":
      return "Vertretung"
    case "roomChange":
      return "Raumwechsel"
    case "other":
      return "Änderung"
  }
}

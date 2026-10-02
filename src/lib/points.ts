import type { FunctionReturnType } from "convex/server"
import type { api } from "../../convex/_generated/api"
import { todayBerlinString } from "@/lib/tasks"

// One row of the points history (newest first, server-side).
export type PointTransaction = FunctionReturnType<
  typeof api.points.listHistory
>[number]

// One row of the parent-only per-kid balances list.
export type PointsBalanceEntry = FunctionReturnType<
  typeof api.points.listBalances
>[number]

export const REASON_LABELS: Record<PointTransaction["reason"], string> = {
  task: "Aufgabe",
  manual: "Manuell",
  reward: "Belohnung",
}

// "1 Punkt" vs "N Punkte".
export function formatPointsLabel(balance: number): string {
  return balance === 1 ? "1 Punkt" : `${String(balance)} Punkte`
}

// "+N" for credits, "−N" (proper minus U+2212) for debits.
export function formatDelta(delta: number): string {
  return delta < 0 ? `−${String(Math.abs(delta))}` : `+${String(delta)}`
}

const dayMonthFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "numeric",
  month: "short",
})

const dayMonthYearFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "numeric",
  month: "short",
  year: "numeric",
})

const timeFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
})

function berlinDayString(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp))
}

// German date ("3. Okt.", year added when not the current year) plus the time
// when the transaction is from today ("3. Okt., 14:30").
export function formatTransactionDate(
  createdAt: number,
  now: Date = new Date(),
): string {
  const date = new Date(createdAt)
  const day = berlinDayString(createdAt)
  const today = todayBerlinString(now)
  const base =
    day.slice(0, 4) === today.slice(0, 4)
      ? dayMonthFormat.format(date)
      : dayMonthYearFormat.format(date)
  return day === today ? `${base}, ${timeFormat.format(date)}` : base
}

// Pure calendar policy helpers (no Convex imports; runnable in plain Node).
// Calendar math uses Berlin date strings so 23/25-hour DST days never change
// the day count.

import type { CalendarFreshness, CalendarWindow } from "./calendarTypes";
import {
  CALENDAR_STALENESS_MIN_MS,
  CALENDAR_WINDOW_DAYS,
} from "./calendarTypes";
import { addDays, todayBerlin } from "./dates";

// The 42-day import horizon starting today in Europe/Berlin. Built from
// calendar-day arithmetic (not millisecond offsets), so DST transitions
// inside the window cannot shrink or stretch it.
export function calendarWindow(now: number): CalendarWindow {
  const startDate = todayBerlin(now);
  return { startDate, endDate: addDays(startDate, CALENDAR_WINDOW_DAYS) };
}

// Freshness derives ONLY from the last successful fetch. The last attempt
// time is deliberately not an input: a recent failed attempt must never mask
// a stale data stand. A source counts as stale after three missed successful
// intervals, at the earliest after CALENDAR_STALENESS_MIN_MS.
export function calendarFreshness(
  lastSuccessAt: number | undefined,
  intervalMs: number,
  now: number,
): CalendarFreshness {
  if (lastSuccessAt === undefined) {
    return "neverLoaded";
  }
  const staleAfterMs = Math.max(3 * intervalMs, CALENDAR_STALENESS_MIN_MS);
  return now - lastSuccessAt >= staleAfterMs ? "stale" : "fresh";
}

// Deterministic per-instance identity from ICS UID plus the recurrence
// instance (RECURRENCE-ID or original series timestamp). The key is scoped
// per calendar: the same UID in different calendars stays distinct because
// events are stored per source (see the by_source_occurrence index).
export function occurrenceKey(
  uid: string,
  recurrenceId: string | undefined,
): string {
  return JSON.stringify([uid, recurrenceId ?? null]);
}

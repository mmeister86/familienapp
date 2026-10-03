// Pure calendar policy helpers (no Convex imports; runnable in plain Node).
// Calendar math uses Berlin date strings so 23/25-hour DST days never change
// the day count; millisecond fields are Berlin midnights computed with
// Intl/UTC arithmetic (never host-timezone wall clock).

import type { CalendarFreshness, CalendarWindow } from "./calendarTypes";
import {
  BERLIN_TIMEZONE,
  CALENDAR_STALENESS_MIN_MS,
  CALENDAR_WINDOW_DAYS,
} from "./calendarTypes";
import { addDays, isValidDateString, todayBerlin } from "./dates";

const berlinWallFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BERLIN_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function berlinOffsetMs(utcMs: number): number {
  const parts = Object.fromEntries(
    berlinWallFormat.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return asUtc - utcMs;
}

// Berlin-midnight instant of a YYYY-MM-DD date. Iterates the UTC guess until
// the zone offset stabilizes, so spring-forward/fall-back transitions
// resolve to the true local midnight.
export function berlinMidnightMs(dateStr: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match === null || !isValidDateString(dateStr)) {
    throw new Error(`Invalid Berlin date string: ${dateStr}`);
  }
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  let guess = target;
  for (let step = 0; step < 3; step += 1) {
    const next = target - berlinOffsetMs(guess);
    if (next === guess) {
      return next;
    }
    guess = next;
  }
  return guess;
}

// The 42-day import horizon starting today in Europe/Berlin. Built from
// calendar-day arithmetic (not millisecond offsets), so DST transitions
// inside the window cannot shrink or stretch it; fromMs/toMs are the exact
// Berlin midnights of the boundary dates.
export function calendarWindow(now: number): CalendarWindow {
  const fromDate = todayBerlin(now);
  const toDate = addDays(fromDate, CALENDAR_WINDOW_DAYS);
  return {
    fromDate,
    toDate,
    fromMs: berlinMidnightMs(fromDate),
    toMs: berlinMidnightMs(toDate),
  };
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
// events are stored per source (see the by_source_import_key index).
export function occurrenceKey(
  uid: string,
  recurrenceId: string | undefined,
): string {
  return JSON.stringify([uid, recurrenceId ?? null]);
}

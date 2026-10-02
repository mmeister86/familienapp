// Berlin date helpers (pure; no Convex imports).
// All "day" logic in the Family App runs in Europe/Berlin. Dates are
// "YYYY-MM-DD" strings, timestamps are numbers (ms since the epoch).

import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";

export const BERLIN_TZ = "Europe/Berlin";

// YYYY-MM-DD in Berlin for the given instant (defaults to now).
export function todayBerlin(now: number = Date.now()): string {
  return toBerlinDateString(now);
}

// Any timestamp -> YYYY-MM-DD in Berlin.
export function toBerlinDateString(ms: number): string {
  return format(new TZDate(ms, BERLIN_TZ), "yyyy-MM-dd");
}

type YearMonthDay = {
  year: number;
  month: number;
  day: number;
};

// Split a YYYY-MM-DD string into parts. Returns null unless the string is
// strictly shaped AND denotes a real calendar day.
function parseDateString(dateStr: string): YearMonthDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

// Build a UTC-midnight Date from parts. Uses setUTCFullYear so years 0-99
// are taken literally (Date.UTC would shift them to 1900+year).
// Calendar math runs in UTC so results never depend on the machine timezone.
function toUtcDate(parts: YearMonthDay): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return date;
}

function formatUtcDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Calendar-day arithmetic; n may be negative. Throws on invalid input.
export function addDays(dateStr: string, n: number): string {
  const parts = parseDateString(dateStr);
  if (parts === null || !Number.isInteger(n)) {
    throw new Error(`Invalid addDays input: ${dateStr}, ${String(n)}`);
  }
  const date = toUtcDate(parts);
  date.setUTCDate(date.getUTCDate() + n);
  return formatUtcDate(date);
}

// ISO weekday: 1=Monday … 7=Sunday. Throws on invalid input.
export function isoWeekday(dateStr: string): number {
  const parts = parseDateString(dateStr);
  if (parts === null) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return ((toUtcDate(parts).getUTCDay() + 6) % 7) + 1;
}

// Days in a month (month 1-12). Pure leap-year math, no Date involved.
export function daysInMonth(year: number, month: number): number {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new RangeError(`Invalid year/month: ${String(year)}/${String(month)}`);
  }
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

// Strict YYYY-MM-DD shape plus a real calendar day.
export function isValidDateString(s: string): boolean {
  return parseDateString(s) !== null;
}

// Chronological comparison for YYYY-MM-DD strings: -1 | 0 | 1.
// (Lexicographic order coincides with chronological order for this format.)
export function compareDates(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

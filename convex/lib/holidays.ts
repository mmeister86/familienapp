// Public holidays in Saxony (pure; no Convex imports). Computed here so the
// AI briefing only ever mentions real holidays instead of guessing them.

import { addDays, compareDates } from "./dates";

export type Holiday = { date: string; name: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number): string {
  return `${String(year)}-${pad(month)}-${pad(day)}`;
}

// Easter Sunday (Gregorian), anonymous Gauss/Meeus algorithm.
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

// Buß- und Bettag: the Wednesday before 23 November (16.–22. November).
function repentanceDay(year: number): string {
  for (let day = 22; day >= 16; day -= 1) {
    // Noon UTC keeps the weekday stable in any machine timezone.
    const weekday = new Date(Date.UTC(year, 10, day, 12)).getUTCDay();
    if (weekday === 3) {
      return ymd(year, 11, day);
    }
  }
  return ymd(year, 11, 22);
}

export function saxonHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: ymd(year, 1, 1), name: "Neujahr" },
    { date: addDays(easter, -2), name: "Karfreitag" },
    { date: addDays(easter, 1), name: "Ostermontag" },
    { date: ymd(year, 5, 1), name: "Tag der Arbeit" },
    { date: addDays(easter, 39), name: "Christi Himmelfahrt" },
    { date: addDays(easter, 50), name: "Pfingstmontag" },
    { date: ymd(year, 10, 3), name: "Tag der Deutschen Einheit" },
    { date: ymd(year, 10, 31), name: "Reformationstag" },
    { date: repentanceDay(year), name: "Buß- und Bettag" },
    { date: ymd(year, 12, 25), name: "1. Weihnachtsfeiertag" },
    { date: ymd(year, 12, 26), name: "2. Weihnachtsfeiertag" },
  ];
  return list.sort((x, y) => compareDates(x.date, y.date));
}

// Holidays within [from, to] (inclusive), across a year boundary if needed.
export function holidaysBetween(from: string, to: string): Holiday[] {
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  const result: Holiday[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (const holiday of saxonHolidays(year)) {
      if (
        compareDates(holiday.date, from) >= 0 &&
        compareDates(holiday.date, to) <= 0
      ) {
        result.push(holiday);
      }
    }
  }
  return result;
}

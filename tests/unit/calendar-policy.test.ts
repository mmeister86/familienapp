import { describe, expect, it } from "vitest";
import {
  addDays,
  toBerlinDateString,
  todayBerlin,
} from "../../convex/lib/dates.js";
import {
  CALENDAR_WINDOW_DAYS,
  DEFAULT_CALENDAR_INTERVAL_MS,
} from "../../convex/lib/calendarTypes.js";
import {
  berlinMidnightMs,
  calendarFreshness,
  calendarWindow,
  occurrenceKey,
} from "../../convex/lib/calendarPolicy.js";

// Berlin wall-clock time (HH:MM) of an instant, independent of host TZ.
function berlinWallTime(ms: number): string {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return format.format(new Date(ms));
}

function assertWindowHas42Days(now: number) {
  const window = calendarWindow(now);
  expect(window.fromDate).toBe(todayBerlin(now));
  expect(window.toDate).toBe(addDays(window.fromDate, CALENDAR_WINDOW_DAYS));
  // Millisecond bounds are the exact Berlin midnights of the boundary days.
  expect(window.fromMs).toBe(berlinMidnightMs(window.fromDate));
  expect(window.toMs).toBe(berlinMidnightMs(window.toDate));
  expect(toBerlinDateString(window.fromMs)).toBe(window.fromDate);
  expect(toBerlinDateString(window.toMs)).toBe(window.toDate);
  expect(berlinWallTime(window.fromMs)).toBe("00:00");
  expect(berlinWallTime(window.toMs)).toBe("00:00");
  // Walk the window day by day: exactly 42 distinct Berlin calendar days.
  const seen = new Set<string>();
  let cursor = window.fromDate;
  for (let step = 0; step <= 60; step += 1) {
    if (cursor === window.toDate) {
      break;
    }
    seen.add(cursor);
    cursor = addDays(cursor, 1);
  }
  expect(cursor).toBe(window.toDate);
  expect(seen.size).toBe(42);
}

describe("calendarWindow", () => {
  it("windowHas42BerlinDaysAcrossDST (spring forward, 2026-03-29)", () => {
    // Midday in Berlin on the transition day (CET, UTC+1).
    assertWindowHas42Days(Date.UTC(2026, 2, 29, 11, 0));
  });

  it("windowHas42BerlinDaysAcrossDST (fall back, 2026-10-25)", () => {
    // Midday in Berlin on the transition day (CEST, UTC+2).
    assertWindowHas42Days(Date.UTC(2026, 9, 25, 10, 0));
  });
});

describe("calendarFreshness", () => {
  it("freshnessDoesNotUseAttemptTime (only the last success counts)", () => {
    const now = Date.UTC(2026, 0, 15, 12, 0);
    // Fresh one default interval after the last success.
    expect(
      calendarFreshness(
        now - DEFAULT_CALENDAR_INTERVAL_MS,
        DEFAULT_CALENDAR_INTERVAL_MS,
        now,
      ),
    ).toBe("fresh");
    // Stale 900000 ms (three default intervals) after the last success.
    // There is no attempt-time input on purpose: a recent failed attempt
    // must never mask a stale data stand.
    expect(
      calendarFreshness(now - 900000, DEFAULT_CALENDAR_INTERVAL_MS, now),
    ).toBe("stale");
  });

  it("reports neverLoaded before the first success", () => {
    expect(
      calendarFreshness(
        undefined,
        DEFAULT_CALENDAR_INTERVAL_MS,
        Date.UTC(2026, 0, 15, 12, 0),
      ),
    ).toBe("neverLoaded");
  });
});

describe("occurrenceKey", () => {
  it("is deterministic and separates recurrence instances", () => {
    expect(occurrenceKey("uid-1", undefined)).toBe(
      occurrenceKey("uid-1", undefined),
    );
    expect(occurrenceKey("uid-1", undefined)).not.toBe(
      occurrenceKey("uid-1", "20260101T100000Z"),
    );
  });
});

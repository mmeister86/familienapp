import { describe, expect, it } from "vitest";
import { addDays, todayBerlin } from "../../convex/lib/dates.js";
import {
  CALENDAR_WINDOW_DAYS,
  DEFAULT_CALENDAR_INTERVAL_MS,
} from "../../convex/lib/calendarTypes.js";
import {
  calendarFreshness,
  calendarWindow,
  occurrenceKey,
} from "../../convex/lib/calendarPolicy.js";

function assertWindowHas42Days(now: number) {
  const window = calendarWindow(now);
  expect(window.startDate).toBe(todayBerlin(now));
  expect(window.endDate).toBe(addDays(window.startDate, CALENDAR_WINDOW_DAYS));
  // Walk the window day by day: exactly 42 distinct Berlin calendar days.
  const seen = new Set<string>();
  let cursor = window.startDate;
  for (let step = 0; step <= 60; step += 1) {
    if (cursor === window.endDate) {
      break;
    }
    seen.add(cursor);
    cursor = addDays(cursor, 1);
  }
  expect(cursor).toBe(window.endDate);
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

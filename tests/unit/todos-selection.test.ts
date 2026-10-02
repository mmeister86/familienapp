import { describe, expect, it } from "vitest";
import {
  isDoneToday,
  isOverdueForToday,
  isUndatedActive,
  windowDates,
} from "../../convex/lib/todos.js";

const TODAY = "2026-10-02";

describe("windowDates", () => {
  it("includes today but excludes today+days", () => {
    expect(windowDates(TODAY, 1)).toEqual([TODAY]);
    expect(windowDates(TODAY, 2)).toEqual(["2026-10-02", "2026-10-03"]);
    expect(windowDates(TODAY, 2)).not.toContain("2026-10-04");
  });

  it("spans the full 1..7 range with the boundary day last", () => {
    const week = windowDates(TODAY, 7);
    expect(week).toHaveLength(7);
    expect(week[0]).toBe(TODAY);
    expect(week[6]).toBe("2026-10-08");
    expect(week).not.toContain("2026-10-09");
  });

  it("crosses month and year boundaries", () => {
    expect(windowDates("2026-10-31", 2)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(windowDates("2025-12-31", 2)).toEqual(["2025-12-31", "2026-01-01"]);
  });
});

describe("isOverdueForToday", () => {
  it("includes a past-dated open one-off", () => {
    expect(
      isOverdueForToday(
        { date: "2026-10-01", status: "open", recurrenceKind: "none" },
        TODAY,
      ),
    ).toBe(true);
  });

  it("includes a past-dated pending afterCompletion instance", () => {
    expect(
      isOverdueForToday(
        {
          date: "2026-09-30",
          status: "pending",
          recurrenceKind: "afterCompletion",
        },
        TODAY,
      ),
    ).toBe(true);
  });

  it("excludes rolling recurrences (daily/weekly/monthly)", () => {
    for (const recurrenceKind of ["daily", "weekly", "monthly"] as const) {
      expect(
        isOverdueForToday(
          { date: "2026-10-01", status: "open", recurrenceKind },
          TODAY,
        ),
      ).toBe(false);
    }
  });

  it("excludes today and future dates", () => {
    expect(
      isOverdueForToday(
        { date: TODAY, status: "open", recurrenceKind: "none" },
        TODAY,
      ),
    ).toBe(false);
    expect(
      isOverdueForToday(
        { date: "2026-10-03", status: "open", recurrenceKind: "none" },
        TODAY,
      ),
    ).toBe(false);
  });

  it("excludes undated, done and missed instances", () => {
    expect(
      isOverdueForToday({ status: "open", recurrenceKind: "none" }, TODAY),
    ).toBe(false);
    for (const status of ["done", "missed"] as const) {
      expect(
        isOverdueForToday(
          { date: "2026-10-01", status, recurrenceKind: "none" },
          TODAY,
        ),
      ).toBe(false);
    }
  });
});

describe("isDoneToday", () => {
  it("includes a done instance completed during the Berlin day", () => {
    // 2026-10-02 12:00 Berlin (CEST, UTC+2) = 10:00 UTC.
    const noon = Date.parse("2026-10-02T10:00:00Z");
    expect(isDoneToday({ status: "done", completedAt: noon }, TODAY)).toBe(true);
  });

  it("uses the Berlin day across the UTC date line", () => {
    // 2026-10-01 23:30 UTC = 2026-10-02 01:30 Berlin.
    const lateUtc = Date.parse("2026-10-01T23:30:00Z");
    expect(isDoneToday({ status: "done", completedAt: lateUtc }, TODAY)).toBe(
      true,
    );
    // 2026-10-02 22:30 UTC = 2026-10-03 00:30 Berlin.
    const afterBerlinMidnight = Date.parse("2026-10-02T22:30:00Z");
    expect(
      isDoneToday({ status: "done", completedAt: afterBerlinMidnight }, TODAY),
    ).toBe(false);
  });

  it("excludes another Berlin day, non-done status and missing completedAt", () => {
    const yesterday = Date.parse("2026-10-01T10:00:00Z");
    expect(
      isDoneToday({ status: "done", completedAt: yesterday }, TODAY),
    ).toBe(false);
    expect(
      isDoneToday(
        { status: "open", completedAt: Date.parse("2026-10-02T10:00:00Z") },
        TODAY,
      ),
    ).toBe(false);
    expect(isDoneToday({ status: "done" }, TODAY)).toBe(false);
  });
});

describe("isUndatedActive", () => {
  it("includes undated open and pending instances", () => {
    expect(isUndatedActive({ status: "open" })).toBe(true);
    expect(isUndatedActive({ status: "pending" })).toBe(true);
  });

  it("excludes dated, done and missed instances", () => {
    expect(isUndatedActive({ date: TODAY, status: "open" })).toBe(false);
    expect(isUndatedActive({ status: "done" })).toBe(false);
    expect(isUndatedActive({ status: "missed" })).toBe(false);
  });
});

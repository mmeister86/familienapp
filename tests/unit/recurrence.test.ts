import { describe, expect, it } from "vitest";
import {
  datesNeedingInstances,
  matchesRecurrence,
  type Recurrence,
} from "../../convex/lib/recurrence.js";

describe("matchesRecurrence", () => {
  it("never matches one-offs (kind none)", () => {
    const r: Recurrence = { kind: "none" };
    expect(matchesRecurrence(r, "2026-01-01", "2026-10-02")).toBe(false);
    const withDue: Recurrence = { kind: "none", dueDate: "2026-10-02" };
    expect(matchesRecurrence(withDue, "2026-01-01", "2026-10-02")).toBe(false);
  });

  it("never matches afterCompletion (created on completion, not by scan)", () => {
    const r: Recurrence = { kind: "afterCompletion", everyNDays: 3 };
    expect(matchesRecurrence(r, "2026-01-01", "2026-10-02")).toBe(false);
  });

  it("matches every date on/after startDate for daily", () => {
    const r: Recurrence = { kind: "daily" };
    expect(matchesRecurrence(r, "2026-09-28", "2026-09-28")).toBe(true);
    expect(matchesRecurrence(r, "2026-09-28", "2026-10-02")).toBe(true);
    expect(matchesRecurrence(r, "2026-09-28", "2026-09-27")).toBe(false);
  });

  it("matches only listed weekdays on/after startDate for weekly", () => {
    // Mon/Wed/Fri, starting Monday 2026-09-28.
    const r: Recurrence = { kind: "weekly", days: [1, 3, 5] };
    expect(matchesRecurrence(r, "2026-09-28", "2026-09-28")).toBe(true); // Mon
    expect(matchesRecurrence(r, "2026-09-28", "2026-09-29")).toBe(false); // Tue
    expect(matchesRecurrence(r, "2026-09-28", "2026-09-30")).toBe(true); // Wed
    expect(matchesRecurrence(r, "2026-09-28", "2026-10-01")).toBe(false); // Thu
    expect(matchesRecurrence(r, "2026-09-28", "2026-10-02")).toBe(true); // Fri
    expect(matchesRecurrence(r, "2026-09-28", "2026-10-03")).toBe(false); // Sat
    expect(matchesRecurrence(r, "2026-09-28", "2026-10-04")).toBe(false); // Sun
    // Listed weekday but before the start date -> no match.
    expect(matchesRecurrence(r, "2026-09-28", "2026-09-25")).toBe(false); // Fri
  });

  it("clamps dayOfMonth to the last day of short months", () => {
    const r: Recurrence = { kind: "monthly", dayOfMonth: 31 };
    expect(matchesRecurrence(r, "2026-01-01", "2026-01-31")).toBe(true);
    // February 2026 has 28 days -> occurrence falls on the 28th.
    expect(matchesRecurrence(r, "2026-01-01", "2026-02-28")).toBe(true);
    expect(matchesRecurrence(r, "2026-01-01", "2026-02-27")).toBe(false);
    // April has 30 days -> occurrence falls on the 30th.
    expect(matchesRecurrence(r, "2026-01-01", "2026-04-30")).toBe(true);
    expect(matchesRecurrence(r, "2026-01-01", "2026-04-29")).toBe(false);
    // Before the start date -> no match.
    expect(matchesRecurrence(r, "2026-03-01", "2026-01-31")).toBe(false);
  });

  it("handles leap-day monthlies (Feb 29)", () => {
    const r: Recurrence = { kind: "monthly", dayOfMonth: 29 };
    expect(matchesRecurrence(r, "2024-01-01", "2024-02-29")).toBe(true);
    expect(matchesRecurrence(r, "2024-01-01", "2024-02-28")).toBe(false);
    // Non-leap February clamps to the 28th.
    expect(matchesRecurrence(r, "2024-01-01", "2025-02-28")).toBe(true);
    expect(matchesRecurrence(r, "2024-01-01", "2025-02-27")).toBe(false);
  });
});

describe("datesNeedingInstances", () => {
  it("returns [] for none and afterCompletion", () => {
    expect(
      datesNeedingInstances(
        { kind: "none" },
        "2026-01-01",
        undefined,
        "2026-10-01",
        "2026-10-10",
      ),
    ).toEqual([]);
    expect(
      datesNeedingInstances(
        { kind: "afterCompletion", everyNDays: 3 },
        "2026-01-01",
        undefined,
        "2026-10-01",
        "2026-10-10",
      ),
    ).toEqual([]);
  });

  it("lists every day in the window for daily", () => {
    expect(
      datesNeedingInstances(
        { kind: "daily" },
        "2026-09-28",
        undefined,
        "2026-09-28",
        "2026-10-02",
      ),
    ).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("clips the window to startDate", () => {
    expect(
      datesNeedingInstances(
        { kind: "daily" },
        "2026-10-02",
        undefined,
        "2026-09-28",
        "2026-10-03",
      ),
    ).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("respects endDate", () => {
    expect(
      datesNeedingInstances(
        { kind: "daily" },
        "2026-10-01",
        "2026-10-03",
        "2026-10-01",
        "2026-10-10",
      ),
    ).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("returns [] for empty or inverted ranges", () => {
    // Window inverted.
    expect(
      datesNeedingInstances(
        { kind: "daily" },
        "2026-01-01",
        undefined,
        "2026-10-10",
        "2026-10-01",
      ),
    ).toEqual([]);
    // endDate before startDate.
    expect(
      datesNeedingInstances(
        { kind: "daily" },
        "2026-10-05",
        "2026-10-01",
        "2026-10-01",
        "2026-10-10",
      ),
    ).toEqual([]);
    // Window fully before startDate.
    expect(
      datesNeedingInstances(
        { kind: "daily" },
        "2026-10-05",
        undefined,
        "2026-10-01",
        "2026-10-04",
      ),
    ).toEqual([]);
  });

  it("lists weekly occurrences across weeks (sorted, deduped)", () => {
    expect(
      datesNeedingInstances(
        { kind: "weekly", days: [1, 3, 5] },
        "2026-09-28",
        undefined,
        "2026-09-28",
        "2026-10-11",
      ),
    ).toEqual([
      "2026-09-28",
      "2026-09-30",
      "2026-10-02",
      "2026-10-05",
      "2026-10-07",
      "2026-10-09",
    ]);
  });

  it("applies the startDate cutoff for weekly starting mid-week", () => {
    expect(
      datesNeedingInstances(
        { kind: "weekly", days: [1, 3, 5] },
        "2026-09-30",
        undefined,
        "2026-09-28",
        "2026-10-02",
      ),
    ).toEqual(["2026-09-30", "2026-10-02"]);
  });

  it("lists clamped monthly occurrences across months", () => {
    expect(
      datesNeedingInstances(
        { kind: "monthly", dayOfMonth: 31 },
        "2026-01-31",
        undefined,
        "2026-01-01",
        "2026-04-30",
      ),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("lists a day-29 monthly across leap and non-leap Februaries", () => {
    expect(
      datesNeedingInstances(
        { kind: "monthly", dayOfMonth: 29 },
        "2024-02-01",
        "2025-03-01",
        "2024-02-01",
        "2025-03-01",
      ),
    ).toEqual([
      "2024-02-29", // leap February: exact hit
      "2024-03-29",
      "2024-04-29",
      "2024-05-29",
      "2024-06-29",
      "2024-07-29",
      "2024-08-29",
      "2024-09-29",
      "2024-10-29",
      "2024-11-29",
      "2024-12-29",
      "2025-01-29",
      "2025-02-28", // non-leap February: clamped
    ]);
  });
});

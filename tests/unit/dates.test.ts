import { describe, expect, it } from "vitest";
import {
  BERLIN_TZ,
  addDays,
  berlinHour,
  compareDates,
  daysInMonth,
  isValidDateString,
  isoWeekday,
  toBerlinDateString,
  todayBerlin,
} from "../../convex/lib/dates.js";

describe("BERLIN_TZ", () => {
  it("is Europe/Berlin", () => {
    expect(BERLIN_TZ).toBe("Europe/Berlin");
  });
});

describe("toBerlinDateString", () => {
  it("maps winter midnight edges (CET, UTC+1)", () => {
    // 2026-01-15 23:59 in Berlin = 22:59 UTC.
    expect(toBerlinDateString(Date.UTC(2026, 0, 15, 22, 59))).toBe("2026-01-15");
    // 2026-01-16 00:01 in Berlin = 23:01 UTC (previous day).
    expect(toBerlinDateString(Date.UTC(2026, 0, 15, 23, 1))).toBe("2026-01-16");
  });

  it("maps summer midnight edges (CEST, UTC+2)", () => {
    // 2026-07-15 23:59 in Berlin = 21:59 UTC.
    expect(toBerlinDateString(Date.UTC(2026, 6, 15, 21, 59))).toBe("2026-07-15");
    // 2026-07-16 00:01 in Berlin = 22:01 UTC (previous day).
    expect(toBerlinDateString(Date.UTC(2026, 6, 15, 22, 1))).toBe("2026-07-16");
  });

  it("handles the spring-forward transition (2026-03-29, 02:00 -> 03:00)", () => {
    // 01:30 CET, before the jump.
    expect(toBerlinDateString(Date.UTC(2026, 2, 29, 0, 30))).toBe("2026-03-29");
    // 03:30 CEST, right after the jump (02:30 never existed).
    expect(toBerlinDateString(Date.UTC(2026, 2, 29, 1, 30))).toBe("2026-03-29");
    // Midnight edge on the transition day itself (still CET at midnight).
    expect(toBerlinDateString(Date.UTC(2026, 2, 28, 22, 30))).toBe("2026-03-28");
    expect(toBerlinDateString(Date.UTC(2026, 2, 28, 23, 30))).toBe("2026-03-29");
  });

  it("handles the fall-back transition (2026-10-25, 03:00 -> 02:00)", () => {
    // 23:59 CEST on Oct 24 vs 00:01 CEST on Oct 25.
    expect(toBerlinDateString(Date.UTC(2026, 9, 24, 21, 59))).toBe("2026-10-24");
    expect(toBerlinDateString(Date.UTC(2026, 9, 24, 22, 1))).toBe("2026-10-25");
    // The repeated 02:30 wall-clock hour: CEST occurrence and CET occurrence
    // are different instants but the same Berlin date.
    expect(toBerlinDateString(Date.UTC(2026, 9, 25, 0, 30))).toBe("2026-10-25");
    expect(toBerlinDateString(Date.UTC(2026, 9, 25, 1, 30))).toBe("2026-10-25");
  });
});

describe("todayBerlin", () => {
  it("formats an explicit instant like toBerlinDateString", () => {
    const now = Date.UTC(2026, 0, 15, 23, 1);
    expect(todayBerlin(now)).toBe(toBerlinDateString(now));
    expect(todayBerlin(now)).toBe("2026-01-16");
  });

  it("defaults to now and returns a valid date string", () => {
    expect(isValidDateString(todayBerlin())).toBe(true);
  });
});

describe("addDays", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
    expect(addDays("2026-10-02", 0)).toBe("2026-10-02");
  });

  it("handles leap days", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-28", 2)).toBe("2024-03-01");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
  });

  it("supports negative offsets", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("throws on invalid input", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow();
    expect(() => addDays("garbage", 1)).toThrow();
    expect(() => addDays("2026-01-01", 1.5)).toThrow();
  });
});

describe("isoWeekday", () => {
  it("returns 1=Monday … 7=Sunday for known dates", () => {
    expect(isoWeekday("2026-09-28")).toBe(1); // Monday
    expect(isoWeekday("2026-09-30")).toBe(3); // Wednesday
    expect(isoWeekday("2026-01-01")).toBe(4); // Thursday
    expect(isoWeekday("2024-02-29")).toBe(4); // Thursday (leap day)
    expect(isoWeekday("2026-10-02")).toBe(5); // Friday
    expect(isoWeekday("2026-03-29")).toBe(7); // Sunday (spring forward)
    expect(isoWeekday("2026-10-25")).toBe(7); // Sunday (fall back)
  });

  it("throws on invalid input", () => {
    expect(() => isoWeekday("2026-02-30")).toThrow();
    expect(() => isoWeekday("not-a-date")).toThrow();
  });
});

describe("daysInMonth", () => {
  it("returns 29 for leap Februaries and 28 otherwise", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not 400
  });

  it("returns 30/31 for the other months", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("throws on out-of-range months", () => {
    expect(() => daysInMonth(2026, 0)).toThrow(RangeError);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });
});

describe("isValidDateString", () => {
  it("accepts well-formed real calendar days", () => {
    expect(isValidDateString("2026-01-01")).toBe(true);
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true); // leap day
  });

  it("rejects impossible dates and malformed input", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2025-02-29")).toBe(false); // not a leap year
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-00-10")).toBe(false);
    expect(isValidDateString("2026-01-32")).toBe(false);
    expect(isValidDateString("2026-1-1")).toBe(false);
    expect(isValidDateString("26-01-01")).toBe(false);
    expect(isValidDateString("2026/01/01")).toBe(false);
    expect(isValidDateString("2026-01-01T00:00")).toBe(false);
    expect(isValidDateString(" 2026-01-01")).toBe(false);
    expect(isValidDateString("garbage")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("compareDates", () => {
  it("orders dates chronologically", () => {
    expect(compareDates("2026-01-01", "2026-01-01")).toBe(0);
    expect(compareDates("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareDates("2026-01-02", "2026-01-01")).toBe(1);
    expect(compareDates("2025-12-31", "2026-01-01")).toBe(-1);
    expect(compareDates("2026-02-28", "2026-10-25")).toBe(-1);
  });
});

describe("berlinHour", () => {
  it("returns the Berlin hour in winter (CET, UTC+1)", () => {
    expect(berlinHour(Date.UTC(2026, 0, 15, 7, 30))).toBe(8);
  });
  it("returns the Berlin hour in summer (CEST, UTC+2)", () => {
    expect(berlinHour(Date.UTC(2026, 6, 15, 7, 30))).toBe(9);
  });
  it("wraps across midnight Berlin time", () => {
    expect(berlinHour(Date.UTC(2026, 0, 15, 23, 30))).toBe(0);
  });
});

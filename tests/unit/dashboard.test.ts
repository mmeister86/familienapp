import { describe, expect, it } from "vitest";
import {
  changeLabel,
  daySwitchLabel,
  formatEventTime,
  isStale,
  isWithinDays,
} from "../../src/lib/dashboard.js";

describe("isStale", () => {
  it("is false just under two hours", () => {
    expect(isStale(1_000_000, 1_000_000 + 2 * 60 * 60 * 1000 - 1)).toBe(false);
  });
  it("is true beyond two hours", () => {
    expect(isStale(1_000_000, 1_000_000 + 2 * 60 * 60 * 1000 + 1)).toBe(true);
  });
});

describe("daySwitchLabel", () => {
  it("labels today and tomorrow", () => {
    expect(daySwitchLabel("2026-10-02", "2026-10-02")).toBe("Heute");
    expect(daySwitchLabel("2026-10-03", "2026-10-02")).toBe("Morgen");
  });
  it("labels other days with weekday and date", () => {
    // 2026-10-04 is a Sunday.
    expect(daySwitchLabel("2026-10-04", "2026-10-02")).toBe("So 04.10.");
  });
});

describe("isWithinDays", () => {
  it("includes today and the last day of the window", () => {
    expect(isWithinDays("2026-10-02", "2026-10-02", 7)).toBe(true);
    expect(isWithinDays("2026-10-09", "2026-10-02", 7)).toBe(true);
  });
  it("excludes yesterday and beyond the window", () => {
    expect(isWithinDays("2026-10-01", "2026-10-02", 7)).toBe(false);
    expect(isWithinDays("2026-10-10", "2026-10-02", 7)).toBe(false);
  });
});

describe("formatEventTime", () => {
  it("says Ganztägig for all-day events", () => {
    expect(formatEventTime("2026-10-02", true)).toBe("Ganztägig");
  });
  it("formats an RFC 3339 start in Berlin time", () => {
    expect(formatEventTime("2026-10-02T16:30:00+02:00", false)).toBe("16:30");
  });
  it("returns an empty string for an unparseable start", () => {
    expect(formatEventTime("nope", false)).toBe("");
  });
});

describe("changeLabel", () => {
  it("maps change types to German labels", () => {
    expect(changeLabel("cancelled")).toBe("Entfällt");
    expect(changeLabel("substitution")).toBe("Vertretung");
    expect(changeLabel("roomChange")).toBe("Raumwechsel");
    expect(changeLabel("other")).toBe("Änderung");
  });
});

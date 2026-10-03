import { describe, expect, it } from "vitest";
import { formatLongDay, upcomingDayParts } from "../../src/lib/tasks.js";

const TODAY = "2026-10-03"; // Saturday

describe("formatLongDay", () => {
  it("spells out weekday and month in German", () => {
    expect(formatLongDay(TODAY)).toBe("Samstag, 3. Oktober");
  });
});

describe("upcomingDayParts", () => {
  it("labels tomorrow and the day after relatively", () => {
    expect(upcomingDayParts("2026-10-04", TODAY)).toEqual({
      label: "Morgen",
      date: "4. Oktober",
    });
    expect(upcomingDayParts("2026-10-05", TODAY)).toEqual({
      label: "Übermorgen",
      date: "5. Oktober",
    });
  });

  it("uses the weekday name further out", () => {
    expect(upcomingDayParts("2026-10-07", TODAY)).toEqual({
      label: "Mittwoch",
      date: "7. Oktober",
    });
  });
});

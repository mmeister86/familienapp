import { describe, expect, it } from "vitest";
import {
  easterSunday,
  holidaysBetween,
  saxonHolidays,
} from "../../convex/lib/holidays.js";

describe("easterSunday", () => {
  it("matches known Easter dates", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });
});

describe("saxonHolidays", () => {
  it("contains the eleven Saxon holidays for 2026", () => {
    const list = saxonHolidays(2026);
    expect(list).toHaveLength(11);
    expect(list.map((holiday) => holiday.date)).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-06",
      "2026-05-01",
      "2026-05-14",
      "2026-05-25",
      "2026-10-03",
      "2026-10-31",
      "2026-11-18",
      "2026-12-25",
      "2026-12-26",
    ]);
  });

  it("puts Buß- und Bettag on the Wednesday before 23 November", () => {
    const find = (year: number) =>
      saxonHolidays(year).find((h) => h.name === "Buß- und Bettag")?.date;
    expect(find(2025)).toBe("2025-11-19");
    expect(find(2026)).toBe("2026-11-18");
    expect(find(2028)).toBe("2028-11-22");
  });
});

describe("holidaysBetween", () => {
  it("returns holidays inside the window only", () => {
    expect(holidaysBetween("2026-10-01", "2026-10-08")).toEqual([
      { date: "2026-10-03", name: "Tag der Deutschen Einheit" },
    ]);
    expect(holidaysBetween("2026-10-04", "2026-10-10")).toEqual([]);
  });

  it("spans the turn of the year", () => {
    expect(
      holidaysBetween("2026-12-28", "2027-01-04").map((h) => h.name),
    ).toEqual(["Neujahr"]);
  });
});

import { describe, expect, it } from "vitest";
import { daySegments } from "../../src/lib/scene-schedule.js";

const scenes = [
  {
    sceneId: "morning",
    name: "Morgen",
    start: { schoolDay: "06:45", weekend: "07:30" },
  },
  {
    sceneId: "day",
    name: "Tag",
    start: { schoolDay: "09:00", weekend: "10:00" },
  },
  {
    sceneId: "evening",
    name: "Abend",
    start: { schoolDay: "19:00", weekend: "19:00" },
  },
  {
    sceneId: "night",
    name: "Nacht",
    start: { schoolDay: "21:30", weekend: "21:30" },
  },
];

describe("daySegments", () => {
  it("covers the full day in start order, wrapping before the first start", () => {
    expect(daySegments(scenes, "schoolDay")).toEqual([
      { sceneId: "night", name: "Nacht", fromMin: 0, toMin: 405 },
      { sceneId: "morning", name: "Morgen", fromMin: 405, toMin: 540 },
      { sceneId: "day", name: "Tag", fromMin: 540, toMin: 1140 },
      { sceneId: "evening", name: "Abend", fromMin: 1140, toMin: 1290 },
      { sceneId: "night", name: "Nacht", fromMin: 1290, toMin: 1440 },
    ]);
  });

  it("uses the weekend starts on weekends", () => {
    const segments = daySegments(scenes, "weekend");
    expect(segments[1]).toEqual({
      sceneId: "morning",
      name: "Morgen",
      fromMin: 450,
      toMin: 600,
    });
  });

  it("skips scenes that do not run that day", () => {
    const withNull = [
      ...scenes,
      {
        sceneId: "s-x",
        name: "X",
        start: { schoolDay: "15:30", weekend: null },
      },
    ];
    expect(
      daySegments(withNull, "weekend").map((s) => s.sceneId),
    ).not.toContain("s-x");
    expect(
      daySegments(withNull, "schoolDay").map((s) => s.sceneId),
    ).toContain("s-x");
  });

  it("returns nothing without starts and skips invalid times", () => {
    expect(daySegments([], "schoolDay")).toEqual([]);
    const bad = [
      {
        sceneId: "broken",
        name: "B",
        start: { schoolDay: "xx", weekend: null },
      },
    ];
    expect(daySegments(bad, "schoolDay")).toEqual([]);
  });
});

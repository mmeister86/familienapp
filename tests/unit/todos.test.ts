import { describe, expect, it } from "vitest";
import {
  parseDaysParam,
  toWireTask,
  type WireTaskInput,
} from "../../convex/lib/todos.js";

describe("parseDaysParam", () => {
  it("defaults to 1 when the parameter is absent", () => {
    expect(parseDaysParam(new URLSearchParams(""))).toBe(1);
    expect(parseDaysParam(new URLSearchParams("other=1"))).toBe(1);
  });

  it("accepts every value in 1..7", () => {
    for (let days = 1; days <= 7; days++) {
      expect(parseDaysParam(new URLSearchParams(`days=${String(days)}`))).toBe(
        days,
      );
    }
  });

  it("rejects out-of-range and non-integer values", () => {
    for (const raw of ["0", "8", "100", "2.5", "abc", "", " 2 ", "-1"]) {
      expect(parseDaysParam(new URLSearchParams(`days=${raw}`))).toBeNull();
    }
  });

  it("rejects a value that is only whitespace around a valid digit", () => {
    expect(parseDaysParam(new URLSearchParams("days= 2 "))).toBeNull();
  });
});

describe("toWireTask", () => {
  function input(overrides: Partial<WireTaskInput> = {}): WireTaskInput {
    return {
      id: "k17abc",
      title: "Zimmer aufräumen",
      status: "open",
      recurrenceKind: "none",
      ...overrides,
    };
  }

  it("maps the full contract shape", () => {
    expect(
      toWireTask(
        input({
          assigneeSlug: "lukas",
          date: "2026-10-02",
          pointsSnapshot: 10,
          recurrenceKind: "daily",
        }),
      ),
    ).toEqual({
      id: "k17abc",
      title: "Zimmer aufräumen",
      assignee: "lukas",
      date: "2026-10-02",
      status: "open",
      points: 10,
      recurring: true,
    });
  });

  it("trims the title", () => {
    expect(toWireTask(input({ title: "  Zimmer aufräumen  " }))?.title).toBe(
      "Zimmer aufräumen",
    );
  });

  it("omits assignee and date when undefined", () => {
    expect(toWireTask(input())).toEqual({
      id: "k17abc",
      title: "Zimmer aufräumen",
      status: "open",
    });
  });

  it("omits points when the snapshot is 0 or undefined", () => {
    expect(toWireTask(input({ pointsSnapshot: 0 }))).not.toHaveProperty(
      "points",
    );
    expect(toWireTask(input({ pointsSnapshot: undefined }))).not.toHaveProperty(
      "points",
    );
  });

  it("omits recurring when the kind is none", () => {
    expect(toWireTask(input({ recurrenceKind: "none" }))).not.toHaveProperty(
      "recurring",
    );
  });

  it("sets recurring true for any non-none kind", () => {
    for (const recurrenceKind of [
      "daily",
      "weekly",
      "monthly",
      "afterCompletion",
    ] as const) {
      expect(toWireTask(input({ recurrenceKind }))?.recurring).toBe(true);
    }
  });

  it("returns null for empty or whitespace-only titles", () => {
    expect(toWireTask(input({ title: "" }))).toBeNull();
    expect(toWireTask(input({ title: "   " }))).toBeNull();
  });
});

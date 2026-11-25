import { describe, expect, it } from "vitest";
import {
  emptyHistory,
  record,
  redo,
  undo,
} from "../../src/lib/history.js";

describe("history", () => {
  it("undoes to the recorded value and keeps the current one for redo", () => {
    const h = record(emptyHistory<string>(), "a");
    const u = undo(h, "b");
    expect(u?.value).toBe("a");
    expect(u?.history.past).toEqual([]);
    expect(u?.history.future).toEqual(["b"]);
    const r = redo(u!.history, "a");
    expect(r?.value).toBe("b");
    expect(r?.history.past).toEqual(["a"]);
    expect(r?.history.future).toEqual([]);
  });
  it("clears the future when recording after an undo", () => {
    const u = undo(record(emptyHistory<string>(), "a"), "b")!;
    expect(record(u.history, "a").future).toEqual([]);
  });
  it("drops the oldest entry beyond the limit of 20", () => {
    let h = emptyHistory<number>();
    for (let i = 1; i <= 21; i++) {
      h = record(h, i);
    }
    expect(h.past).toHaveLength(20);
    expect(h.past[0]).toBe(2);
    expect(h.past[19]).toBe(21);
  });
  it("returns null when there is nothing to undo or redo", () => {
    expect(undo(emptyHistory<string>(), "x")).toBeNull();
    expect(redo(emptyHistory<string>(), "x")).toBeNull();
  });
  it("does not mutate the previous history", () => {
    const h = record(emptyHistory<string>(), "a");
    undo(h, "b");
    expect(h).toEqual({ past: ["a"], future: [] });
  });
});

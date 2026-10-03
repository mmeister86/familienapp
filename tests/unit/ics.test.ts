// Fixture tests for ICS normalization with stable series identity.
// Every test reads a real .ics fixture through normalizeIcs and asserts the
// normalized business view (instants, DATE values, stable recurrence keys).
// These tests must fail before convex/lib/ics.ts exists (TDD RED phase).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { occurrenceKey } from "../../convex/lib/calendarPolicy.js";
import type {
  CalendarWindow,
  NormalizedCalendarEvent,
} from "../../convex/lib/calendarTypes.js";
import { IcsNormalizeError, normalizeIcs } from "../../convex/lib/ics.js";

const BERLIN = "Europe/Berlin";

// 42-day fall window covering the 2026-10-25 fallback (CEST -> CET).
const FALL_WINDOW: CalendarWindow = {
  startDate: "2026-09-30",
  endDate: "2026-11-11",
};

// 42-day spring window covering the 2026-03-29 forward jump (CET -> CEST).
const SPRING_WINDOW: CalendarWindow = {
  startDate: "2026-03-01",
  endDate: "2026-04-12",
};

function loadFixture(name: string): string {
  return readFileSync(
    new URL(`../fixtures/calendars/${name}`, import.meta.url),
    "utf8",
  );
}

// Berlin wall-clock parts of an instant, independent of the host timezone.
function berlinParts(ms: number): { date: string; hour: number; minute: number } {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts["year"]}-${parts["month"]}-${parts["day"]}`,
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
  };
}

// Every Berlin calendar day an all-day event occupies (end exclusive).
function occupiedDates(event: NormalizedCalendarEvent): string[] {
  if (!event.allDay || event.end === undefined) {
    throw new Error("occupiedDates only applies to ranged all-day events");
  }
  const days: string[] = [];
  let cursor = event.start;
  for (let step = 0; step < 500 && cursor < event.end; step += 1) {
    days.push(cursor);
    const [y, m, d] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return days;
}

describe("normalizeIcs", () => {
  it("berlinWeeklyAcrossFallDST (17:00 stays 17:00 Berlin across 2026-10-25)", () => {
    const events = normalizeIcs(
      loadFixture("berlin-weekly-fall-dst.ics"),
      FALL_WINDOW,
      BERLIN,
    );
    // Tuesdays Oct 6/13/20/27 + Nov 3/10.
    expect(events).toHaveLength(6);
    for (const event of events) {
      expect(event.uid).toBe("lesson-weekly-1");
      expect(event.allDay).toBe(false);
      expect(event.recurrenceId).toMatch(/^\d{8}T\d{6}Z$/);
      const start = berlinParts(Date.parse(event.start));
      expect(start.hour).toBe(17);
      expect(start.minute).toBe(0);
      // Stable identity: every instance has a distinct structured key.
      expect(occurrenceKey(event.uid, event.recurrenceId)).toBe(
        JSON.stringify([event.uid, event.recurrenceId ?? null]),
      );
    }
    const keys = new Set(
      events.map((e) => occurrenceKey(e.uid, e.recurrenceId)),
    );
    expect(keys.size).toBe(6);
    // Before the fallback 17:00 CEST is 15:00Z, afterwards 17:00 CET is 16:00Z.
    const byStart = new Map(events.map((e) => [e.start, e]));
    expect(byStart.get("2026-10-20T15:00:00.000Z")?.recurrenceId).toBe(
      "20261020T150000Z",
    );
    expect(byStart.get("2026-10-27T16:00:00.000Z")?.recurrenceId).toBe(
      "20261027T160000Z",
    );
  });

  it("springDST (10:00 stays 10:00 Berlin across 2026-03-29)", () => {
    const events = normalizeIcs(
      loadFixture("spring-forward-weekly.ics"),
      SPRING_WINDOW,
      BERLIN,
    );
    // Sundays Mar 1/8/15/22/29 + Apr 5.
    expect(events).toHaveLength(6);
    for (const event of events) {
      const start = berlinParts(Date.parse(event.start));
      expect(start.hour).toBe(10);
      expect(start.minute).toBe(0);
    }
    const starts = events.map((e) => e.start);
    // 10:00 CET is 09:00Z, 10:00 CEST is 08:00Z.
    expect(starts).toContain("2026-03-22T09:00:00.000Z");
    expect(starts).toContain("2026-03-29T08:00:00.000Z");
  });

  it("movedExceptionKeepsOriginalIdentity (18:30 override keeps the 17:00 key)", () => {
    const events = normalizeIcs(
      loadFixture("moved-exception.ics"),
      FALL_WINDOW,
      BERLIN,
    );
    expect(events).toHaveLength(6);
    // The original 17:00 instance on Oct 20 is replaced, not duplicated.
    expect(events.map((e) => e.start)).not.toContain(
      "2026-10-20T15:00:00.000Z",
    );
    const moved = events.find(
      (e) => e.start === "2026-10-20T16:30:00.000Z",
    );
    expect(moved).toBeDefined();
    expect(moved?.end).toBe("2026-10-20T17:30:00.000Z");
    // The override keeps the original 17:00 instance key (15:00Z in CEST).
    expect(moved?.recurrenceId).toBe("20261020T150000Z");
    expect(occurrenceKey(moved!.uid, moved?.recurrenceId)).toBe(
      JSON.stringify(["lesson-moved-1", "20261020T150000Z"]),
    );
  });

  it("movedExceptionKeepsOriginalIdentity (detached override moved into the window)", () => {
    const events = normalizeIcs(
      loadFixture("detached-into-window.ics"),
      FALL_WINDOW,
      BERLIN,
    );
    // Six regular Mondays Oct 5/12/19/26 + Nov 2/9, plus the Sep 7 instance
    // rescheduled to Tue Oct 6.
    expect(events).toHaveLength(7);
    const moved = events.find(
      (e) => e.start === "2026-10-06T07:00:00.000Z",
    );
    expect(moved).toBeDefined();
    expect(moved?.recurrenceId).toBe("20260907T070000Z");
    // The regular Oct 5 Monday instance still has its own identity.
    const regular = events.find(
      (e) => e.start === "2026-10-05T07:00:00.000Z",
    );
    expect(regular?.recurrenceId).toBe("20261005T070000Z");
  });

  it("cancelledMasterAndException (cancelled series vanish, cancelled instance drops)", () => {
    const events = normalizeIcs(loadFixture("cancelled.ics"), FALL_WINDOW, BERLIN);
    // The cancelled master yields nothing at all.
    expect(events.filter((e) => e.uid === "cancelled-master-1")).toHaveLength(0);
    // The second series loses only its cancelled Oct 20 instance.
    const remaining = events.filter((e) => e.uid === "cancelled-instance-1");
    expect(remaining).toHaveLength(5);
    expect(remaining.map((e) => e.start)).not.toContain(
      "2026-10-20T15:00:00.000Z",
    );
  });

  it("exdateAndRdate (excluded instance drops, RDATE instance appears)", () => {
    const events = normalizeIcs(
      loadFixture("exdate-rdate.ics"),
      FALL_WINDOW,
      BERLIN,
    );
    // Mondays Oct 5/19/26 + Nov 2/9 plus the Wed Oct 14 RDATE one-off.
    expect(events).toHaveLength(6);
    const starts = events.map((e) => e.start);
    expect(starts).not.toContain("2026-10-12T07:00:00.000Z");
    expect(starts).toContain("2026-10-14T07:00:00.000Z");
    const extra = events.find((e) => e.start === "2026-10-14T07:00:00.000Z");
    expect(extra?.end).toBe("2026-10-14T08:00:00.000Z");
    // The RDATE instance carries its own start as the stable key.
    expect(extra?.recurrenceId).toBe("20261014T070000Z");
  });

  it("allDayExclusiveEnd (event ending 2026-10-04 occupies only earlier days)", () => {
    const events = normalizeIcs(
      loadFixture("allday-exclusive-end.ics"),
      FALL_WINDOW,
      BERLIN,
    );
    expect(events).toHaveLength(2);
    const main = events.find((e) => e.uid === "allday-1");
    expect(main?.allDay).toBe(true);
    expect(main?.start).toBe("2026-10-02");
    expect(main?.end).toBe("2026-10-04");
    // DATE values stay date strings with an exclusive end: Oct 4 is free.
    expect(occupiedDates(main!)).toEqual(["2026-10-02", "2026-10-03"]);
    // A DATE without DTEND occupies exactly its own day.
    const single = events.find((e) => e.uid === "allday-single-1");
    expect(single?.start).toBe("2026-10-06");
    expect(single?.end).toBe("2026-10-07");
  });

  it("ongoingBeforeWindow (events are selected by overlap, not by start)", () => {
    const events = normalizeIcs(
      loadFixture("ongoing-before-window.ics"),
      FALL_WINDOW,
      BERLIN,
    );
    const uids = events.map((e) => e.uid).sort();
    expect(uids).toEqual(["ongoing-1", "ongoing-day-1"]);
    const long = events.find((e) => e.uid === "ongoing-1");
    expect(long?.start).toBe("2026-09-28T10:00:00.000Z");
    expect(long?.end).toBe("2026-10-02T10:00:00.000Z");
  });

  it("duplicateUidDifferentSources (same UID normalizes identically per source)", () => {
    const text = loadFixture("berlin-weekly-fall-dst.ics");
    // Source identity scopes the stored rows (a later import task); the
    // per-source normalization itself must be deterministic.
    const first = normalizeIcs(text, FALL_WINDOW, BERLIN);
    const second = normalizeIcs(text, FALL_WINDOW, BERLIN);
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it("floatingTimeUsesBerlin (floating 17:00 means 17:00 Berlin)", () => {
    const events = normalizeIcs(
      loadFixture("floating-berlin.ics"),
      FALL_WINDOW,
      BERLIN,
    );
    expect(events).toHaveLength(1);
    // Oct 6 is CEST (+2), so 17:00 floating Berlin is 15:00Z — and never the
    // host timezone's 17:00.
    expect(events[0]?.start).toBe("2026-10-06T15:00:00.000Z");
    expect(events[0]?.end).toBe("2026-10-06T16:00:00.000Z");
  });

  it("windowsTzid (W. Europe Standard Time resolves like Berlin)", () => {
    const events = normalizeIcs(
      loadFixture("windows-tzid.ics"),
      FALL_WINDOW,
      BERLIN,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.start).toBe("2026-10-06T15:00:00.000Z");
    expect(events[0]?.end).toBe("2026-10-06T16:00:00.000Z");
  });

  it("missingUidFallsBackToStableHash (deterministic replacement identity)", () => {
    const events = normalizeIcs(loadFixture("no-uid.ics"), FALL_WINDOW, BERLIN);
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event.uid.startsWith("fallback:")).toBe(true);
    }
    // Different identity fields -> different keys; same input -> same key.
    expect(events[0]?.uid).not.toBe(events[1]?.uid);
    const again = normalizeIcs(loadFixture("no-uid.ics"), FALL_WINDOW, BERLIN);
    expect(again.map((e) => e.uid)).toEqual(events.map((e) => e.uid));
    // DTSTAMP changes must not change the fallback key.
    const restamped = loadFixture("no-uid.ics").replaceAll(
      "DTSTAMP:20260901T000000Z",
      "DTSTAMP:20261101T120000Z",
    );
    const restampedEvents = normalizeIcs(restamped, FALL_WINDOW, BERLIN);
    expect(restampedEvents.map((e) => e.uid)).toEqual(
      events.map((e) => e.uid),
    );
  });

  it("malformedIsNotEmpty (broken feeds are rejected, never an empty success)", () => {
    // Truncated feed without VCALENDAR boundaries.
    expect(() =>
      normalizeIcs(loadFixture("malformed-truncated.ics"), FALL_WINDOW, BERLIN),
    ).toThrow(IcsNormalizeError);
    // VEVENT without DTSTART.
    expect(() =>
      normalizeIcs(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:No start\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
        FALL_WINDOW,
        BERLIN,
      ),
    ).toThrow(IcsNormalizeError);
    // Stray parse output is not success: an unusable RRULE rejects the feed.
    expect(() =>
      normalizeIcs(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20261006T170000Z\r\nRRULE:FREQ=DAILY;COUNT=banana\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
        FALL_WINDOW,
        BERLIN,
      ),
    ).toThrow(IcsNormalizeError);
    // A silently dropped UNTIL (DATE vs DATE-TIME mismatch) rejects the feed.
    expect(() =>
      normalizeIcs(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;TZID=Europe/Berlin:20261006T170000\r\nRRULE:FREQ=DAILY;UNTIL=20261101\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
        FALL_WINDOW,
        BERLIN,
      ),
    ).toThrow(IcsNormalizeError);
    // RECURRENCE-ID ranges are unsupported and must not partially apply.
    expect(() =>
      normalizeIcs(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;TZID=Europe/Berlin:20261006T170000\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;TZID=Europe/Berlin:20261008T170000\r\nRECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Europe/Berlin:20261008T170000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
        FALL_WINDOW,
        BERLIN,
      ),
    ).toThrow(IcsNormalizeError);
  });

  it("tooManyOccurrencesIsNotPartialSuccess (oversized series throw, not truncate)", () => {
    expect(() =>
      normalizeIcs(
        loadFixture("too-many-occurrences.ics"),
        FALL_WINDOW,
        BERLIN,
      ),
    ).toThrow(/occurrence/i);
  });
});

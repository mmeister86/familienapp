// Import content fingerprint (Task 3 of the calendar pilot).
//
// contentFingerprint is SHA-256 over the import window plus the key-sorted
// normalized events. Fetch time and attempt state are deliberately excluded,
// so an unchanged provider response reproduces the identical fingerprint and
// qualifies for the unchanged fast path (publishUnchanged reuses the data
// pointer instead of rewriting events).
//
// This module has no Node imports: the same helper runs in the fetch action
// (Task 4, Node runtime) and inside publish mutations (Convex runtime).

import type { NormalizedCalendarEvent } from "./calendarTypes.js";
import { sha256Hex } from "./sha256.js";

export type FingerprintWindow = {
  fromDate: string;
  toDate: string;
};

// Canonical row for one event: a fixed-position tuple (no key collisions
// from delimiter joins, no timestamps, no staging metadata).
function canonicalEventRow(event: NormalizedCalendarEvent): string {
  return JSON.stringify([
    event.key,
    event.uid,
    event.identityQuality,
    event.recurrenceId ?? null,
    event.title,
    event.location ?? null,
    event.startMs,
    event.endMs,
    event.allDay,
    event.timezone,
    event.startDate ?? null,
    event.endDate ?? null,
  ]);
}

// Canonical payload: versioned envelope, window boundary dates, then the
// event rows in key order (keys are unique per import, so full-row sort is
// exactly key order and byte-stable).
export function canonicalImportPayload(
  window: FingerprintWindow,
  events: NormalizedCalendarEvent[],
): string {
  const rows = events.map(canonicalEventRow).sort();
  return JSON.stringify({
    v: 1,
    window: [window.fromDate, window.toDate],
    events: rows,
  });
}

export function contentFingerprint(
  window: FingerprintWindow,
  events: NormalizedCalendarEvent[],
): string {
  return sha256Hex(canonicalImportPayload(window, events));
}

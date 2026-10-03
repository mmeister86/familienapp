// Shared calendar contract: pure TypeScript types for the common family
// backend (Task 1 of the Convex calendar pilot).
//
// Conventions (binding for later tasks):
// - All "day" logic runs in Europe/Berlin; dates are "YYYY-MM-DD" strings.
// - CalendarWindow covers CALENDAR_WINDOW_DAYS calendar days starting at
//   startDate (inclusive). endDate is EXCLUSIVE (startDate + 42 days), so an
//   event overlaps the window iff eventStart < endDate && eventEnd > startDate.
// - Secrets (tokens, passwords, credential references) never appear in these
//   types; they stay in server-side Convex/Coolify configuration.

export const CALENDAR_WINDOW_DAYS = 42;

// Default poll interval for calendar sources (5 minutes, carried over from
// the dashboard poller). A source counts as stale after three missed
// successful intervals, at the earliest after CALENDAR_STALENESS_MIN_MS.
export const DEFAULT_CALENDAR_INTERVAL_MS = 5 * 60 * 1000;

// Lower bound for staleness: even chatty sources are never stale before this.
export const CALENDAR_STALENESS_MIN_MS = 5 * 60 * 1000;

export type CalendarSourceKind = "ics" | "google";

export type CalendarSourceMode = "shadow" | "active";

export type CalendarWindow = {
  // First Berlin calendar day of the window (inclusive, YYYY-MM-DD).
  startDate: string;
  // First Berlin calendar day after the window (exclusive, YYYY-MM-DD).
  endDate: string;
};

export type NormalizedCalendarEvent = {
  // Stable external identity: ICS UID plus, for series, the recurrence
  // instance derived from RECURRENCE-ID or the original series timestamp.
  uid: string;
  recurrenceId?: string;
  title: string;
  // RFC 3339 timestamps, or YYYY-MM-DD when allDay (end exclusive then).
  start: string;
  end?: string;
  allDay: boolean;
  calendar?: string;
  location?: string;
};

export type CalendarFeedV1 = {
  version: 1;
  window: CalendarWindow;
  generatedAt: number;
  events: NormalizedCalendarEvent[];
};

// Client-supplied source configuration. sourceKey is the stable identity:
// renames and reorders keep the same key (and therefore the same document).
export type CalendarSourceInput = {
  sourceKey: string;
  name: string;
  kind: CalendarSourceKind;
  // Required for kind "ics"; unused for "google" (server-side credential).
  url?: string;
  color?: string;
  intervalMs?: number;
  sortOrder?: number;
};

export type CalendarFreshness = "neverLoaded" | "fresh" | "stale";

export type CalendarImportStatus =
  | "running"
  | "committed"
  | "superseded"
  | "failed";

// Shared calendar contract: pure TypeScript types for the common family
// backend (Task 1 of the Convex calendar pilot). This file is BINDING for
// later tasks; field names and semantics follow the plan section
// "Gemeinsame Schnittstellenentscheidungen" verbatim.
//
// Conventions:
// - All "day" logic runs in Europe/Berlin; dates are "YYYY-MM-DD" strings.
// - CalendarWindow covers CALENDAR_WINDOW_DAYS calendar days starting at
//   fromDate (inclusive). toDate is EXCLUSIVE (fromDate + 42 days), and
//   fromMs/toMs are the Berlin-midnight instants of those dates, so an event
//   overlaps the window iff eventStart < toMs && eventEnd > fromMs.
// - Event keys use occurrenceKey() JSON-tuple encoding (no delimiter joins);
//   the source (calendarId) scopes global identity.
// - Secrets (tokens, passwords, credential references) never appear in these
//   types; feeds reference server-side configuration by urlEnvKey only.

import type { Id } from "../_generated/dataModel.js";

export const CALENDAR_WINDOW_DAYS = 42;

export const BERLIN_TIMEZONE = "Europe/Berlin";

// Default poll interval for calendar sources (5 minutes, carried over from
// the dashboard poller).
export const DEFAULT_CALENDAR_INTERVAL_MS = 5 * 60 * 1000;

// Freshness floor: a source counts as stale at
// max(3 * intervalMs, CALENDAR_STALENESS_MIN_MS) after lastSuccessAt, i.e.
// 900000 ms at the default interval.
export const CALENDAR_STALENESS_MIN_MS = 5 * 60 * 1000;

// Per-source poll interval bounds (plan section "Grenzen und Defaults").
export const MIN_CALENDAR_INTERVAL_MS = 60 * 1000;
export const MAX_CALENDAR_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Registry cap: at most 20 calendar sources.
export const MAX_CALENDAR_SOURCES = 20;

// Source visibility/polling mode: shadow (polled, parent-only), convex
// (polled, served through the v1 feed), local (never polled centrally).
export type CalendarSourceMode = "shadow" | "convex" | "local";

// Display panel: a plain column calendar or a school calendar that maps
// into a stable column calendar via intoCalendarId.
export type CalendarSourcePanel = "column" | "school";

// Import lifecycle: running (lease-held fetch), staging (batches accepted),
// ready (published stand), error (classified failure), superseded (replaced
// by a newer generation or run).
export type CalendarImportState =
  | "running"
  | "staging"
  | "ready"
  | "error"
  | "superseded";

export type CalendarWindow = {
  // First Berlin calendar day of the window (inclusive, YYYY-MM-DD).
  fromDate: string;
  // First Berlin calendar day after the window (exclusive, YYYY-MM-DD).
  toDate: string;
  // Berlin-midnight instant of fromDate (ms since the epoch).
  fromMs: number;
  // Berlin-midnight instant of toDate (ms since the epoch).
  toMs: number;
};

// Identity quality of the event UID: provider (stable vendor UID) or
// fallback (deterministic SHA-256 over a structured identity tuple).
export type CalendarIdentityQuality = "provider" | "fallback";

export type NormalizedCalendarEvent = {
  // occurrenceKey(uid, recurrenceId) output: JSON-tuple encoding.
  key: string;
  uid: string;
  identityQuality: CalendarIdentityQuality;
  // Original instance identifier for series (RECURRENCE-ID or original
  // series timestamp); absent for single events.
  recurrenceId?: string;
  title: string;
  location?: string;
  // Instants in ms since the epoch (start inclusive, end exclusive).
  startMs: number;
  endMs: number;
  allDay: boolean;
  // IANA zone the wall-clock values were interpreted in.
  timezone: string;
  // DATE values for all-day events (end exclusive); absent for timed events.
  startDate?: string;
  endDate?: string;
};

export type CalendarFeedPerson = {
  id: string;
  slug: string;
  name: string;
  role: "parent" | "child";
};

export type CalendarFeedBinding = {
  personId: string;
  kind: "besteschule" | "timetable";
  externalId: string;
};

export type CalendarFeedCalendar = {
  id: string;
  sourceKey: string;
  name: string;
  color: string;
  panel: "column" | "school";
  order: number;
  intoCalendarId?: string;
  personIds: string[];
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  freshness: "neverLoaded" | "fresh" | "stale" | "disabled";
  lastAttemptStatus?: "success" | "error";
  error?: string;
  coverage?: CalendarWindow;
};

export type CalendarFeedV1 = {
  version: 1;
  scope: "family-calendars";
  timezone: "Europe/Berlin";
  configurationRevision: number;
  generatedAt: number;
  window: CalendarWindow;
  people: CalendarFeedPerson[];
  bindings: CalendarFeedBinding[];
  calendars: CalendarFeedCalendar[];
  events: Array<NormalizedCalendarEvent & { calendarId: string }>;
};

// Client-supplied source configuration. sourceKey is the stable identity:
// renames and reorders keep the same key (and therefore the same document).
// Mode changes run exclusively through activate(); save() never takes over
// import state.
export type CalendarSourceInput = {
  sourceKey: string;
  name: string;
  color: string;
  panel: CalendarSourcePanel;
  order: number;
  intoCalendarId?: Id<"calendarSources">;
  personIds: Id<"users">[];
  urlEnvKey: string;
  enabled: boolean;
  intervalMs: number;
};

// Singleton familyBackendSettings value for key "calendars": the global
// configuration revision (served as CalendarFeedV1.configurationRevision),
// the explicit setup flag (missing doc or configured=false means not set
// up; a deliberately empty configuration has configured=true) and the
// central Berlin day advanced by the dispatcher.
export type FamilyCalendarSettings = {
  key: "calendars";
  configurationRevision: number;
  configured: boolean;
  berlinDate: string;
};

export type CalendarFreshness = "neverLoaded" | "fresh" | "stale";

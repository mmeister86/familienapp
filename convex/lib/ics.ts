"use node";

// ICS normalization with stable series identity (Task 2 of the calendar pilot).
//
// Node-only helper: parses an ICS feed with node-ical, expands recurrences in
// a bounded manner and returns normalized events for one source calendar.
// The caller scopes rows per source; the keys produced here are per-source.
//
// Identity model (spec section 4):
// - Stable key material is (UID, recurrence instance). The storage layer
//   encodes it with occurrenceKey(); here recurrenceId carries the instance.
// - A moved override keeps the ORIGINAL instance key (from RECURRENCE-ID),
//   never the moved DTSTART.
// - A missing UID yields a deterministic `fallback:<sha256>` key over the
//   structured identity tuple (DTSTART, DTEND/DURATION, title, recurrence
//   definition). DTSTAMP/LAST-MODIFIED/SEQUENCE never feed the hash.
// - Same UID in different calendars stays distinct via per-source storage.
//
// Failure model: any unsupported or ambiguous shape rejects the WHOLE feed by
// throwing IcsNormalizeError. A caller holding last-good data keeps it; this
// helper never returns partial success (no truncation, no silent drops).

import { createHash } from "node:crypto";
import { sync as icalSync } from "node-ical";
import type {
  CalendarIdentityQuality,
  CalendarWindow,
  NormalizedCalendarEvent,
} from "./calendarTypes.js";
import { BERLIN_TIMEZONE } from "./calendarTypes.js";
import { berlinMidnightMs, occurrenceKey } from "./calendarPolicy.js";

// Hard cap for expanded occurrences per feed. Exceeding it throws instead of
// truncating so an import can never silently replace last-good data.
export const MAX_ICS_OCCURRENCES = 2000;

export class IcsNormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcsNormalizeError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Raw ICS scan (validation backbone, independent of parser leniency)
// ---------------------------------------------------------------------------

type RawProperty = {
  name: string;
  params: string;
  value: string;
};

type RawEvent = {
  // Position of the VEVENT block in the feed (0-based, document order).
  index: number;
  properties: RawProperty[];
};

function unfoldLines(text: string): string[] {
  const unfolded: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (unfolded.length === 0) {
        throw new IcsNormalizeError("ICS starts with a folded continuation line");
      }
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function splitProperty(line: string): RawProperty {
  const colon = line.indexOf(":");
  if (colon < 0) {
    throw new IcsNormalizeError(`ICS property without value: "${line}"`);
  }
  const head = line.slice(0, colon);
  const semi = head.indexOf(";");
  return {
    name: (semi < 0 ? head : head.slice(0, semi)).toUpperCase(),
    params: semi < 0 ? "" : head.slice(semi + 1),
    value: line.slice(colon + 1),
  };
}

function rawPropertiesOf(block: RawEvent, name: string): RawProperty[] {
  return block.properties.filter((p) => p.name === name);
}

function rawOneOf(block: RawEvent, name: string): RawProperty | undefined {
  return block.properties.find((p) => p.name === name);
}

type RawCalendar = {
  events: RawEvent[];
  wrTimezone: string | undefined;
};

function scanRawCalendar(text: string): RawCalendar {
  const lines = unfoldLines(text);
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  if (lines.length === 0 || lines[0].replace(/^\uFEFF/, "") !== "BEGIN:VCALENDAR") {
    throw new IcsNormalizeError("ICS feed does not start with BEGIN:VCALENDAR");
  }
  if (lines[lines.length - 1] !== "END:VCALENDAR") {
    throw new IcsNormalizeError("ICS feed does not end with END:VCALENDAR");
  }

  const events: RawEvent[] = [];
  let wrTimezone: string | undefined;
  let current: RawProperty[] | null = null;
  let depth = 0;
  for (const line of lines) {
    if (line === "" || line === "BEGIN:VCALENDAR" || line === "END:VCALENDAR") {
      continue;
    }
    if (line.startsWith("BEGIN:")) {
      depth += 1;
      if (line === "BEGIN:VEVENT" && depth === 1) {
        current = [];
      }
      continue;
    }
    if (line.startsWith("END:")) {
      if (line === "END:VEVENT" && depth === 1 && current !== null) {
        events.push({ index: events.length, properties: current });
        current = null;
      }
      depth -= 1;
      if (depth < 0) {
        throw new IcsNormalizeError("ICS has unbalanced BEGIN/END components");
      }
      continue;
    }
    if (current !== null) {
      current.push(splitProperty(line));
    } else if (depth === 0) {
      const property = splitProperty(line);
      if (property.name === "X-WR-TIMEZONE" && wrTimezone === undefined) {
        wrTimezone = property.value.trim();
      }
    }
  }
  if (depth !== 0 || current !== null) {
    throw new IcsNormalizeError("ICS has an unclosed component");
  }
  return { events, wrTimezone };
}

// ---------------------------------------------------------------------------
// Timezone handling (host-timezone independent; everything via Intl/UTC math)
// ---------------------------------------------------------------------------

const MAJOR_WINDOWS_ZONES: Record<string, string> = {
  // Focused CLDR-based map for zones real feeds use. Anything else must be a
  // valid IANA name, otherwise the feed is rejected (never guessed).
  "w. europe standard time": "Europe/Berlin",
  "e. europe standard time": "Europe/Chisinau",
  "fles standard time": "Europe/Kyiv",
  "gtb standard time": "Europe/Athens",
  "romance standard time": "Europe/Paris",
  "central european standard time": "Europe/Warsaw",
  "central europe standard time": "Europe/Budapest",
  "gmt standard time": "Europe/London",
  "greenwich standard time": "Atlantic/Reykjavik",
  "gmt": "Etc/UTC",
  utc: "Etc/UTC",
  "eastern standard time": "America/New_York",
  "central standard time": "America/Chicago",
  "mountain standard time": "America/Denver",
  "pacific standard time": "America/Los_Angeles",
  "atlantic standard time": "America/Halifax",
  "tokyo standard time": "Asia/Tokyo",
  "china standard time": "Asia/Shanghai",
  "india standard time": "Asia/Kolkata",
  "aus eastern standard time": "Australia/Sydney",
};

const formatCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormat(zone: string): Intl.DateTimeFormat {
  const cached = formatCache.get(zone);
  if (cached !== undefined) {
    return cached;
  }
  // Throws RangeError for unknown zones; callers wrap it.
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatCache.set(zone, format);
  return format;
}

function isKnownZone(zone: string): boolean {
  try {
    zoneFormat(zone);
    return true;
  } catch {
    return false;
  }
}

// Resolve a raw TZID to IANA. Windows names use the embedded map; unknown or
// custom names (e.g. "Customized Time Zone") are rejected, never guessed from
// the host timezone.
function resolveZoneName(raw: string): string {
  const tzid = raw.replace(/^"(.*)"$/, "$1").trim();
  if (tzid !== "" && isKnownZone(tzid)) {
    return tzid;
  }
  const mapped = MAJOR_WINDOWS_ZONES[tzid.toLowerCase()];
  if (mapped !== undefined) {
    return mapped;
  }
  throw new IcsNormalizeError(`unsupported timezone "${raw}"`);
}

function offsetMs(zone: string, utcMs: number): number {
  const parts = Object.fromEntries(
    zoneFormat(zone)
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return asUtc - utcMs;
}

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallToMs(zone: string, parts: WallParts): number {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let guess = target;
  for (let step = 0; step < 3; step += 1) {
    const next = target - offsetMs(zone, guess);
    if (next === guess) {
      return next;
    }
    guess = next;
  }
  return guess;
}

function wallDateInZone(zone: string, ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}

// ---------------------------------------------------------------------------
// Raw date/time values
// ---------------------------------------------------------------------------

type RawDateKind = "date" | "utc" | "tzid" | "floating";

type RawDateTime = {
  kind: RawDateKind;
  // Raw TZID for kind "tzid".
  tzid: string | undefined;
  // DATE calendar value for kind "date".
  date: string | undefined;
  // UTC instant guess components for kinds utc/tzid/floating.
  parts: WallParts | undefined;
};

const DATE_TIME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/;
const DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;

function tzidOf(params: string): string | undefined {
  const match = /(?:^|;)TZID=([^;]+)/i.exec(`;${params}`);
  return match === null ? undefined : match[1];
}

function parseRawDate(value: string, params: string): RawDateTime {
  const trimmed = value.trim();
  if (params.toUpperCase().includes("VALUE=DATE") || DATE_RE.test(trimmed)) {
    const match = DATE_RE.exec(trimmed);
    if (match === null || !isRealDay(Number(match[1]), Number(match[2]), Number(match[3]))) {
      throw new IcsNormalizeError(`invalid DATE value "${value}"`);
    }
    return {
      kind: "date",
      tzid: undefined,
      date: `${match[1]}${match[2]}${match[3]}`.replace(
        /^(\d{4})(\d{2})(\d{2})$/,
        "$1-$2-$3",
      ),
      parts: undefined,
    };
  }
  const match = DATE_TIME_RE.exec(trimmed);
  if (match === null) {
    throw new IcsNormalizeError(`invalid DATE-TIME value "${value}"`);
  }
  const parts: WallParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
  validateWallParts(parts, value);
  const tzid = tzidOf(params);
  if (match[7] === "Z") {
    return { kind: "utc", tzid: undefined, date: undefined, parts };
  }
  if (tzid !== undefined) {
    // Resolve now so unknown/custom zones throw here during raw validation
    // (DTSTART/DTEND/RECURRENCE-ID via validateRawBlock, EXDATE/RDATE/PERIOD
    // via their expansion) — before node-ical's host-timezone guess in
    // instantOf() is ever trusted.
    resolveZoneName(tzid);
    return { kind: "tzid", tzid, date: undefined, parts };
  }
  return { kind: "floating", tzid: undefined, date: undefined, parts };
}

function isRealDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dim = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ][month - 1];
  return day <= dim;
}

function validateWallParts(parts: WallParts, value: string): void {
  if (
    !isRealDay(parts.year, parts.month, parts.day) ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 60
  ) {
    throw new IcsNormalizeError(`invalid DATE-TIME value "${value}"`);
  }
}

const DURATION_RE = /^P(?!$)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

// Durations with year/month components need calendar arithmetic in a zone;
// reject them instead of guessing.
function parseDurationMs(raw: string): number {
  const match = DURATION_RE.exec(raw.trim());
  if (match === null) {
    throw new IcsNormalizeError(`invalid DURATION value "${raw}"`);
  }
  if (match[1] !== undefined || match[2] !== undefined) {
    throw new IcsNormalizeError(
      `unsupported year/month DURATION "${raw}" (ambiguous without partial success)`,
    );
  }
  const weeks = Number(match[3] ?? 0);
  const days = Number(match[4] ?? 0);
  const hours = Number(match[5] ?? 0);
  const minutes = Number(match[6] ?? 0);
  const seconds = Number(match[7] ?? 0);
  const sign = raw.trim().startsWith("-") ? -1 : 1;
  return (
    sign *
    ((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds) *
    1000
  );
}

// ---------------------------------------------------------------------------
// Parsed-value helpers (narrowing unknown parser output, never `any`)
// ---------------------------------------------------------------------------

type ParsedDate = Date & { tz?: string; dateOnly?: true };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asDate(value: unknown): ParsedDate | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value as ParsedDate;
  }
  return null;
}

// SUMMARY/LOCATION may carry params ({val, params}) or be plain strings.
function asText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  if (record !== null && typeof record["val"] === "string") {
    return record["val"];
  }
  return null;
}

function statusOf(event: Record<string, unknown>): string | undefined {
  const status = event["status"];
  return typeof status === "string" ? status.toUpperCase() : undefined;
}

// Mirror of node-ical's text() unescaping so raw UID grouping matches the
// parser's component keys exactly.
function unescapeText(raw: string): string {
  return raw
    .replaceAll("\\,", ",")
    .replaceAll("\\;", ";")
    .replaceAll(/\\[nN]/gv, "\n")
    .replaceAll("\\\\", "\\")
    .replace(/^"(.*)"$/v, "$1");
}

// ---------------------------------------------------------------------------
// Synthetic UIDs: pair UID-less raw blocks with their parsed events
// ---------------------------------------------------------------------------

const SYNTHETIC_UID_PREFIX = "__familydash-fallback-";

function syntheticUid(index: number): string {
  return `${SYNTHETIC_UID_PREFIX}${index}__`;
}

function syntheticIndex(uid: string): number | null {
  if (!uid.startsWith(SYNTHETIC_UID_PREFIX) || !uid.endsWith("__")) {
    return null;
  }
  const num = Number(uid.slice(SYNTHETIC_UID_PREFIX.length, -2));
  return Number.isInteger(num) && num >= 0 ? num : null;
}

// Rebuild the feed from unfolded lines and inject a deterministic placeholder
// UID into every UID-less VEVENT. Never depend on parser-generated random IDs.
function injectSyntheticUids(text: string, raw: RawCalendar): string {
  const missing = new Set<number>();
  for (const block of raw.events) {
    const uid = rawOneOf(block, "UID");
    if (uid === undefined || uid.value.trim() === "") {
      missing.add(block.index);
    }
  }
  if (missing.size === 0) {
    return text;
  }
  const rebuilt: string[] = [];
  let blockIndex = -1;
  for (const line of unfoldLines(text)) {
    rebuilt.push(line);
    if (line === "BEGIN:VEVENT") {
      blockIndex += 1;
      if (missing.has(blockIndex)) {
        rebuilt.push(`UID:${syntheticUid(blockIndex)}`);
      }
    }
  }
  return rebuilt.join("\r\n");
}

// ---------------------------------------------------------------------------
// Effective ranges (validated instants / DATE strings per event)
// ---------------------------------------------------------------------------

type EffectiveRange =
  | { allDay: false; startMs: number; endMs: number; timezone: string }
  | { allDay: true; startDate: string; endDate: string };

// Source timezone name for a timed value: UTC instants report "UTC", TZID
// values the resolved IANA name, floating values the source/default zone.
function zoneOfRaw(value: RawDateTime, floatZone: string): string {
  if (value.kind === "utc") {
    return "UTC";
  }
  if (value.kind === "floating") {
    return floatZone;
  }
  if (value.kind === "tzid") {
    return resolveZoneName(value.tzid ?? "");
  }
  throw new IcsNormalizeError("unusable DATE value as an instant");
}

function instantOf(
  value: RawDateTime,
  parsed: ParsedDate | null,
  floatZone: string,
  what: string,
): number {
  if (value.kind === "utc" && value.parts !== undefined) {
    return Date.UTC(
      value.parts.year,
      value.parts.month - 1,
      value.parts.day,
      value.parts.hour,
      value.parts.minute,
      value.parts.second,
    );
  }
  if (value.kind === "floating" && value.parts !== undefined) {
    // Floating times use the source/default zone, never the host timezone.
    return wallToMs(floatZone, value.parts);
  }
  if (value.kind === "tzid") {
    // TZID/IANA/VTIMEZONE/custom resolution already done by the parser;
    // its instant is correct across DST. Fall back to own conversion only
    // when the parser lost the value.
    if (parsed !== null) {
      return parsed.getTime();
    }
    if (value.parts !== undefined && value.tzid !== undefined) {
      return wallToMs(resolveZoneName(value.tzid), value.parts);
    }
  } else if (parsed !== null) {
    return parsed.getTime();
  }
  throw new IcsNormalizeError(`unusable ${what} value`);
}

function addDays(dateStr: string, n: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match === null || !Number.isInteger(n)) {
    throw new IcsNormalizeError(`invalid date arithmetic "${dateStr}"`);
  }
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(ms + n * DAY_MS).toISOString().slice(0, 10);
}

function diffDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

// Validate one raw block's shape; returns its DTSTART classification.
function validateRawBlock(block: RawEvent, uidLabel: string): RawDateTime {
  const label = `VEVENT #${block.index} (${uidLabel})`;
  const dtstart = rawOneOf(block, "DTSTART");
  if (dtstart === undefined) {
    throw new IcsNormalizeError(`${label} has no DTSTART`);
  }
  const start = parseRawDate(dtstart.value, dtstart.params);
  const dtend = rawOneOf(block, "DTEND");
  if (dtend !== undefined) {
    parseRawDate(dtend.value, dtend.params);
  }
  const duration = rawOneOf(block, "DURATION");
  if (duration !== undefined) {
    parseDurationMs(duration.value);
  }
  const recId = rawOneOf(block, "RECURRENCE-ID");
  if (recId !== undefined) {
    if (/(?:^|;)RANGE=/i.test(`;${recId.params}`)) {
      throw new IcsNormalizeError(
        `${label} uses RECURRENCE-ID;RANGE which is unsupported (no partial application)`,
      );
    }
    parseRawDate(recId.value, recId.params);
  }
  return start;
}

function effectiveRange(
  block: RawEvent,
  parsed: Record<string, unknown>,
  floatZone: string,
  uidLabel: string,
): EffectiveRange {
  const label = `VEVENT #${block.index} (${uidLabel})`;
  const dtstart = rawOneOf(block, "DTSTART");
  if (dtstart === undefined) {
    throw new IcsNormalizeError(`${label} has no DTSTART`);
  }
  return effectiveRangeFromProps(
    dtstart,
    rawOneOf(block, "DTEND"),
    rawOneOf(block, "DURATION"),
    parsed,
    floatZone,
    label,
  );
}

function effectiveRangeFromProps(
  dtstart: RawProperty,
  dtend: RawProperty | undefined,
  duration: RawProperty | undefined,
  parsed: Record<string, unknown>,
  floatZone: string,
  label: string,
): EffectiveRange {
  const start = parseRawDate(dtstart.value, dtstart.params);
  if (start.kind === "date") {
    const startDate = start.date ?? "";
    const endDate =
      dtend !== undefined
        ? (parseRawDate(dtend.value, dtend.params).date ?? "")
        : addDays(startDate, 1);
    if (endDate <= startDate) {
      throw new IcsNormalizeError(`${label} has a non-positive DATE range`);
    }
    return { allDay: true, startDate, endDate };
  }
  const parsedStart = asDate(parsed["start"]);
  const startMs = instantOf(start, parsedStart, floatZone, "DTSTART");
  const timezone = zoneOfRaw(start, floatZone);
  let endMs: number;
  if (dtend !== undefined) {
    const end = parseRawDate(dtend.value, dtend.params);
    if (end.kind === "date") {
      throw new IcsNormalizeError(
        `${label} mixes DATE-TIME DTSTART with DATE DTEND`,
      );
    }
    endMs = instantOf(end, asDate(parsed["end"]), floatZone, "DTEND");
  } else if (duration !== undefined) {
    endMs = startMs + parseDurationMs(duration.value);
  } else {
    endMs = startMs;
  }
  if (endMs < startMs) {
    throw new IcsNormalizeError(`${label} ends before it starts`);
  }
  return { allDay: false, startMs, endMs, timezone };
}

// ---------------------------------------------------------------------------
// RRULE expansion guard (estimate first, never truncate)
// ---------------------------------------------------------------------------

type RruleOptions = {
  freq: string;
  interval: number;
  count: number | null;
  untilMs: number | null;
  byDay: number;
  byHour: number | null;
  byMinute: number | null;
  bySecond: number | null;
  byMonthDay: number | null;
};

const KNOWN_FREQS = new Set([
  "SECONDLY",
  "MINUTELY",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function readRruleOptions(
  rrule: unknown,
  rawValue: string,
  uidLabel: string,
  baseAllDay: boolean,
): RruleOptions {
  const label = `RRULE (${uidLabel})`;
  const record = asRecord(rrule);
  const between = record?.["between"];
  const options = asRecord(record?.["options"]);
  if (typeof between !== "function" || options === null) {
    throw new IcsNormalizeError(`${label} is not usable: "${rawValue}"`);
  }
  const fields = new Map<string, string>();
  for (const part of rawValue.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      fields.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1));
    }
  }
  const freq = (fields.get("FREQ") ?? "").toUpperCase();
  const parsedFreq =
    typeof options["freq"] === "string" ? options["freq"].toUpperCase() : "";
  if (!KNOWN_FREQS.has(freq) || parsedFreq !== freq) {
    throw new IcsNormalizeError(
      `${label} has an unsupported frequency: "${rawValue}"`,
    );
  }
  const intervalRaw = options["interval"];
  if (
    intervalRaw !== undefined &&
    (typeof intervalRaw !== "number" ||
      !Number.isInteger(intervalRaw) ||
      intervalRaw <= 0)
  ) {
    throw new IcsNormalizeError(`${label} has an invalid INTERVAL: "${rawValue}"`);
  }
  const interval = typeof intervalRaw === "number" ? intervalRaw : 1;
  let count: number | null = null;
  if (fields.has("COUNT")) {
    const parsed = options["count"];
    if (
      typeof parsed !== "number" ||
      !Number.isInteger(parsed) ||
      parsed <= 0
    ) {
      throw new IcsNormalizeError(`${label} has an unusable COUNT: "${rawValue}"`);
    }
    count = parsed;
  }
  let untilMs: number | null = null;
  const untilRaw = fields.get("UNTIL");
  if (untilRaw !== undefined) {
    // RFC 5545: UNTIL must have the same value type as DTSTART. A DATE UNTIL
    // on a DATE-TIME series (or vice versa) only works through parser
    // leniency with assumed semantics: reject instead of expanding wrong.
    const untilIsDate = /^\d{8}$/.test(untilRaw);
    const untilIsDateTime = /^\d{8}T\d{6}Z?$/.test(untilRaw);
    if (!untilIsDate && !untilIsDateTime) {
      throw new IcsNormalizeError(`${label} has an unusable UNTIL: "${rawValue}"`);
    }
    if (baseAllDay !== untilIsDate) {
      throw new IcsNormalizeError(
        `${label} mixes DATE and DATE-TIME in DTSTART/UNTIL: "${rawValue}"`,
      );
    }
    const parsed = options["until"];
    const ms =
      parsed instanceof Date
        ? parsed.getTime()
        : typeof parsed === "string"
          ? Date.parse(parsed)
          : typeof parsed === "number"
            ? parsed
            : Number.NaN;
    // A silently dropped UNTIL (e.g. DATE vs DATE-TIME mismatch) would turn a
    // bounded series into an infinite one: reject instead of expanding wrong.
    if (!Number.isFinite(ms)) {
      throw new IcsNormalizeError(`${label} has an unusable UNTIL: "${rawValue}"`);
    }
    untilMs = ms;
  }
  return {
    freq,
    interval,
    count,
    untilMs,
    byDay: arrayLength(options["byDay"]) ?? arrayLength(options["byweekday"]) ?? 1,
    byHour: arrayLength(options["byHour"]),
    byMinute: arrayLength(options["byMinute"]),
    bySecond: arrayLength(options["bySecond"]),
    byMonthDay: arrayLength(options["byMonthDay"]),
  };
}

function countOr(value: number | null, fallback: number): number {
  return value ?? fallback;
}

// Upper-bound occurrence estimate inside the search range. Deliberately
// generous; exceeding MAX_ICS_OCCURRENCES throws before any expansion.
function estimateRruleCount(
  opts: RruleOptions,
  searchStartMs: number,
  searchEndMs: number,
): number {
  let rangeMs = searchEndMs - searchStartMs;
  if (opts.untilMs !== null) {
    rangeMs = Math.min(rangeMs, opts.untilMs - searchStartMs);
  }
  if (rangeMs <= 0) {
    return 0;
  }
  const per = (ms: number): number => Math.ceil(rangeMs / ms / opts.interval);
  const seconds = countOr(opts.bySecond, 1);
  const minutes = countOr(
    opts.byMinute,
    opts.bySecond !== null ? 60 : 1,
  );
  const hours = countOr(
    opts.byHour,
    opts.byMinute !== null || opts.bySecond !== null ? 24 : 1,
  );
  let estimate: number;
  switch (opts.freq) {
    case "SECONDLY":
      estimate = per(1000);
      break;
    case "MINUTELY":
      estimate = per(60 * 1000) * seconds;
      break;
    case "HOURLY":
      estimate = per(60 * 60 * 1000) * minutes * seconds;
      break;
    case "DAILY":
      estimate = per(DAY_MS) * hours * minutes * seconds;
      break;
    case "WEEKLY":
      estimate = per(7 * DAY_MS) * opts.byDay * hours * minutes * seconds;
      break;
    case "MONTHLY":
      estimate =
        per(30.44 * DAY_MS) *
        countOr(opts.byMonthDay, 1) *
        hours *
        minutes *
        seconds;
      break;
    default:
      estimate = per(365.25 * DAY_MS) * 366 * hours * minutes * seconds;
      break;
  }
  if (opts.count !== null) {
    estimate = Math.min(estimate, opts.count);
  }
  return estimate;
}

// ---------------------------------------------------------------------------
// Stable instance keys, EXDATE sets, override pairing
// ---------------------------------------------------------------------------

// Timed recurrence identity: UTC basic format (e.g. "20261020T150000Z"),
// matching the Task 1 occurrenceKey convention. Deterministic in every host
// timezone, stable when an override moves the actual start.
function basicUtc(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".000", "");
}

type ExdateSets = {
  // Exact instants (timed EXDATE with zone/UTC, floating via float zone).
  instants: Set<number>;
  // Calendar days (DATE EXDATE).
  dates: Set<string>;
};

function buildExdateSets(
  blocks: RawEvent[],
  floatZone: string,
  uidLabel: string,
): ExdateSets {
  const instants = new Set<number>();
  const dates = new Set<string>();
  for (const block of blocks) {
    for (const property of rawPropertiesOf(block, "EXDATE")) {
      for (const part of property.value.split(",")) {
        const trimmed = part.trim();
        if (trimmed === "") {
          continue;
        }
        const parsed = parseRawDate(trimmed, property.params);
        if (parsed.kind === "date") {
          dates.add(parsed.date ?? "");
        } else if (parsed.parts === undefined) {
          throw new IcsNormalizeError(
            `VEVENT #${block.index} (${uidLabel}) has an unusable EXDATE`,
          );
        } else if (parsed.kind === "utc") {
          instants.add(
            Date.UTC(
              parsed.parts.year,
              parsed.parts.month - 1,
              parsed.parts.day,
              parsed.parts.hour,
              parsed.parts.minute,
              parsed.parts.second,
            ),
          );
        } else if (parsed.kind === "floating") {
          instants.add(wallToMs(floatZone, parsed.parts));
        } else if (parsed.tzid !== undefined) {
          instants.add(wallToMs(resolveZoneName(parsed.tzid), parsed.parts));
        }
      }
    }
  }
  return { instants, dates };
}

type ParsedOverride = {
  parsed: Record<string, unknown>;
  // Timed identity: original instance instant (from parsed RECURRENCE-ID).
  recIdMs: number | null;
  // All-day identity: original instance DATE (host-local components of the
  // parsed RECURRENCE-ID midnight, which always round-trips the DATE value).
  recIdDate: string | null;
};

// Unique override objects (deduplicates node-ical's dual-key recurrence
// metadata: date-key and ISO-key entries reference the same object).
function uniqueOverrides(
  recurrences: unknown,
  uidLabel: string,
): ParsedOverride[] {
  const record = asRecord(recurrences);
  if (record === null) {
    return [];
  }
  const seen = new Set<unknown>();
  const result: ParsedOverride[] = [];
  for (const value of Object.values(record)) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    const parsed = asRecord(value);
    if (parsed === null) {
      continue;
    }
    const recId = asDate(parsed["recurrenceid"]);
    if (recId === null) {
      throw new IcsNormalizeError(
        `override (${uidLabel}) has an unusable RECURRENCE-ID`,
      );
    }
    const dateOnly =
      (recId as { dateOnly?: unknown }).dateOnly === true;
    result.push({
      parsed,
      recIdMs: dateOnly ? null : recId.getTime(),
      recIdDate: dateOnly
        ? `${recId.getFullYear()}-${String(recId.getMonth() + 1).padStart(2, "0")}-${String(recId.getDate()).padStart(2, "0")}`
        : null,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// RDATE expansion (node-ical keeps RDATE raw; params preserved, values split)
// ---------------------------------------------------------------------------

type RdateSpec = {
  params: string;
  parts: string[];
};

function paramString(params: Record<string, unknown>, name: string): string | undefined {
  const value = params[name] ?? params[name.toLowerCase()];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

function readRdateSpecs(rdate: unknown, uidLabel: string): RdateSpec[] {
  if (rdate === undefined) {
    return [];
  }
  const list = Array.isArray(rdate) ? rdate : [rdate];
  return list.map((entry): RdateSpec => {
    if (typeof entry === "string") {
      return { params: "", parts: entry.split(",") };
    }
    const record = asRecord(entry);
    const val = record !== null ? record["val"] : undefined;
    if (typeof val !== "string") {
      throw new IcsNormalizeError(`unusable RDATE (${uidLabel})`);
    }
    const params = asRecord(record?.["params"]) ?? {};
    const rebuilt: string[] = [];
    const valueParam = paramString(params, "VALUE");
    if (valueParam !== undefined) {
      rebuilt.push(`VALUE=${valueParam}`);
    }
    const tzid = paramString(params, "TZID");
    if (tzid !== undefined) {
      rebuilt.push(`TZID=${tzid}`);
    }
    return { params: rebuilt.join(";"), parts: val.split(",") };
  });
}

// RDATE occurrences take the base duration (timed) or base day count
// (all-day). PERIOD values carry their explicit end.
function expandRdates(
  specs: RdateSpec[],
  base: EffectiveRange,
  floatZone: string,
  uidLabel: string,
): EffectiveRange[] {
  const out: EffectiveRange[] = [];
  const baseDays = base.allDay ? diffDays(base.startDate, base.endDate) : 0;
  const baseDurMs = base.allDay ? 0 : base.endMs - base.startMs;
  for (const spec of specs) {
    for (const rawPart of spec.parts) {
      const part = rawPart.trim();
      if (part === "") {
        continue;
      }
      const slash = part.indexOf("/");
      if (slash >= 0) {
        const startRaw = parseRawDate(part.slice(0, slash), spec.params);
        if (startRaw.kind === "date" || startRaw.parts === undefined) {
          throw new IcsNormalizeError(
            `unsupported PERIOD RDATE "${part}" (${uidLabel})`,
          );
        }
        const startMs = instantOf(startRaw, null, floatZone, "RDATE");
        const tail = part.slice(slash + 1);
        const endMs = tail.startsWith("P")
          ? startMs + parseDurationMs(tail)
          : instantOf(parseRawDate(tail, spec.params), null, floatZone, "RDATE");
        if (endMs < startMs) {
          throw new IcsNormalizeError(
            `RDATE period ends before it starts (${uidLabel})`,
          );
        }
        out.push({
          allDay: false,
          startMs,
          endMs,
          timezone: zoneOfRaw(startRaw, floatZone),
        });
        continue;
      }
      const value = parseRawDate(part, spec.params);
      if (value.kind === "date") {
        const days = base.allDay ? baseDays : 1;
        out.push({
          allDay: true,
          startDate: value.date ?? "",
          endDate: addDays(value.date ?? "", days),
        });
        continue;
      }
      if (value.parts === undefined) {
        throw new IcsNormalizeError(`unusable RDATE "${part}" (${uidLabel})`);
      }
      const startMs = instantOf(value, null, floatZone, "RDATE");
      out.push({
        allDay: false,
        startMs,
        endMs: startMs + (base.allDay ? baseDays * DAY_MS : baseDurMs),
        timezone: zoneOfRaw(value, floatZone),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// UID groups (base series + RECURRENCE-ID overrides, SEQUENCE resolution)
// ---------------------------------------------------------------------------

type OverrideMember = {
  // Parsed override event record (actual start/end, summary, status).
  event: Record<string, unknown>;
  raw: RawEvent;
  // Original instance identity (from parsed RECURRENCE-ID).
  recIdMs: number | null;
  recIdDate: string | null;
};

type EventGroup = {
  // Output UID: real UID or `fallback:<sha256>`.
  uid: string;
  label: string;
  baseRaw: RawEvent | null;
  // All same-UID base blocks (SEQUENCE updates merge into one series).
  baseBlocks: RawEvent[];
  parsedBase: Record<string, unknown>;
  // Normal series: overrides paired to raw blocks; orphans: positional.
  members: OverrideMember[];
  // Standalone orphan group (no base series at all).
  orphan: boolean;
};

function sequenceOf(block: RawEvent): number {
  const raw = rawOneOf(block, "SEQUENCE");
  if (raw === undefined) {
    return 0;
  }
  const num = Number(raw.value.trim());
  return Number.isInteger(num) && num >= 0 ? num : 0;
}

function winningBase(blocks: RawEvent[]): RawEvent {
  let best = blocks[0];
  let bestSeq = sequenceOf(best);
  for (const block of blocks.slice(1)) {
    const seq = sequenceOf(block);
    // Later blocks win ties (mirrors the parser merge).
    if (seq >= bestSeq) {
      best = block;
      bestSeq = seq;
    }
  }
  return best;
}

// Merged property view over same-UID base blocks: the last block (document
// order) with the highest SEQUENCE that carries the property wins, mirroring
// the parser merge (later fields overwrite on equal-or-newer SEQUENCE).
function propWinner(
  blocks: RawEvent[],
  name: string,
): { block: RawEvent; property: RawProperty } | undefined {
  const withProp = blocks.filter((b) => rawOneOf(b, name) !== undefined);
  if (withProp.length === 0) {
    return undefined;
  }
  const block = winningBase(withProp);
  const property = rawOneOf(block, name);
  if (property === undefined) {
    return undefined;
  }
  return { block, property };
}

// Best-effort instant for pairing raw RECURRENCE-IDs with parsed overrides.
// Returns null for exotic zones (caller falls back to positional pairing).
function tryRawInstant(
  value: RawDateTime,
  floatZone: string,
): number | null {
  try {
    if (value.kind === "date" || value.parts === undefined) {
      return null;
    }
    if (value.kind === "utc") {
      return Date.UTC(
        value.parts.year,
        value.parts.month - 1,
        value.parts.day,
        value.parts.hour,
        value.parts.minute,
        value.parts.second,
      );
    }
    if (value.kind === "floating") {
      return wallToMs(floatZone, value.parts);
    }
    return value.tzid === undefined
      ? null
      : wallToMs(resolveZoneName(value.tzid), value.parts);
  } catch {
    return null;
  }
}

function pairOverrides(
  raws: RawEvent[],
  parsed: ParsedOverride[],
  floatZone: string,
  uidLabel: string,
  positionalOnly: boolean,
): OverrideMember[] {
  if (!positionalOnly) {
    const remaining = [...raws];
    const members: OverrideMember[] = [];
    const deferred: ParsedOverride[] = [];
    for (const po of parsed) {
      // Several raw blocks can target the same instance (SEQUENCE updates of
      // one override): keep the newest, mirroring the parser. All blocks were
      // validated already, so dropping superseded updates loses nothing.
      const hits: number[] = [];
      for (let i = 0; i < remaining.length; i += 1) {
        const recProp = rawOneOf(remaining[i], "RECURRENCE-ID");
        if (recProp === undefined) {
          continue;
        }
        const rawRec = parseRawDate(recProp.value, recProp.params);
        const same =
          po.recIdMs !== null &&
          rawRec.kind !== "date" &&
          tryRawInstant(rawRec, floatZone) === po.recIdMs;
        const sameDay =
          po.recIdDate !== null &&
          rawRec.kind === "date" &&
          rawRec.date === po.recIdDate;
        if (same || sameDay) {
          hits.push(i);
        }
      }
      if (hits.length > 0) {
        // Newest SEQUENCE wins, later blocks win ties.
        let winner = hits[0];
        for (const candidate of hits.slice(1)) {
          const prev = remaining[winner];
          const next = remaining[candidate];
          if (sequenceOf(next) >= sequenceOf(prev)) {
            winner = candidate;
          }
        }
        const hit = remaining[winner];
        members.push({
          event: po.parsed,
          raw: hit,
          recIdMs: po.recIdMs,
          recIdDate: po.recIdDate,
        });
        for (const doomed of [...hits].sort((a, b) => b - a)) {
          remaining.splice(doomed, 1);
        }
      } else {
        deferred.push(po);
      }
    }
    if (deferred.length === 0 && remaining.length === 0) {
      return members;
    }
    // Exotic zones defeat instant matching: pair leftovers positionally.
    if (deferred.length !== remaining.length) {
      throw new IcsNormalizeError(
        `ambiguous RECURRENCE-ID overrides (${uidLabel})`,
      );
    }
    const tail = deferred.map((po, i) => ({
      event: po.parsed,
      raw: remaining[i],
      recIdMs: po.recIdMs,
      recIdDate: po.recIdDate,
    }));
    return [...members, ...tail];
  }
  if (parsed.length !== raws.length) {
    throw new IcsNormalizeError(
      `ambiguous detached RECURRENCE-ID overrides (${uidLabel})`,
    );
  }
  return parsed.map((po, i) => ({
    event: po.parsed,
    raw: raws[i],
    recIdMs: po.recIdMs,
    recIdDate: po.recIdDate,
  }));
}

function fallbackUid(block: RawEvent): string {
  const dtstart = rawOneOf(block, "DTSTART");
  const dtend = rawOneOf(block, "DTEND");
  const duration = rawOneOf(block, "DURATION");
  const summary = rawOneOf(block, "SUMMARY");
  const rrule = rawOneOf(block, "RRULE");
  const tuple: unknown[] = [
    "ics-fallback-v1",
    dtstart === undefined ? null : `DTSTART;${dtstart.params}:${dtstart.value}`,
    dtend === undefined ? null : `DTEND;${dtend.params}:${dtend.value}`,
    duration === undefined ? null : `DURATION:${duration.value}`,
    summary === undefined ? null : summary.value,
    rrule === undefined ? null : `RRULE:${rrule.value}`,
    rawPropertiesOf(block, "RDATE").map((p) => `RDATE;${p.params}:${p.value}`),
  ];
  const hash = createHash("sha256")
    .update(JSON.stringify(tuple), "utf8")
    .digest("hex");
  return `fallback:${hash}`;
}

// ---------------------------------------------------------------------------
// normalizeIcs
// ---------------------------------------------------------------------------

// Host-local calendar-day helpers for all-day RRULE ranges. All-day DATE
// values are timezone-free; host-local components round-trip the DATE in
// every host timezone, and strict string filtering keeps results exact.
function hostLocalDay(dateStr: string, endOfDay: boolean): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match === null) {
    throw new IcsNormalizeError(`invalid calendar date "${dateStr}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return endOfDay
    ? new Date(year, month, day, 23, 59, 59, 999)
    : new Date(year, month, day);
}

function hostDayString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

type PendingInstance = {
  uid: string;
  recId: string | undefined;
  title: string;
  location: string | undefined;
  range: EffectiveRange;
  // Source timezone name for timed ranges; Berlin for all-day ranges.
  timezone: string;
  sortKey: number;
};

export function normalizeIcs(
  text: string,
  window: CalendarWindow,
  defaultTimezone: string,
): NormalizedCalendarEvent[] {
  const resolvedDefault = resolveZoneName(defaultTimezone);
  const winStartMs = window.fromMs;
  const winEndMs = window.toMs;
  if (winEndMs < winStartMs) {
    throw new IcsNormalizeError("calendar window ends before it starts");
  }
  if (winEndMs === winStartMs) {
    return [];
  }

  const raw = scanRawCalendar(text);
  // Validate every relevant event before trusting any parser output.
  for (const block of raw.events) {
    const uidProp = rawOneOf(block, "UID");
    const label =
      uidProp === undefined || uidProp.value === ""
        ? "missing UID"
        : `UID ${uidProp.value}`;
    validateRawBlock(block, label);
  }

  // Floating times need the source zone: X-WR-TIMEZONE wins, else the caller
  // default (Berlin in production). Resolved only when actually used so an
  // unknown WR-TIMEZONE cannot break feeds without floating times.
  let cachedFloatZone: string | undefined;
  const floatZoneOf = (): string => {
    if (cachedFloatZone === undefined) {
      cachedFloatZone =
        raw.wrTimezone === undefined
          ? resolvedDefault
          : resolveZoneName(raw.wrTimezone);
    }
    return cachedFloatZone;
  };
  const usesFloating = raw.events.some((block) =>
    (["DTSTART", "DTEND", "RECURRENCE-ID"] as const).some((name) => {
      const prop = rawOneOf(block, name);
      return (
        prop !== undefined &&
        parseRawDate(prop.value, prop.params).kind === "floating"
      );
    }) ||
    (["EXDATE", "RDATE"] as const).some((name) =>
      rawPropertiesOf(block, name).some((prop) =>
        prop.value.split(",").some((part) => {
          const trimmed = part.trim();
          if (trimmed === "") {
            return false;
          }
          // For PERIOD values only the start carries the zone context.
          const head = trimmed.includes("/") ? trimmed.split("/")[0] : trimmed;
          if (head.startsWith("P")) {
            return false;
          }
          return parseRawDate(head, prop.params).kind === "floating";
        }),
      ),
    ),
  );
  const floatZone = usesFloating ? floatZoneOf() : resolvedDefault;

  let parsed: Record<string, unknown>;
  try {
    parsed = icalSync.parseICS(injectSyntheticUids(text, raw)) as Record<
      string,
      unknown
    >;
  } catch (error) {
    throw new IcsNormalizeError(
      `ICS parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Correlate parsed components with raw blocks.
  const rawByUid = new Map<string, RawEvent[]>();
  for (const block of raw.events) {
    const uidProp = rawOneOf(block, "UID");
    if (uidProp !== undefined && uidProp.value !== "") {
      const key = unescapeText(uidProp.value);
      if (key === "__proto__") {
        throw new IcsNormalizeError("unsupported UID value");
      }
      const list = rawByUid.get(key) ?? [];
      list.push(block);
      rawByUid.set(key, list);
    }
  }

  type ParsedEntry = { key: string; event: Record<string, unknown> };
  const entries: ParsedEntry[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "vcalendar") {
      continue;
    }
    const record = asRecord(value);
    if (record === null || record["type"] !== "VEVENT") {
      continue;
    }
    entries.push({ key, event: record });
  }

  const groups: EventGroup[] = [];
  for (const { key, event } of entries) {
    const parsedUid = asText(event["uid"]) ?? "";
    if (parsedUid !== key) {
      throw new IcsNormalizeError("ambiguous parser component key");
    }
    const index = syntheticIndex(key);
    if (index !== null) {
      const block = raw.events[index];
      if (block === undefined) {
        throw new IcsNormalizeError("ambiguous UID-less event");
      }
      const recProp = rawOneOf(block, "RECURRENCE-ID");
      const parsedOverrides = uniqueOverrides(event["recurrences"], "missing UID");
      if (recProp === undefined && asDate(event["recurrenceid"]) === null) {
        groups.push({
          uid: fallbackUid(block),
          label: "missing UID",
          baseRaw: block,
          baseBlocks: [block],
          parsedBase: event,
          members: pairOverrides([], parsedOverrides, floatZone, "missing UID", true),
          orphan: false,
        });
      } else {
        // UID-less override without a series: standalone occurrence.
        const self: ParsedOverride = { parsed: event, ...overrideIdentity(event) };
        const members = pairOverrides([block], [self], floatZone, "missing UID", true);
        groups.push({
          uid: fallbackUid(block),
          label: "missing UID",
          baseRaw: null,
          baseBlocks: [],
          parsedBase: event,
          members,
          orphan: true,
        });
      }
      continue;
    }
    const blocks = rawByUid.get(key);
    if (blocks === undefined || blocks.length === 0) {
      throw new IcsNormalizeError(`ambiguous event for UID "${key}"`);
    }
    const baseBlocks = blocks.filter(
      (b) => rawOneOf(b, "RECURRENCE-ID") === undefined,
    );
    const overrideBlocks = blocks.filter(
      (b) => rawOneOf(b, "RECURRENCE-ID") !== undefined,
    );
    const parsedOverrides = uniqueOverrides(event["recurrences"], `UID ${key}`);
    if (baseBlocks.length === 0) {
      // Detached RECURRENCE-IDs without a series in this feed.
      const orphanItself = asDate(event["recurrenceid"]) !== null;
      const self: ParsedOverride = { parsed: event, ...overrideIdentity(event) };
      const allParsed: ParsedOverride[] = orphanItself
        ? [self, ...parsedOverrides]
        : parsedOverrides;
      groups.push({
        uid: key,
        label: `UID ${key}`,
        baseRaw: null,
        baseBlocks: [],
        parsedBase: event,
        members: pairOverrides(overrideBlocks, allParsed, floatZone, `UID ${key}`, true),
        orphan: true,
      });
      continue;
    }
    groups.push({
      uid: key,
      label: `UID ${key}`,
      baseRaw: winningBase(baseBlocks),
      baseBlocks,
      parsedBase: event,
      members: pairOverrides(overrideBlocks, parsedOverrides, floatZone, `UID ${key}`, false),
      orphan: false,
    });
  }

  const pending: PendingInstance[] = [];
  const overlaps = (range: EffectiveRange): boolean =>
    range.allDay
      ? range.startDate < window.toDate && range.endDate > window.fromDate
      : range.startMs < winEndMs && range.endMs > winStartMs;
  const sortKeyOf = (range: EffectiveRange): number =>
    range.allDay ? Date.parse(`${range.startDate}T00:00:00Z`) : range.startMs;

  const pushInstance = (
    uid: string,
    recId: string | undefined,
    title: string,
    location: string | undefined,
    range: EffectiveRange,
    emitted: Set<string>,
  ): void => {
    if (!overlaps(range)) {
      return;
    }
    const key = occurrenceKey(uid, recId);
    if (emitted.has(key)) {
      return;
    }
    emitted.add(key);
    pending.push({
      uid,
      recId,
      title,
      location,
      range,
      timezone: range.allDay ? BERLIN_TIMEZONE : range.timezone,
      sortKey: sortKeyOf(range),
    });
    if (pending.length > MAX_ICS_OCCURRENCES) {
      throw new IcsNormalizeError(
        `feed exceeds the ${MAX_ICS_OCCURRENCES} occurrence limit (no partial success)`,
      );
    }
  };

  for (const group of groups) {
    const emitted = new Set<string>();
    const baseTitle = asText(group.parsedBase["summary"]) ?? "";
    const baseLoc = asText(group.parsedBase["location"]) ?? undefined;
    const locationOf = (
      parsed: Record<string, unknown>,
    ): string | undefined => asText(parsed["location"]) ?? baseLoc;
    const titleOf = (parsed: Record<string, unknown>): string =>
      asText(parsed["summary"]) ?? baseTitle;

    if (group.orphan) {
      for (const member of group.members) {
        if (statusOf(member.event) === "CANCELLED") {
          continue;
        }
        const range = effectiveRange(
          member.raw,
          member.event,
          floatZone,
          group.label,
        );
        pushInstance(
          group.uid,
          overrideRecId(member.event),
          titleOf(member.event),
          locationOf(member.event),
          range,
          emitted,
        );
      }
      continue;
    }

    const baseRaw = group.baseRaw;
    if (baseRaw === null) {
      throw new IcsNormalizeError(`series without base event (${group.label})`);
    }
    // Merged property view: SEQUENCE updates across same-UID blocks resolve
    // per property, mirroring the parser merge.
    const startProp = propWinner(group.baseBlocks, "DTSTART");
    if (startProp === undefined) {
      throw new IcsNormalizeError(`series without DTSTART (${group.label})`);
    }
    const base = effectiveRangeFromProps(
      startProp.property,
      propWinner(group.baseBlocks, "DTEND")?.property,
      propWinner(group.baseBlocks, "DURATION")?.property,
      group.parsedBase,
      floatZone,
      `${group.label} #${startProp.block.index}`,
    );
    if (statusOf(group.parsedBase) === "CANCELLED") {
      continue;
    }

    const consumed = new Set<OverrideMember>();
    const exdates = buildExdateSets(group.baseBlocks, floatZone, group.label);
    let cachedSeriesZone: string | null = null;
    const seriesZoneOf = (): string => {
      if (cachedSeriesZone === null) {
        const start = parseRawDate(
          startProp.property.value,
          startProp.property.params,
        );
        cachedSeriesZone =
          start.kind === "utc"
            ? "Etc/UTC"
            : start.kind === "floating"
              ? floatZone
              : resolveZoneName(start.tzid ?? "");
      }
      return cachedSeriesZone;
    };

    const findMember = (
      recMs: number | null,
      recDate: string | null,
    ): OverrideMember | undefined =>
      group.members.find(
        (m) =>
          (recMs !== null && m.recIdMs === recMs) ||
          (recDate !== null && m.recIdDate === recDate),
      );

    const applyMember = (member: OverrideMember): void => {
      consumed.add(member);
      // A cancelled override deletes the instance (it must not fall back to
      // the regular occurrence either).
      if (statusOf(member.event) === "CANCELLED") {
        return;
      }
      const actual = effectiveRange(
        member.raw,
        member.event,
        floatZone,
        group.label,
      );
      pushInstance(
        group.uid,
        overrideRecId(member.event),
        titleOf(member.event),
        locationOf(member.event),
        actual,
        emitted,
      );
    };

    const excludedByExdate = (range: EffectiveRange): boolean => {
      if (range.allDay) {
        return exdates.dates.has(range.startDate);
      }
      if (exdates.instants.has(range.startMs)) {
        return true;
      }
      // A DATE EXDATE excludes the whole calendar day in the series zone.
      return (
        exdates.dates.size > 0 &&
        exdates.dates.has(wallDateInZone(seriesZoneOf(), range.startMs))
      );
    };

    const rruleProp = propWinner(group.baseBlocks, "RRULE")?.property;
    const rdateSpecs = readRdateSpecs(group.parsedBase["rdate"], group.label);

    if (rruleProp === undefined && rdateSpecs.length === 0) {
      pushInstance(group.uid, undefined, baseTitle, baseLoc, base, emitted);
    } else {
      if (rruleProp !== undefined) {
        const opts = readRruleOptions(
          group.parsedBase["rrule"],
          rruleProp.value,
          group.label,
          base.allDay,
        );
        const handle = group.parsedBase["rrule"] as unknown as {
          between: (after: Date, before: Date, inclusive: boolean) => unknown;
        };
        if (base.allDay) {
          const days = diffDays(base.startDate, base.endDate);
          const pad = days + 2;
          const fromDate = addDays(window.fromDate, -pad);
          const toDate = addDays(window.toDate, pad);
          const estimate = estimateRruleCount(
            opts,
            Date.parse(`${fromDate}T00:00:00Z`),
            Date.parse(`${toDate}T00:00:00Z`) + DAY_MS,
          );
          if (estimate > MAX_ICS_OCCURRENCES) {
            throw new IcsNormalizeError(
              `series exceeds the ${MAX_ICS_OCCURRENCES} occurrence limit (${group.label})`,
            );
          }
          const generated = handle.between(
            hostLocalDay(fromDate, false),
            hostLocalDay(toDate, true),
            true,
          );
          if (!Array.isArray(generated)) {
            throw new IcsNormalizeError(
              `recurrence expansion failed (${group.label})`,
            );
          }
          if (generated.length > MAX_ICS_OCCURRENCES) {
            throw new IcsNormalizeError(
              `series exceeds the ${MAX_ICS_OCCURRENCES} occurrence limit (${group.label})`,
            );
          }
          for (const item of generated) {
            const date = asDate(item);
            if (date === null) {
              throw new IcsNormalizeError(
                `recurrence expansion failed (${group.label})`,
              );
            }
            const occDate = hostDayString(date);
            if (occDate < fromDate || occDate > toDate) {
              continue;
            }
            const member = findMember(null, occDate);
            // An override replaces the instance even when the original date
            // is EXDATE-listed (reschedule wins over the exception entry).
            if (member !== undefined) {
              applyMember(member);
              continue;
            }
            if (exdates.dates.has(occDate)) {
              continue;
            }
            pushInstance(
              group.uid,
              occDate,
              baseTitle,
              baseLoc,
              {
                allDay: true,
                startDate: occDate,
                endDate: addDays(occDate, days),
              },
              emitted,
            );
          }
        } else {
          const durMs = base.endMs - base.startMs;
          const searchFrom = winStartMs - durMs;
          const estimate = estimateRruleCount(opts, searchFrom, winEndMs);
          if (estimate > MAX_ICS_OCCURRENCES) {
            throw new IcsNormalizeError(
              `series exceeds the ${MAX_ICS_OCCURRENCES} occurrence limit (${group.label})`,
            );
          }
          const generated = handle.between(
            new Date(searchFrom),
            new Date(winEndMs),
            true,
          );
          if (!Array.isArray(generated)) {
            throw new IcsNormalizeError(
              `recurrence expansion failed (${group.label})`,
            );
          }
          if (generated.length > MAX_ICS_OCCURRENCES) {
            throw new IcsNormalizeError(
              `series exceeds the ${MAX_ICS_OCCURRENCES} occurrence limit (${group.label})`,
            );
          }
          for (const item of generated) {
            const date = asDate(item);
            if (date === null) {
              throw new IcsNormalizeError(
                `recurrence expansion failed (${group.label})`,
              );
            }
            const occMs = date.getTime();
            const member = findMember(occMs, null);
            if (member !== undefined) {
              applyMember(member);
              continue;
            }
            if (excludedByExdate({ allDay: false, startMs: occMs, endMs: occMs, timezone: seriesZoneOf() })) {
              continue;
            }
            pushInstance(
              group.uid,
              basicUtc(occMs),
              baseTitle,
              baseLoc,
              {
                allDay: false,
                startMs: occMs,
                endMs: occMs + durMs,
                timezone: seriesZoneOf(),
              },
              emitted,
            );
          }
        }
      }
      if (rdateSpecs.length > 0) {
        for (const range of expandRdates(
          rdateSpecs,
          base,
          floatZone,
          group.label,
        )) {
          const member = findMember(
            range.allDay ? null : range.startMs,
            range.allDay ? range.startDate : null,
          );
          if (member !== undefined) {
            applyMember(member);
            continue;
          }
          if (excludedByExdate(range)) {
            continue;
          }
          pushInstance(
            group.uid,
            range.allDay ? range.startDate : basicUtc(range.startMs),
            baseTitle,
            baseLoc,
            range,
            emitted,
          );
        }
      }
      // Detached overrides whose original instance never expanded (moved out
      // of the RRULE range or into the window from outside it).
      for (const member of group.members) {
        if (consumed.has(member)) {
          continue;
        }
        if (statusOf(member.event) === "CANCELLED") {
          continue;
        }
        const actual = effectiveRange(
          member.raw,
          member.event,
          floatZone,
          group.label,
        );
        pushInstance(
          group.uid,
          overrideRecId(member.event),
          titleOf(member.event),
          locationOf(member.event),
          actual,
          emitted,
        );
      }
    }
  }

  pending.sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    if (a.uid !== b.uid) {
      return a.uid < b.uid ? -1 : 1;
    }
    const aRec = a.recId ?? "";
    const bRec = b.recId ?? "";
    return aRec < bRec ? -1 : aRec > bRec ? 1 : 0;
  });

  return pending.map((item): NormalizedCalendarEvent => {
    const identityQuality: CalendarIdentityQuality = item.uid.startsWith(
      "fallback:",
    )
      ? "fallback"
      : "provider";
    // The internal series zone uses "Etc/UTC"; the contract reports UTC
    // instants as "UTC".
    const timezone = item.timezone === "Etc/UTC" ? "UTC" : item.timezone;
    const location =
      item.location !== undefined && item.location !== ""
        ? { location: item.location }
        : {};
    if (item.range.allDay) {
      return {
        key: occurrenceKey(item.uid, item.recId),
        uid: item.uid,
        identityQuality,
        recurrenceId: item.recId,
        title: item.title,
        ...location,
        startMs: berlinMidnightMs(item.range.startDate),
        endMs: berlinMidnightMs(item.range.endDate),
        allDay: true,
        timezone,
        startDate: item.range.startDate,
        endDate: item.range.endDate,
      };
    }
    return {
      key: occurrenceKey(item.uid, item.recId),
      uid: item.uid,
      identityQuality,
      recurrenceId: item.recId,
      title: item.title,
      ...location,
      startMs: item.range.startMs,
      endMs: item.range.endMs,
      allDay: false,
      timezone,
    };
  });
}

function overrideIdentity(event: Record<string, unknown>): {
  recIdMs: number | null;
  recIdDate: string | null;
} {
  const recId = asDate(event["recurrenceid"]);
  if (recId === null) {
    return { recIdMs: null, recIdDate: null };
  }
  const dateOnly = (recId as { dateOnly?: unknown }).dateOnly === true;
  return {
    recIdMs: dateOnly ? null : recId.getTime(),
    recIdDate: dateOnly
      ? `${recId.getFullYear()}-${String(recId.getMonth() + 1).padStart(2, "0")}-${String(recId.getDate()).padStart(2, "0")}`
      : null,
  };
}

function overrideRecId(parsed: Record<string, unknown>): string | undefined {
  const { recIdMs, recIdDate } = overrideIdentity(parsed);
  if (recIdMs !== null) {
    return basicUtc(recIdMs);
  }
  return recIdDate ?? undefined;
}


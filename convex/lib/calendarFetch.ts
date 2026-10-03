"use node";

// Central calendar fetch transport (Task 4 of the calendar pilot).
//
// Node-only module: fetching, timeout, full-stream size accounting and
// structured failure classification live here, without any Convex DB
// imports, so plain Node unit tests can drive it with a synthetic fetch.
// The thin action wrapper (convex/calendarFetch.ts) claims the commit
// permission, resolves the server-side feed address, and stages/publishes.
//
// Redaction: thrown messages never contain the feed address, query secrets
// or provider payloads — only the failure class, the HTTP status and the
// configured bounds.

import type {
  CalendarWindow,
  NormalizedCalendarEvent,
} from "./calendarTypes.js";
import { BERLIN_TIMEZONE } from "./calendarTypes.js";
import { IcsNormalizeError, normalizeIcs } from "./ics.js";

// HTTP timeout per provider fetch (plan section "Grenzen und Defaults").
export const FETCH_TIMEOUT_MS = 20000;
// An ICS response is read completely; larger bodies are an error, never a
// silently truncated success.
export const MAX_ICS_BYTES = 32 * 1024 * 1024;
// Staging bounds for one stage() call (plan section "Grenzen und Defaults").
export const MAX_STAGE_EVENTS = 100;
export const MAX_STAGE_BYTES = 256 * 1024;
// A pathological Retry-After must not stall a source beyond one day.
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

export type CalendarFetchErrorClass =
  | "timeout"
  | "network"
  | "rateLimited"
  | "server"
  | "auth"
  | "parse"
  | "tooLarge";

// Structured transport failure. message is pre-redacted (no URLs, secrets
// or provider payloads); retryAfterMs carries a parsed Retry-After hint.
export class CalendarFetchError extends Error {
  readonly errorClass: CalendarFetchErrorClass;
  readonly retryAfterMs?: number;

  constructor(
    errorClass: CalendarFetchErrorClass,
    message: string,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "CalendarFetchError";
    this.errorClass = errorClass;
    if (retryAfterMs !== undefined) {
      this.retryAfterMs = retryAfterMs;
    }
  }
}

export type FetchCalendarOptions = {
  timeoutMs?: number;
};

// Only server-configured HTTPS feed addresses are accepted. webcal:// is
// the conventional ICS scheme and resolves to https://; anything else that
// is not HTTPS (plain http, file, data, ...) is a configuration error and
// is never fetched. Configuration errors (invalid URL, non-HTTPS address,
// unset env binding) classify as "auth".
function resolveFeedUrl(url: string): string {
  const trimmed = url.trim();
  const schemeLength = "webcal://".length;
  const https =
    trimmed.toLowerCase().startsWith("webcal://")
      ? `https://${trimmed.slice(schemeLength)}`
      : trimmed;
  let parsed: URL;
  try {
    parsed = new URL(https);
  } catch {
    throw new CalendarFetchError(
      "auth",
      "calendar feed address is not a valid URL",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new CalendarFetchError(
      "auth",
      "calendar feed address must use HTTPS",
    );
  }
  return parsed.toString();
}

// delay-seconds form of Retry-After; HTTP dates are ignored (no floor hint).
function parseRetryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (raw === null || !/^\d+$/.test(raw.trim())) {
    return undefined;
  }
  const seconds = Number(raw.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

function classifyStatus(status: number, headers: Headers): never {
  if (status === 401 || status === 403) {
    throw new CalendarFetchError(
      "auth",
      `calendar provider rejected the request (status ${String(status)})`,
    );
  }
  if (status === 429) {
    throw new CalendarFetchError(
      "rateLimited",
      `calendar provider is rate limiting requests (status ${String(status)})`,
      parseRetryAfterMs(headers),
    );
  }
  if (status >= 500 && status <= 599) {
    throw new CalendarFetchError(
      "server",
      `calendar provider reported a temporary error (status ${String(status)})`,
    );
  }
  throw new CalendarFetchError(
    "server",
    `calendar provider request failed (status ${String(status)})`,
  );
}

// Read the whole body while accounting every byte. Provider Content-Length
// or ETags are never trusted: acceptance requires the complete stream.
// The abort signal bounds the body read as well as the connect+headers
// phase: each read races the signal, so a slow-dribbling body cannot
// outlive the timeout even when the Response stream ignores the signal.
async function readBoundedText(
  response: Response,
  signal?: AbortSignal,
): Promise<string> {
  if (response.body === null) {
    const text =
      signal === undefined
        ? await response.text()
        : await raceWithAbort(response.text(), signal);
    if (new TextEncoder().encode(text).length > MAX_ICS_BYTES) {
      throw new CalendarFetchError(
        "tooLarge",
        "calendar response exceeds the 32MiB limit",
      );
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const pending = reader.read();
      const { done, value } =
        signal === undefined ? await pending : await raceWithAbort(pending, signal);
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MAX_ICS_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new CalendarFetchError(
          "tooLarge",
          "calendar response exceeds the 32MiB limit",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
    }
    throw error;
  }
  reader.releaseLock();
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

// Reject as soon as signal aborts, independent of whether the underlying
// stream honors the fetch abort signal (synthetic Responses ignore it).
function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

// Fetch one feed and normalize it through the real ICS parser. Throws
// CalendarFetchError for transport/bound violations and IcsNormalizeError
// for malformed feeds (callers map those to the parse class). Never
// resolves partial success: either the whole feed normalizes or it throws.
export async function fetchAndNormalizeCalendar(
  url: string,
  window: CalendarWindow,
  fetchImpl: typeof fetch = fetch,
  options: FetchCalendarOptions = {},
): Promise<NormalizedCalendarEvent[]> {
  const resolved = resolveFeedUrl(url);
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  // The timer spans connect+headers AND the body read: it is cleared only
  // after readBoundedText resolves, so a slow-dribbling body is aborted.
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(resolved, {
        signal: controller.signal,
        headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      });
    } catch {
      if (controller.signal.aborted) {
        throw new CalendarFetchError(
          "timeout",
          `calendar fetch timed out after ${String(timeoutMs)}ms`,
        );
      }
      throw new CalendarFetchError(
        "network",
        "calendar server could not be reached",
      );
    }
    // Automatic redirects are followed, but the final address must still be
    // server-grade HTTPS. Synthetic responses carry no URL and skip the check.
    const finalUrl = response.url === "" ? resolved : response.url;
    try {
      if (new URL(finalUrl).protocol !== "https:") {
        throw new CalendarFetchError(
          "auth",
          "calendar redirect target must use HTTPS",
        );
      }
    } catch (error) {
      if (error instanceof CalendarFetchError) {
        throw error;
      }
      throw new CalendarFetchError(
        "auth",
        "calendar redirect target is not a valid URL",
      );
    }
    if (!response.ok) {
      classifyStatus(response.status, response.headers);
    }
    let text: string;
    try {
      text = await readBoundedText(response, controller.signal);
    } catch (error) {
      if (error instanceof CalendarFetchError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new CalendarFetchError(
          "timeout",
          `calendar fetch timed out after ${String(timeoutMs)}ms`,
        );
      }
      throw error;
    }
    try {
      return normalizeIcs(text, window, BERLIN_TIMEZONE);
    } catch (error) {
      if (
        error instanceof IcsNormalizeError &&
        /occurrence limit/.test(error.message)
      ) {
        // More than 2000 occurrences: an error, never a truncated success.
        throw new CalendarFetchError(
          "tooLarge",
          "calendar feed exceeds the 2000 occurrence limit",
        );
      }
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

// Split normalized events into stage() batches of at most MAX_STAGE_EVENTS
// rows and MAX_STAGE_BYTES serialized JSON. Sizes are UTF-8 bytes (the unit
// the Convex argument limit counts), not JS string length: multibyte titles
// would otherwise let a batch overflow the bound. A single event larger than
// the byte bound is emitted alone so the caller can reject it as tooLarge.
const utf8Bytes = new TextEncoder();
export function chunkForStaging(
  events: NormalizedCalendarEvent[],
): NormalizedCalendarEvent[][] {
  const batches: NormalizedCalendarEvent[][] = [];
  let current: NormalizedCalendarEvent[] = [];
  let currentBytes = 2; // JSON "[]"
  for (const event of events) {
    const eventBytes = utf8Bytes.encode(JSON.stringify(event)).length;
    const grown =
      current.length === 0
        ? eventBytes + 2
        : currentBytes + 1 + eventBytes; // comma separator
    if (current.length >= MAX_STAGE_EVENTS || grown > MAX_STAGE_BYTES) {
      if (current.length > 0) {
        batches.push(current);
        current = [];
        currentBytes = 2;
      }
    }
    current.push(event);
    currentBytes =
      current.length === 1 ? eventBytes + 2 : currentBytes + 1 + eventBytes;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Fetch cycle orchestration (thin-action logic, backend-agnostic)
// ---------------------------------------------------------------------------

// The claim handed to one cycle: commit permission plus the window and the
// fingerprint of the currently published stand.
export type FetchCycleClaim = {
  window: CalendarWindow;
  urlEnvKey: string;
  previousFingerprint?: string;
};

// The generation-guarded commit surface. The real action binds these to
// claim/stage/publish/publishUnchanged/fail mutations; unit tests bind
// fakes and assert exactly which commits a cycle performs.
export type FetchCycleStore = {
  stage: (
    batchIndex: number,
    events: NormalizedCalendarEvent[],
  ) => Promise<{ accepted: boolean }>;
  publish: (
    batchCount: number,
    eventCount: number,
    contentFingerprint: string,
  ) => Promise<{ accepted: boolean }>;
  publishUnchanged: (
    contentFingerprint: string,
  ) => Promise<{ accepted: boolean }>;
  fail: (
    errorClass: CalendarFetchErrorClass,
    retryAfterMs?: number,
  ) => Promise<unknown>;
};

export type FetchCycleResult = "published" | "unchanged" | "failed";

// Run one fetch cycle: resolve the server-side feed address, fetch and
// normalize the whole response, then commit changed (stage batches +
// publish) or unchanged (publishUnchanged, same fingerprint). A rejected
// unchanged commit (the Berlin window moved on) falls through to a full
// publish. Known failures report a classified failure; anything else throws
// a redacted CalendarFetchError after reporting "server" so the action
// wrapper can log only the opaque source id.
export async function runFetchCycle(
  claim: FetchCycleClaim,
  env: Record<string, string | undefined>,
  store: FetchCycleStore,
  fingerprintOf: (
    window: { fromDate: string; toDate: string },
    events: NormalizedCalendarEvent[],
  ) => string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchCycleResult> {
  const rawUrl = env[claim.urlEnvKey];
  if (rawUrl === undefined || rawUrl.trim() === "") {
    // Unset env binding: a configuration error, classified as "auth".
    await store.fail("auth");
    return "failed";
  }
  let events: NormalizedCalendarEvent[];
  try {
    events = await fetchAndNormalizeCalendar(rawUrl, claim.window, fetchImpl);
  } catch (error) {
    if (error instanceof CalendarFetchError) {
      await store.fail(error.errorClass, error.retryAfterMs);
      return "failed";
    }
    if (error instanceof IcsNormalizeError) {
      await store.fail("parse");
      return "failed";
    }
    await store.fail("server");
    throw new CalendarFetchError(
      "server",
      "calendar fetch failed unexpectedly",
    );
  }

  const fingerprint = fingerprintOf(
    { fromDate: claim.window.fromDate, toDate: claim.window.toDate },
    events,
  );
  if (
    claim.previousFingerprint !== undefined &&
    fingerprint === claim.previousFingerprint
  ) {
    const unchanged = await store.publishUnchanged(fingerprint);
    if (unchanged.accepted) {
      return "unchanged";
    }
  }

  const batches = chunkForStaging(events);
  for (const [index, batch] of batches.entries()) {
    if (batch.length === 1 && utf8Bytes.encode(JSON.stringify(batch)).length > MAX_STAGE_BYTES) {
      // A single event that cannot be staged within the argument bound.
      await store.fail("tooLarge");
      return "failed";
    }
    const staged = await store.stage(index, batch);
    if (!staged.accepted) {
      // Lease expired or generation revoked mid-flight: fail closed
      // without reporting (fail() would reject as well).
      return "failed";
    }
  }
  const published = await store.publish(
    batches.length,
    events.length,
    fingerprint,
  );
  return published.accepted ? "published" : "failed";
}

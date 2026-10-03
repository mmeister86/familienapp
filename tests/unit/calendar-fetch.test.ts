// Transport tests for the central calendar fetch (Task 4).
//
// These tests pin the fetch/normalize transport before it exists (TDD RED
// phase): a Node-only helper fetches one ICS feed with a bounded timeout,
// accounts the full stream size, classifies structured failures without
// leaking URLs, resolves webcal:// to HTTPS, rejects non-HTTPS addresses,
// and normalizes through the real ICS parser. Failed parses reject instead
// of resolving partial success (the action therefore never stages them).
//
// The last block validates the synthetic CalendarFeedV1 contract fixture
// that Task 5 consumes: same top-level shape the live feed serves, sorted
// calendars, referentially intact ids, and no secrets.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  berlinMidnightMs,
  occurrenceKey,
} from "../../convex/lib/calendarPolicy.js";
import { addDays } from "../../convex/lib/dates.js";
import type { CalendarWindow } from "../../convex/lib/calendarTypes.js";
import {
  CalendarFetchError,
  FETCH_TIMEOUT_MS,
  MAX_ICS_BYTES,
  chunkForStaging,
  fetchAndNormalizeCalendar,
  runFetchCycle,
  type FetchCycleClaim,
  type FetchCycleStore,
} from "../../convex/lib/calendarFetch.js";
import { contentFingerprint } from "../../convex/lib/calendarFingerprint.js";
import { calendarFeedV1Validator } from "../../convex/lib/calendarValidators.js";

const SECRET_URL = "https://cal.example.com/feed.ics?token=secret123";

function octoberWindow(): CalendarWindow {
  const fromDate = "2026-10-01";
  const toDate = "2026-11-12";
  return {
    fromDate,
    toDate,
    fromMs: berlinMidnightMs(fromDate),
    toMs: berlinMidnightMs(toDate),
  };
}

function loadCalendarFixture(name: string): string {
  return readFileSync(
    new URL(`../fixtures/calendars/${name}`, import.meta.url),
    "utf8",
  );
}

function okFetch(text: string): typeof fetch {
  return (async () => new Response(text, { status: 200 })) as typeof fetch;
}

function statusFetch(status: number, headers?: HeadersInit): typeof fetch {
  return (async () =>
    new Response("provider message", { status, headers })) as typeof fetch;
}

async function errorClassOf(promise: Promise<unknown>): Promise<string> {
  const failure = await promise.then(
    () => {
      throw new Error("expected the fetch to fail");
    },
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(CalendarFetchError);
  return (failure as CalendarFetchError).errorClass;
}

function expectRedacted(error: unknown): void {
  expect(error).toBeInstanceOf(CalendarFetchError);
  const message = (error as Error).message;
  expect(message).not.toContain("secret123");
  expect(message).not.toContain("cal.example.com");
}

describe("fetchAndNormalizeCalendar", () => {
  it("successfulFixture (real parser output for a small feed)", async () => {
    const events = await fetchAndNormalizeCalendar(
      SECRET_URL.replace("secret123", "ok"),
      octoberWindow(),
      okFetch(loadCalendarFixture("allday-exclusive-end.ics")),
    );
    expect(events).toHaveLength(2);
    const multi = events.find((event) => event.uid === "allday-1");
    expect(multi?.title).toBe("Autumn break");
    expect(multi?.allDay).toBe(true);
    expect(multi?.startDate).toBe("2026-10-02");
    expect(multi?.endDate).toBe("2026-10-04");
    expect(multi?.startMs).toBe(berlinMidnightMs("2026-10-02"));
    expect(multi?.endMs).toBe(berlinMidnightMs("2026-10-04"));
    expect(multi?.key).toBe(occurrenceKey("allday-1", undefined));
    const single = events.find((event) => event.uid === "allday-single-1");
    expect(single?.startDate).toBe("2026-10-06");
    expect(single?.endDate).toBe("2026-10-07");
  });

  it("http401IsAuth (and the failure never leaks the URL)", async () => {
    const failure = await fetchAndNormalizeCalendar(
      SECRET_URL,
      octoberWindow(),
      statusFetch(401),
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CalendarFetchError);
    expect((failure as CalendarFetchError).errorClass).toBe("auth");
    expectRedacted(failure);
  });

  it("http429IsRateLimited (Retry-After raises the floor)", async () => {
    const failure = await fetchAndNormalizeCalendar(
      SECRET_URL,
      octoberWindow(),
      statusFetch(429, { "Retry-After": "120" }),
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CalendarFetchError);
    expect((failure as CalendarFetchError).errorClass).toBe("rateLimited");
    expect((failure as CalendarFetchError).retryAfterMs).toBe(120000);
    expectRedacted(failure);
  });

  it("http503IsServer", async () => {
    expect(
      await errorClassOf(
        fetchAndNormalizeCalendar(
          SECRET_URL,
          octoberWindow(),
          statusFetch(503),
        ),
      ),
    ).toBe("server");
  });

  it("timeoutAbortsAHangingProvider", async () => {
    const hanging = ((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })) as unknown as typeof fetch;
    const startedAt = Date.now();
    const failure = await fetchAndNormalizeCalendar(
      SECRET_URL,
      octoberWindow(),
      hanging,
      { timeoutMs: 50 },
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CalendarFetchError);
    expect((failure as CalendarFetchError).errorClass).toBe("timeout");
    expect(Date.now() - startedAt).toBeLessThan(5000);
    expectRedacted(failure);
  });

  it("timeoutAbortsASlowBody (timer spans headers and body)", async () => {
    // Headers arrive at once, then the body dribbles forever: the timeout
    // must abort the body read, not just connect+headers.
    const slow = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode("BEGIN:VCALENDAR\r\n"),
          );
        },
        pull() {
          return new Promise<void>(() => {});
        },
      }),
      { status: 200 },
    );
    const dribble = (async () => slow) as unknown as typeof fetch;
    const startedAt = Date.now();
    const failure = await fetchAndNormalizeCalendar(
      SECRET_URL,
      octoberWindow(),
      dribble,
      { timeoutMs: 50 },
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CalendarFetchError);
    expect((failure as CalendarFetchError).errorClass).toBe("timeout");
    expect(Date.now() - startedAt).toBeLessThan(5000);
    expectRedacted(failure);
  });

  it("tooLargeBody (full-stream accounting, no truncation)", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const big = new Response(
      new ReadableStream({
        start(controller) {
          for (let index = 0; index < 33; index += 1) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
      { status: 200 },
    );
    const failure = await fetchAndNormalizeCalendar(
      SECRET_URL,
      octoberWindow(),
      (async () => big) as typeof fetch,
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CalendarFetchError);
    expect((failure as CalendarFetchError).errorClass).toBe("tooLarge");
    expectRedacted(failure);
  });

  it("webcalResolvesToHttps (plain http is never fetched)", async () => {
    let requested: string | null = null;
    const recording = (async (url: unknown) => {
      requested = String(url);
      return new Response(loadCalendarFixture("allday-exclusive-end.ics"), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const events = await fetchAndNormalizeCalendar(
      "webcal://cal.example.com/feed.ics",
      octoberWindow(),
      recording,
    );
    expect(requested).toBe("https://cal.example.com/feed.ics");
    expect(events).toHaveLength(2);

    let calls = 0;
    const refusing = (async () => {
      calls += 1;
      return new Response("", { status: 200 });
    }) as typeof fetch;
    const failure = await fetchAndNormalizeCalendar(
      "http://cal.example.com/feed.ics",
      octoberWindow(),
      refusing,
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    expect((failure as CalendarFetchError).errorClass).toBe("auth");
    expect(calls).toBe(0);
  });

  it("redirectToHttpIsRejected", async () => {
    const redirected = {
      ok: true,
      status: 200,
      url: "http://cal.example.com/landing",
      headers: new Headers(),
      body: null,
      text: async () => loadCalendarFixture("allday-exclusive-end.ics"),
    };
    const failure = await fetchAndNormalizeCalendar(
      SECRET_URL,
      octoberWindow(),
      (async () => redirected) as unknown as typeof fetch,
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CalendarFetchError);
    expect((failure as CalendarFetchError).errorClass).toBe("auth");
    expectRedacted(failure);
  });

  it("failedParseRejectsWithoutPartialSuccess", async () => {
    const failure = await fetchAndNormalizeCalendar(
      SECRET_URL,
      octoberWindow(),
      okFetch(loadCalendarFixture("malformed-truncated.ics")),
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    // A caller that stages only resolved events therefore never publishes.
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(CalendarFetchError);
    const message = (failure as Error).message;
    expect(message).not.toContain("secret123");
    expect(message).not.toContain("cal.example.com");
  });

  it("tooManyOccurrencesIsTooLarge", async () => {
    const failure = await fetchAndNormalizeCalendar(
      SECRET_URL,
      octoberWindow(),
      okFetch(loadCalendarFixture("too-many-occurrences.ics")),
    ).then(
      () => {
        throw new Error("expected the fetch to fail");
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CalendarFetchError);
    expect((failure as CalendarFetchError).errorClass).toBe("tooLarge");
    expectRedacted(failure);
  });

  it("boundedDefaults (20s timeout, 32MiB cap)", () => {
    expect(FETCH_TIMEOUT_MS).toBe(20000);
    expect(MAX_ICS_BYTES).toBe(32 * 1024 * 1024);
  });
});

describe("chunkForStaging", () => {
  it("splitsIntoBoundedBatches (<=100 events and <=256KiB serialized args)", async () => {
    const window = octoberWindow();
    const text = loadCalendarFixture("allday-exclusive-end.ics");
    const sample = await fetchAndNormalizeCalendar(
      "https://cal.example.com/ok.ics",
      window,
      okFetch(text),
    );
    const many = Array.from({ length: 250 }, (_, index) => ({
      ...sample[index % sample.length],
      key: occurrenceKey(`breadcrumb-${String(index)}`, undefined),
      uid: `breadcrumb-${String(index)}`,
    }));
    const batches = chunkForStaging(many);
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 50]);
    for (const batch of batches) {
      expect(JSON.stringify(batch).length).toBeLessThanOrEqual(256 * 1024);
    }
    expect(batches.flat()).toHaveLength(250);
  });
});

describe("runFetchCycle", () => {
  const ENV_KEY = "FAMILY_CALENDAR_URL";

  function recordingStore(
    overrides: Partial<FetchCycleStore> = {},
  ): { store: FetchCycleStore; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      store: {
        stage: async (batchIndex, events) => {
          calls.push(`stage:${String(batchIndex)}:${String(events.length)}`);
          return { accepted: true };
        },
        publish: async (batchCount, eventCount) => {
          calls.push(
            `publish:${String(batchCount)}:${String(eventCount)}`,
          );
          return { accepted: true };
        },
        publishUnchanged: async () => {
          calls.push("publishUnchanged");
          return { accepted: true };
        },
        fail: async (errorClass, retryAfterMs) => {
          calls.push(
            `fail:${errorClass}:${String(retryAfterMs ?? "none")}`,
          );
          return { accepted: true };
        },
        ...overrides,
      },
    };
  }

  function claimWith(
    overrides: Partial<FetchCycleClaim> = {},
  ): FetchCycleClaim {
    return { window: octoberWindow(), urlEnvKey: ENV_KEY, ...overrides };
  }

  function envWith(url: string): Record<string, string | undefined> {
    return { [ENV_KEY]: url };
  }

  it("publishesChangedStandInBatches", async () => {
    const { store, calls } = recordingStore();
    const fetch = okFetch(loadCalendarFixture("allday-exclusive-end.ics"));
    const outcome = await runFetchCycle(
      claimWith({ previousFingerprint: "stale-stand" }),
      envWith("https://cal.example.com/feed.ics"),
      store,
      contentFingerprint,
      fetch,
    );
    expect(outcome).toBe("published");
    expect(calls).toEqual(["stage:0:2", "publish:1:2"]);
  });

  it("publishesUnchangedWithoutStaging", async () => {
    const window = octoberWindow();
    const events = await fetchAndNormalizeCalendar(
      "https://cal.example.com/feed.ics",
      window,
      okFetch(loadCalendarFixture("allday-exclusive-end.ics")),
    );
    const fingerprint = contentFingerprint(
      { fromDate: window.fromDate, toDate: window.toDate },
      events,
    );
    const { store, calls } = recordingStore();
    const outcome = await runFetchCycle(
      claimWith({ previousFingerprint: fingerprint }),
      envWith("https://cal.example.com/feed.ics"),
      store,
      contentFingerprint,
      okFetch(loadCalendarFixture("allday-exclusive-end.ics")),
    );
    expect(outcome).toBe("unchanged");
    expect(calls).toEqual(["publishUnchanged"]);
  });

  it("unchangedRejectionFallsBackToFullPublish (window moved on)", async () => {
    const window = octoberWindow();
    const events = await fetchAndNormalizeCalendar(
      "https://cal.example.com/feed.ics",
      window,
      okFetch(loadCalendarFixture("allday-exclusive-end.ics")),
    );
    const fingerprint = contentFingerprint(
      { fromDate: window.fromDate, toDate: window.toDate },
      events,
    );
    const { store, calls } = recordingStore({
      publishUnchanged: async () => {
        calls.push("publishUnchanged");
        return { accepted: false };
      },
    });
    const outcome = await runFetchCycle(
      claimWith({ previousFingerprint: fingerprint }),
      envWith("https://cal.example.com/feed.ics"),
      store,
      contentFingerprint,
      okFetch(loadCalendarFixture("allday-exclusive-end.ics")),
    );
    expect(outcome).toBe("published");
    expect(calls).toEqual(["publishUnchanged", "stage:0:2", "publish:1:2"]);
  });

  it("failedParseReportsAndNeverStagesOrPublishes", async () => {
    const { store, calls } = recordingStore();
    const outcome = await runFetchCycle(
      claimWith(),
      envWith("https://cal.example.com/feed.ics"),
      store,
      contentFingerprint,
      okFetch(loadCalendarFixture("malformed-truncated.ics")),
    );
    expect(outcome).toBe("failed");
    expect(calls).toEqual(["fail:parse:none"]);
  });

  it("missingEnvBindingIsAuthFailure", async () => {
    const { store, calls } = recordingStore();
    const outcome = await runFetchCycle(
      claimWith(),
      {},
      store,
      contentFingerprint,
      okFetch(loadCalendarFixture("allday-exclusive-end.ics")),
    );
    expect(outcome).toBe("failed");
    expect(calls).toEqual(["fail:auth:none"]);
  });

  it("rateLimitedCarriesRetryAfter", async () => {
    const { store, calls } = recordingStore();
    const outcome = await runFetchCycle(
      claimWith(),
      envWith("https://cal.example.com/feed.ics"),
      store,
      contentFingerprint,
      statusFetch(429, { "Retry-After": "120" }),
    );
    expect(outcome).toBe("failed");
    expect(calls).toEqual(["fail:rateLimited:120000"]);
  });

  it("revokedMidFlightFailsClosedWithoutFail", async () => {
    const { store, calls } = recordingStore({
      stage: async () => {
        calls.push("stage:rejected");
        return { accepted: false };
      },
    });
    const outcome = await runFetchCycle(
      claimWith({ previousFingerprint: "stale-stand" }),
      envWith("https://cal.example.com/feed.ics"),
      store,
      contentFingerprint,
      okFetch(loadCalendarFixture("allday-exclusive-end.ics")),
    );
    expect(outcome).toBe("failed");
    expect(calls).toEqual(["stage:rejected"]);
  });
});

describe("calendar feed v1 contract fixture", () => {
  function loadFeed(): Record<string, unknown> {
    return JSON.parse(
      readFileSync(
        new URL("../fixtures/calendar-feed-v1.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;
  }

  // Recursive check of a plain JSON value against the serializable form of
  // a real Convex validator (validator.json), so the fixture and
  // calendarFeedV1Validator cannot drift apart unnoticed.
  type ValidatorJson = {
    type: string;
    value?: unknown;
    fieldType?: ValidatorJson;
    optional?: boolean;
  };
  function assertMatchesValidator(
    schema: ValidatorJson,
    value: unknown,
    path: string,
  ): void {
    const at = (detail: string) => `${path}: ${detail}`;
    switch (schema.type) {
      case "any":
        return;
      case "string":
      case "id":
        expect(typeof value, at(`expected string, got ${typeof value}`)).toBe(
          "string",
        );
        return;
      case "number":
      case "float64":
      case "int64":
        expect(typeof value, at(`expected number, got ${typeof value}`)).toBe(
          "number",
        );
        return;
      case "boolean":
        expect(typeof value, at(`expected boolean, got ${typeof value}`)).toBe(
          "boolean",
        );
        return;
      case "null":
        expect(value, at("expected null")).toBeNull();
        return;
      case "literal":
        expect(value, at(`expected literal ${String(schema.value)}`)).toBe(
          schema.value,
        );
        return;
      case "array": {
        expect(Array.isArray(value), at("expected array")).toBe(true);
        for (const [index, item] of (value as unknown[]).entries()) {
          assertMatchesValidator(
            schema.value as ValidatorJson,
            item,
            `${path}[${String(index)}]`,
          );
        }
        return;
      }
      case "object": {
        expect(
          typeof value === "object" && value !== null && !Array.isArray(value),
          at("expected object"),
        ).toBe(true);
        const fields = schema.value as Record<
          string,
          { fieldType: ValidatorJson; optional: boolean }
        >;
        const record = value as Record<string, unknown>;
        for (const [key, field] of Object.entries(fields)) {
          if (!(key in record)) {
            expect(
              field.optional,
              at(`missing required field "${key}"`),
            ).toBe(true);
            continue;
          }
          assertMatchesValidator(field.fieldType, record[key], `${path}.${key}`);
        }
        for (const key of Object.keys(record)) {
          expect(
            key in fields,
            at(`unexpected field "${key}" not in the validator`),
          ).toBe(true);
        }
        return;
      }
      case "union": {
        const members = schema.value as ValidatorJson[];
        const matched = members.some((member) => {
          try {
            assertMatchesValidator(member, value, path);
            return true;
          } catch {
            return false;
          }
        });
        expect(matched, at("matched no union member")).toBe(true);
        return;
      }
      default:
        throw new Error(`unsupported validator kind "${schema.type}" at ${path}`);
    }
  }

  it("matchesTheRealValidator (fixture parses against calendarFeedV1Validator)", () => {
    assertMatchesValidator(
      calendarFeedV1Validator.json as unknown as ValidatorJson,
      loadFeed(),
      "feed",
    );
  });

  it("hasTheVersionedEnvelope (same keys the live feed serves)", () => {
    const feed = loadFeed();
    expect(Object.keys(feed).sort()).toEqual(
      [
        "bindings",
        "calendars",
        "configurationRevision",
        "events",
        "generatedAt",
        "people",
        "scope",
        "timezone",
        "version",
        "window",
      ].sort(),
    );
    expect(feed["version"]).toBe(1);
    expect(feed["scope"]).toBe("family-calendars");
    expect(feed["timezone"]).toBe("Europe/Berlin");
    expect(typeof feed["configurationRevision"]).toBe("number");
    expect(typeof feed["generatedAt"]).toBe("number");
  });

  it("windowCovers42BerlinDays (checked against the real policy)", () => {
    const feed = loadFeed();
    const window = feed["window"] as CalendarWindow;
    expect(addDays(window.fromDate, 42)).toBe(window.toDate);
    expect(window.fromMs).toBe(berlinMidnightMs(window.fromDate));
    expect(window.toMs).toBe(berlinMidnightMs(window.toDate));
  });

  it("calendarsAreSortedAndReferentiallyIntact", () => {
    const feed = loadFeed();
    const calendars = feed["calendars"] as Array<Record<string, unknown>>;
    const people = feed["people"] as Array<Record<string, unknown>>;
    const personIds = new Set(people.map((person) => person["id"]));
    const order = calendars.map((calendar) => calendar["sourceKey"]);
    expect([...order].sort()).toEqual(order);
    const ids = new Set(calendars.map((calendar) => calendar["id"]));
    for (const calendar of calendars) {
      for (const personId of calendar["personIds"] as string[]) {
        expect(personIds.has(personId)).toBe(true);
      }
      if (calendar["intoCalendarId"] !== undefined) {
        expect(ids.has(calendar["intoCalendarId"])).toBe(true);
      }
      expect(["neverLoaded", "fresh", "stale", "disabled"]).toContain(
        calendar["freshness"],
      );
    }
    const bindings = feed["bindings"] as Array<Record<string, unknown>>;
    for (const binding of bindings) {
      expect(personIds.has(binding["personId"])).toBe(true);
    }
    const events = feed["events"] as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    for (const event of events) {
      expect(ids.has(event["calendarId"])).toBe(true);
      const startMs = event["startMs"] as number;
      const endMs = event["endMs"] as number;
      const window = feed["window"] as CalendarWindow;
      expect(startMs).toBeLessThan(window.toMs);
      expect(endMs).toBeGreaterThan(window.fromMs);
      const scoped = `${String(event["calendarId"])}:${String(event["key"])}`;
      expect(seen.has(scoped)).toBe(false);
      seen.add(scoped);
    }
  });

  it("containsNoSecrets", () => {
    const feed = loadFeed();
    const serialized = JSON.stringify(feed);
    for (const forbidden of [
      "http",
      "BEGIN:VCALENDAR",
      "token",
      "secret",
      "pin",
      "PIN",
      "Authorization",
      "EnvKey",
      "envKey",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

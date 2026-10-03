import { httpRouter } from "convex/server";
import { ConvexError, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { isAuthorizedHeader } from "./lib/tokens";
import { parseDaysParam } from "./lib/todos";
import {
  briefingValidator,
  childSnapshotValidator,
} from "./lib/validators";

const http = httpRouter();

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" },
  });
}

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

// Shared token gate for every /ingest/* route. No token configured or a
// different token both count as unauthorized.
function isAuthorized(request: Request): boolean {
  return isAuthorizedHeader(
    request.headers.get("Authorization"),
    process.env.INGEST_TOKEN,
  );
}

// Dashboard token gate for GET /todos (separate secret from the ingest token).
function isDashboardAuthorized(request: Request): boolean {
  return isAuthorizedHeader(
    request.headers.get("Authorization"),
    process.env.DASHBOARD_TOKEN,
  );
}

// Calendar device gate for GET /dashboard/calendars. This is a dedicated
// read-only secret: neither DASHBOARD_TOKEN nor INGEST_TOKEN authorizes the
// calendar feed, and the calendar token authorizes no ingest route.
function isCalendarAuthorized(request: Request): boolean {
  return isAuthorizedHeader(
    request.headers.get("Authorization"),
    process.env.CALENDAR_DASHBOARD_TOKEN,
  );
}

// The whole HTTP feed envelope must stay within this bound; larger stands
// answer 503 and the Go cache keeps serving last-good (Task 5).
const MAX_CALENDAR_FEED_BYTES = 4 * 1024 * 1024;

function calendarUnavailable(message: string): Response {
  return new Response(message, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

http.route({
  path: "/ingest/child",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return unauthorized();
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }
    try {
      await ctx.runMutation(
        internal.ingest.upsertChildSnapshot,
        body as Infer<typeof childSnapshotValidator>,
      );
    } catch (error) {
      if (error instanceof ConvexError) {
        return badRequest(
          typeof error.data === "string" ? error.data : "Invalid payload",
        );
      }
      // Convex surfaces nested argument-validation failures as a plain Error
      // rather than a ConvexError, so recognize it explicitly to keep invalid
      // payloads a 400 (the documented contract) instead of a 500.
      if (
        error instanceof Error &&
        (error.name === "ArgumentValidationError" ||
          error.message.startsWith("ArgumentValidationError:"))
      ) {
        return badRequest(error.message);
      }
      console.error("familyapp: ingest request failed", error);
      return new Response("Internal error", { status: 500 });
    }
    return new Response(null, { status: 204 });
  }),
});

http.route({
  path: "/ingest/briefing",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorized(request)) {
      return unauthorized();
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }
    try {
      await ctx.runMutation(
        internal.ingest.upsertBriefing,
        body as Infer<typeof briefingValidator>,
      );
    } catch (error) {
      if (error instanceof ConvexError) {
        return badRequest(
          typeof error.data === "string" ? error.data : "Invalid payload",
        );
      }
      // Convex surfaces nested argument-validation failures as a plain Error
      // rather than a ConvexError, so recognize it explicitly to keep invalid
      // payloads a 400 (the documented contract) instead of a 500.
      if (
        error instanceof Error &&
        (error.name === "ArgumentValidationError" ||
          error.message.startsWith("ArgumentValidationError:"))
      ) {
        return badRequest(error.message);
      }
      console.error("familyapp: ingest request failed", error);
      return new Response("Internal error", { status: 500 });
    }
    return new Response(null, { status: 204 });
  }),
});

http.route({
  path: "/todos",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isDashboardAuthorized(request)) {
      return unauthorized();
    }
    const days = parseDaysParam(new URL(request.url).searchParams);
    if (days === null) {
      return badRequest("days must be an integer between 1 and 7");
    }
    try {
      const data = await ctx.runQuery(internal.todos.getTodos, { days });
      return Response.json(data);
    } catch (error) {
      if (error instanceof ConvexError) {
        return badRequest(
          typeof error.data === "string" ? error.data : "Invalid request",
        );
      }
      console.error("familyapp: todos request failed", error);
      return new Response("Internal error", { status: 500 });
    }
  }),
});

http.route({
  path: "/dashboard/calendars",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isCalendarAuthorized(request)) {
      return unauthorized();
    }
    let feed: unknown;
    try {
      feed = await ctx.runQuery(internal.calendar.getDashboardFeed, {});
    } catch (error) {
      if (
        error instanceof ConvexError &&
        typeof error.data === "string" &&
        error.data.startsWith("CalendarNotConfigured")
      ) {
        return calendarUnavailable("Calendar feed not configured");
      }
      console.error("familyapp: calendar feed request failed", error);
      return new Response("Internal error", { status: 500 });
    }
    const body = JSON.stringify(feed);
    if (new TextEncoder().encode(body).length > MAX_CALENDAR_FEED_BYTES) {
      return calendarUnavailable("Calendar feed too large");
    }
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }),
});

export default http;

import { httpRouter } from "convex/server";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { bearerToken, timingSafeEqual } from "./lib/tokens";
import {
  briefingValidator,
  childSnapshotValidator,
} from "./lib/validators";

const http = httpRouter();

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

// Shared token gate for every /ingest/* route. No token configured or a
// different token both count as unauthorized.
function isAuthorized(request: Request): boolean {
  const expected = process.env.INGEST_TOKEN;
  if (expected === undefined || expected.length === 0) {
    return false;
  }
  const provided = bearerToken(request.headers.get("Authorization"));
  return provided !== null && timingSafeEqual(provided, expected);
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
      return badRequest(
        error instanceof Error ? error.message : "Invalid payload",
      );
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
      return badRequest(
        error instanceof Error ? error.message : "Invalid payload",
      );
    }
    return new Response(null, { status: 204 });
  }),
});

export default http;

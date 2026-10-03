"use node";

// Central calendar fetch action (Task 4 of the calendar pilot).
//
// fetchCalendar({sourceId}) is the only central poller: it claims the
// commit permission for one source, resolves the feed address from the
// server-side environment (never from user input), fetches and normalizes
// the whole response, then stages and publishes it — or reports a
// classified failure. Change detection never trusts provider ETags: the
// full normalized stand is fingerprinted and compared against the
// published fingerprint (changed -> stage batches + publish, identical ->
// publishUnchanged). Raw URLs, env values and unredacted exception strings
// are never logged or stored.

import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalAction } from "./_generated/server.js";
import { contentFingerprint } from "./lib/calendarFingerprint.js";
import { runFetchCycle } from "./lib/calendarFetch.js";

const fetchStatusValidator = v.union(
  v.literal("skipped"),
  v.literal("published"),
  v.literal("unchanged"),
  v.literal("failed"),
);

export const fetchCalendar = internalAction({
  args: { sourceId: v.id("calendarSources") },
  returns: v.object({ status: fetchStatusValidator }),
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.calendarSync.claim, {
      sourceId: args.sourceId,
    });
    if (claimed === null) {
      // Disabled, local, or another valid lease-holder: nothing to do.
      return { status: "skipped" as const };
    }
    const { runId, configGeneration, window, urlEnvKey, previousFingerprint } =
      claimed;
    try {
      const outcome = await runFetchCycle(
        {
          window,
          urlEnvKey,
          ...(previousFingerprint === undefined
            ? {}
            : { previousFingerprint }),
        },
        process.env,
        {
          stage: (batchIndex, events) =>
            ctx.runMutation(internal.calendarSync.stage, {
              runId,
              configGeneration,
              batchIndex,
              events,
            }),
          publish: (batchCount, eventCount, fingerprint) =>
            ctx.runMutation(internal.calendarSync.publish, {
              runId,
              configGeneration,
              batchCount,
              eventCount,
              contentFingerprint: fingerprint,
            }),
          publishUnchanged: (fingerprint) =>
            ctx.runMutation(internal.calendarSync.publishUnchanged, {
              runId,
              configGeneration,
              contentFingerprint: fingerprint,
            }),
          fail: (errorClass, retryAfterMs) =>
            ctx.runMutation(internal.calendarSync.fail, {
              runId,
              configGeneration,
              errorClass,
              ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
            }),
        },
        contentFingerprint,
      );
      return { status: outcome };
    } catch {
      // Unexpected failure shape: log only the opaque source id, never the
      // raw exception string or the feed address (already reported as
      // "server" inside the cycle).
      console.error(
        `calendar fetch failed unexpectedly (source ${args.sourceId})`,
      );
      return { status: "failed" as const };
    }
  },
});

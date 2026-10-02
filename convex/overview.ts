import { v, type Infer } from "convex/values";
import { query } from "./_generated/server";
import { requireParent, requireUser } from "./lib/auth";
import { preferredBriefingKind } from "./lib/briefing";
import { addDays, berlinHour, todayBerlin } from "./lib/dates";
import {
  briefingItemValidator,
  childDayValidator,
  examValidator,
  homeworkValidator,
} from "./lib/validators";

const snapshotValidator = v.object({
  days: v.array(childDayValidator),
  homework: v.array(homeworkValidator),
  exams: v.array(examValidator),
  sourceUpdatedAt: v.number(),
  receivedAt: v.number(),
});

const childOverviewValidator = v.object({
  slug: v.string(),
  name: v.string(),
  color: v.string(),
  emoji: v.string(),
  snapshot: v.union(snapshotValidator, v.null()),
});

// Parents get both kids; a kid gets only their own snapshot. The role check
// lives here, never in the UI (AGENTS.md security rules).
export const children = query({
  args: { token: v.string() },
  returns: v.array(childOverviewValidator),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx, args.token);
    const users = await ctx.db.query("users").collect();
    const kids = users
      .filter((u) => u.role === "child")
      .filter((u) => caller.role === "parent" || u.slug === caller.slug)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const result: Infer<typeof childOverviewValidator>[] = [];
    for (const kid of kids) {
      const snapshot = await ctx.db
        .query("childSnapshots")
        .withIndex("by_childSlug", (q) => q.eq("childSlug", kid.slug))
        .unique();
      result.push({
        slug: kid.slug,
        name: kid.name,
        color: kid.color,
        emoji: kid.emoji,
        snapshot:
          snapshot === null
            ? null
            : {
                days: snapshot.days,
                homework: snapshot.homework,
                exams: snapshot.exams,
                sourceUpdatedAt: snapshot.sourceUpdatedAt,
                receivedAt: snapshot.receivedAt,
              },
      });
    }
    return result;
  },
});

const briefingViewValidator = v.object({
  kind: v.union(v.literal("morning"), v.literal("evening")),
  date: v.string(),
  text: v.string(),
  headline: v.optional(v.string()),
  items: v.array(briefingItemValidator),
  ai: v.boolean(),
  generatedAt: v.number(),
});

function toBriefingView(
  doc: Infer<typeof briefingViewValidator> & { receivedAt?: number },
): Infer<typeof briefingViewValidator> {
  return {
    kind: doc.kind,
    date: doc.date,
    text: doc.text,
    headline: doc.headline,
    items: doc.items,
    ai: doc.ai,
    generatedAt: doc.generatedAt,
  };
}

// Parents only (briefings cover the whole family). Before 14:00 Berlin the
// morning briefing, afterwards the evening one; if the preferred one is not
// there yet, the most recently generated briefing is shown.
export const latestBriefing = query({
  args: { token: v.string() },
  returns: v.union(briefingViewValidator, v.null()),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const now = Date.now();
    const today = todayBerlin(now);
    const kind = preferredBriefingKind(berlinHour(now));
    const date = kind === "morning" ? today : addDays(today, 1);
    const preferred = await ctx.db
      .query("briefings")
      .withIndex("by_date_kind", (q) => q.eq("date", date).eq("kind", kind))
      .first();
    if (preferred !== null) {
      return toBriefingView(preferred);
    }
    const all = await ctx.db.query("briefings").collect();
    if (all.length === 0) {
      return null;
    }
    all.sort((a, b) => b.generatedAt - a.generatedAt);
    return toBriefingView(all[0]);
  },
});

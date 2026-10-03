import { v, type Infer } from "convex/values";
import { query } from "./_generated/server";
import { visibleChildren } from "./lib/access";
import { requireUser } from "./lib/auth";
import {
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
    const kids = visibleChildren(users, caller).sort((a, b) =>
      a.name.localeCompare(b.name, "de"),
    );
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

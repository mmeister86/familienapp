import { ConvexError } from "convex/values";
import type { DatabaseReader } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

// Brute-force protection: lock the user after this many failed PIN attempts.
export const MAX_FAILED_ATTEMPTS = 5;

// Lockout duration after too many failed PIN attempts (15 minutes).
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// Session validity (180 days, so kid devices stay logged in).
export const SESSION_DURATION_MS = 180 * 24 * 60 * 60 * 1000;

// Minimal context type so the helpers work in both query and mutation handlers.
type AuthCtx = {
  db: DatabaseReader;
};

// Public user shape: safe to return to clients (no PIN or lockout fields).
export type PublicUser = {
  _id: Doc<"users">["_id"];
  slug: string;
  name: string;
  role: "parent" | "child";
  color: string;
  emoji: string;
};

// Strip sensitive fields from a user document before returning it to clients.
export function toPublicUser(user: Doc<"users">): PublicUser {
  return {
    _id: user._id,
    slug: user.slug,
    name: user.name,
    role: user.role,
    color: user.color,
    emoji: user.emoji,
  };
}

// Look up the session by token and return its user.
// Throws if the token is unknown, the session expired, or the user is gone.
// Note: lockout (lockedUntil) is intentionally NOT checked here —
// it blocks login only, not already-issued sessions.
export async function requireUser(
  ctx: AuthCtx,
  token: string,
): Promise<Doc<"users">> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (session === null || session.expiresAt <= Date.now()) {
    throw new ConvexError("Invalid or expired session");
  }
  const user = await ctx.db.get(session.userId);
  if (user === null) {
    throw new ConvexError("Invalid or expired session");
  }
  return user;
}

// Same as requireUser, but additionally requires the parent role.
export async function requireParent(
  ctx: AuthCtx,
  token: string,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx, token);
  if (user.role !== "parent") {
    throw new ConvexError("Parent access required");
  }
  return user;
}

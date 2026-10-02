import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  LOCKOUT_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  requireUser,
  SESSION_DURATION_MS,
  toPublicUser,
} from "./lib/auth";
import { encodeBase64Url, verifyPin } from "./lib/pin";

// Session token length (256 bits of randomness, base64url-encoded).
const SESSION_TOKEN_BYTES = 32;

// Public user shape returned by `me` (no PIN or lockout fields).
const publicUserValidator = v.object({
  _id: v.id("users"),
  slug: v.string(),
  name: v.string(),
  role: v.union(v.literal("parent"), v.literal("child")),
  color: v.string(),
  emoji: v.string(),
});

// Full user document as returned by the internal slug lookup.
// Includes PIN fields: the login action needs them to verify the PIN.
// Internal only — never exposed to clients.
const userDocValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  slug: v.string(),
  name: v.string(),
  role: v.union(v.literal("parent"), v.literal("child")),
  color: v.string(),
  emoji: v.string(),
  pinHash: v.string(),
  pinSalt: v.string(),
  failedAttempts: v.number(),
  lockedUntil: v.optional(v.number()),
});

// Generate a 256-bit session token, base64url-encoded (43 chars, unpadded).
function generateSessionToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

// Internal lookup for the login action (actions cannot touch `db` directly).
export const getUserBySlug = internalQuery({
  args: { slug: v.string() },
  returns: v.union(userDocValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

// Record a failed PIN attempt. An expired lockout restarts the counter at 1;
// reaching MAX_FAILED_ATTEMPTS locks the user and resets the counter to 0.
export const recordFailedLogin = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      // User deleted between lookup and write; nothing to count against.
      return null;
    }
    const now = Date.now();
    const expiredLockout =
      user.lockedUntil !== undefined && user.lockedUntil <= now;
    const newCount = expiredLockout ? 1 : user.failedAttempts + 1;
    if (newCount >= MAX_FAILED_ATTEMPTS) {
      await ctx.db.patch(user._id, {
        failedAttempts: 0,
        lockedUntil: now + LOCKOUT_DURATION_MS,
      });
    } else if (expiredLockout) {
      await ctx.db.patch(user._id, {
        failedAttempts: newCount,
        lockedUntil: undefined,
      });
    } else {
      await ctx.db.patch(user._id, { failedAttempts: newCount });
    }
    return null;
  },
});

// Record a successful login: clear failures/lockout and create the session.
export const recordSuccessfulLogin = internalMutation({
  args: { userId: v.id("users"), token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      // User deleted after PIN verification; same message as a wrong PIN
      // so callers cannot distinguish the cases.
      throw new ConvexError("Invalid PIN");
    }
    const now = Date.now();
    await ctx.db.patch(user._id, {
      failedAttempts: 0,
      lockedUntil: undefined,
    });
    await ctx.db.insert("sessions", {
      userId: user._id,
      token: args.token,
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
    });
    return null;
  },
});

// Log in with slug + PIN. Returns only the session token; the frontend
// fetches the user via `me`. Unknown slug and wrong PIN share one message
// so callers cannot enumerate users.
export const login = action({
  args: { slug: v.string(), pin: v.string() },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.auth.getUserBySlug, {
      slug: args.slug,
    });
    if (user === null) {
      throw new ConvexError("Invalid PIN");
    }
    if (user.lockedUntil !== undefined && user.lockedUntil > Date.now()) {
      // Locked: fail without verifying the PIN or touching counters.
      throw new ConvexError("Account locked");
    }
    const ok = await verifyPin(args.pin, user.pinHash, user.pinSalt);
    if (!ok) {
      await ctx.runMutation(internal.auth.recordFailedLogin, {
        userId: user._id,
      });
      throw new ConvexError("Invalid PIN");
    }
    const token = generateSessionToken();
    await ctx.runMutation(internal.auth.recordSuccessfulLogin, {
      userId: user._id,
      token,
    });
    return { token };
  },
});

// Log out by deleting the session. Idempotent: an unknown token is a no-op.
export const logout = mutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (session !== null) {
      await ctx.db.delete(session._id);
    }
    return { ok: true };
  },
});

// Return the public profile for a session token. Invalid/expired tokens
// throw via requireUser. Never includes PIN or lockout fields.
export const me = query({
  args: { token: v.string() },
  returns: publicUserValidator,
  handler: async (ctx, args) => {
    return toPublicUser(await requireUser(ctx, args.token));
  },
});

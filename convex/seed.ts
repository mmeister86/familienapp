import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { hashPin } from "./lib/pin";

// Fixed family users (from PLAN.md). Each PIN comes from its env var:
// parents use 6 digits, kids use 4 digits.
type SeedUserDef = {
  slug: string;
  name: string;
  role: "parent" | "child";
  color: string;
  emoji: string;
  envVar: string;
  pinLength: number;
};

const SEED_USERS: SeedUserDef[] = [
  {
    slug: "matthias",
    name: "Matthias",
    role: "parent",
    color: "#2563eb",
    emoji: "🧔",
    envVar: "PIN_MATTHIAS",
    pinLength: 6,
  },
  {
    slug: "anica",
    name: "Anica",
    role: "parent",
    color: "#7c3aed",
    emoji: "👩",
    envVar: "PIN_ANICA",
    pinLength: 6,
  },
  {
    slug: "lukas",
    name: "Lukas",
    role: "child",
    color: "#16a34a",
    emoji: "🧒",
    envVar: "PIN_LUKAS",
    pinLength: 4,
  },
  {
    slug: "hannah",
    name: "Hannah",
    role: "child",
    color: "#e11d48",
    emoji: "👧",
    envVar: "PIN_HANNAH",
    pinLength: 4,
  },
];

// Seed (or re-seed) the fixed family users. Run via `npx convex run seed:run`.
// Re-running is the change-PIN flow: it re-hashes the env PINs and unlocks users.
// Never returns hashes, salts, or PINs.
export const run = internalAction({
  args: {},
  // Explicit return type: breaks the inference cycle through the generated
  // API types (internal.seed.* is typed via `typeof import("../seed.js")`).
  handler: async (ctx): Promise<{ seeded: number; slugs: string[] }> => {
    // Fail fast if any PIN env var is missing or empty.
    const missing = SEED_USERS.map((user) => user.envVar).filter(
      (envVar) => {
        const pin = process.env[envVar];
        return pin === undefined || pin === "";
      },
    );
    if (missing.length > 0) {
      throw new ConvexError(
        `Missing PIN environment variable(s): ${missing.join(", ")}`,
      );
    }

    const users: {
      slug: string;
      name: string;
      role: "parent" | "child";
      color: string;
      emoji: string;
      pinHash: string;
      pinSalt: string;
    }[] = [];
    for (const def of SEED_USERS) {
      const pin = process.env[def.envVar] ?? "";
      if (pin.length !== def.pinLength || !/^\d+$/.test(pin)) {
        throw new ConvexError(
          `Invalid PIN in ${def.envVar}: expected ${def.pinLength} digits`,
        );
      }
      const { hash, salt } = await hashPin(pin);
      users.push({
        slug: def.slug,
        name: def.name,
        role: def.role,
        color: def.color,
        emoji: def.emoji,
        pinHash: hash,
        pinSalt: salt,
      });
    }

    const seeded: number = await ctx.runMutation(
      internal.seed.upsertUsers,
      {
        users,
      },
    );
    return { seeded, slugs: SEED_USERS.map((user) => user.slug) };
  },
});

const upsertUserValidator = v.object({
  slug: v.string(),
  name: v.string(),
  role: v.union(v.literal("parent"), v.literal("child")),
  color: v.string(),
  emoji: v.string(),
  pinHash: v.string(),
  pinSalt: v.string(),
});

// Upsert seeded users by slug. Existing users get their profile + PIN replaced
// and are unlocked (failedAttempts reset, lockout cleared).
export const upsertUsers = internalMutation({
  args: {
    users: v.array(upsertUserValidator),
  },
  handler: async (ctx, args) => {
    for (const user of args.users) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_slug", (q) => q.eq("slug", user.slug))
        .unique();
      if (existing === null) {
        await ctx.db.insert("users", {
          slug: user.slug,
          name: user.name,
          role: user.role,
          color: user.color,
          emoji: user.emoji,
          pinHash: user.pinHash,
          pinSalt: user.pinSalt,
          failedAttempts: 0,
        });
      } else {
        await ctx.db.patch(existing._id, {
          name: user.name,
          role: user.role,
          color: user.color,
          emoji: user.emoji,
          pinHash: user.pinHash,
          pinSalt: user.pinSalt,
          failedAttempts: 0,
          lockedUntil: undefined,
        });
      }
    }
    return args.users.length;
  },
});

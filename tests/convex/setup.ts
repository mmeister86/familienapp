// Shared harness for Convex DB tests: an isolated in-memory backend plus
// synthetic token-argument sessions (the app's real auth pattern — no JWT
// identity mocks).

import { convexTest } from "convex-test";
import schema from "../../convex/schema.js";

// All Convex modules, globbed relative to this file.
const modules = import.meta.glob("../../convex/**/*.ts");

export function setupCalendarTest() {
  return convexTest(schema, modules);
}

export type CalendarTestClient = ReturnType<typeof setupCalendarTest>;

function uniqueSuffix(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

async function insertSessionUser(
  t: CalendarTestClient,
  role: "parent" | "child",
) {
  const now = Date.now();
  const slug = uniqueSuffix(`test-${role}`);
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      slug,
      name: `Test ${role}`,
      role,
      color: "#2563eb",
      emoji: "🧪",
      pinHash: "test-hash",
      pinSalt: "test-salt",
      failedAttempts: 0,
    });
  });
  const token = uniqueSuffix("token");
  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", {
      userId,
      token,
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });
  });
  return { userId, token };
}

export function createParentSession(t: CalendarTestClient) {
  return insertSessionUser(t, "parent");
}

export function createChildSession(t: CalendarTestClient) {
  return insertSessionUser(t, "child");
}

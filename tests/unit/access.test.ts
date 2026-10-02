import { describe, expect, it } from "vitest";
import { visibleChildren } from "../../convex/lib/access.js";

const users = [
  { slug: "matthias", role: "parent" as const },
  { slug: "anica", role: "parent" as const },
  { slug: "lukas", role: "child" as const },
  { slug: "hannah", role: "child" as const },
];

describe("visibleChildren", () => {
  it("returns every child to a parent (never the parents)", () => {
    const result = visibleChildren(users, { slug: "matthias", role: "parent" });
    expect(result.map((u) => u.slug)).toEqual(["lukas", "hannah"]);
  });
  it("returns only the caller to a child", () => {
    const result = visibleChildren(users, { slug: "lukas", role: "child" });
    expect(result.map((u) => u.slug)).toEqual(["lukas"]);
  });
  it("returns a sibling's own list only for that sibling", () => {
    const result = visibleChildren(users, { slug: "hannah", role: "child" });
    expect(result.map((u) => u.slug)).toEqual(["hannah"]);
  });
  it("returns nothing when there are no child users", () => {
    const result = visibleChildren([users[0], users[1]], {
      slug: "matthias",
      role: "parent",
    });
    expect(result).toEqual([]);
  });
});

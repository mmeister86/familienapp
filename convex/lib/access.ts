// Pure authorization predicate for the overview queries. Kept free of Convex
// imports so it can be unit-tested.

export type ChildRef = { slug: string; role: "parent" | "child" };

// The child users a caller may see: parents see every child, a child sees only
// themselves. Users with any other role are never returned.
export function visibleChildren<T extends ChildRef>(
  users: T[],
  caller: ChildRef,
): T[] {
  return users.filter(
    (user) =>
      user.role === "child" &&
      (caller.role === "parent" || user.slug === caller.slug),
  );
}

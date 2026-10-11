import { describe, expect, it } from "vitest";
import {
  isNavItemVisible,
  moreItemsFor,
  navItems,
  titleForPath,
} from "../../src/lib/nav.js";

const layouts = navItems.find((item) => item.url === "/layouts");
const today = navItems.find((item) => item.url === "/");

describe("layouts nav entry", () => {
  it("lives under Verwalten for parents on laptops only", () => {
    expect(layouts).toBeDefined();
    expect(layouts?.title).toBe("Wand-Szenen");
    expect(layouts?.group).toBe("manage");
    expect(layouts?.roles).toEqual(["parent"]);
    expect(layouts?.desktopOnly).toBe(true);
  });

  it("is visible to parents on laptops, nowhere else", () => {
    if (layouts === undefined) throw new Error("no /layouts entry");
    expect(isNavItemVisible(layouts, "parent", true)).toBe(true);
    expect(isNavItemVisible(layouts, "parent", false)).toBe(false);
    expect(isNavItemVisible(layouts, "child", true)).toBe(false);
    expect(isNavItemVisible(layouts, "child", false)).toBe(false);
    expect(isNavItemVisible(layouts, undefined, true)).toBe(false);
  });

  it("leaves regular entries alone", () => {
    if (today === undefined) throw new Error("no / entry");
    expect(isNavItemVisible(today, "parent", true)).toBe(true);
    expect(isNavItemVisible(today, "parent", false)).toBe(true);
    expect(isNavItemVisible(today, "child", false)).toBe(true);
    expect(isNavItemVisible(today, undefined, true)).toBe(false);
  });

  it("stays out of the phone Mehr sheet", () => {
    const urls = (role: "parent" | "child" | undefined, laptop: boolean) =>
      moreItemsFor(role, laptop).map((item) => item.url);
    expect(urls("parent", false)).not.toContain("/layouts");
    expect(urls("child", false)).not.toContain("/layouts");
    expect(urls("parent", true)).toContain("/layouts");
  });

  it("titles the compact top bar", () => {
    expect(titleForPath("/layouts")).toBe("Wand-Szenen");
  });
});

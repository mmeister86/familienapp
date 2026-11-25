import { LayoutTemplate } from "lucide-react";
import { describe, expect, it } from "vitest";
import { WIDGET_TYPES } from "../../convex/lib/dashboardWidgets.js";
import { widgetIcon } from "../../src/components/layouts/widget-icons.js";

describe("widgetIcon", () => {
  it("has dedicated icons for dayband and week", () => {
    expect(widgetIcon("dayband")).not.toBe(LayoutTemplate);
    expect(widgetIcon("week")).not.toBe(LayoutTemplate);
  });

  it("gives every catalog type its own icon", () => {
    for (const type of WIDGET_TYPES) {
      expect(widgetIcon(type)).not.toBe(LayoutTemplate);
    }
  });

  it("falls back to the generic icon for unknown types", () => {
    expect(widgetIcon("toaster")).toBe(LayoutTemplate);
  });
});

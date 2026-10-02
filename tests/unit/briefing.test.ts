import { describe, expect, it } from "vitest";
import {
  BRIEFING_SWITCH_HOUR,
  preferredBriefingKind,
} from "../../convex/lib/briefing.js";

describe("preferredBriefingKind", () => {
  it("prefers the morning briefing before 14:00", () => {
    expect(preferredBriefingKind(0)).toBe("morning");
    expect(preferredBriefingKind(13)).toBe("morning");
  });
  it("prefers the evening briefing from 14:00", () => {
    expect(preferredBriefingKind(BRIEFING_SWITCH_HOUR)).toBe("evening");
    expect(preferredBriefingKind(23)).toBe("evening");
  });
});

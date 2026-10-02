// Pure briefing-selection logic (no Convex imports).

export type BriefingKind = "morning" | "evening";

// From this Berlin hour on, the Overview shows the evening briefing.
export const BRIEFING_SWITCH_HOUR = 14;

export function preferredBriefingKind(hour: number): BriefingKind {
  return hour < BRIEFING_SWITCH_HOUR ? "morning" : "evening";
}

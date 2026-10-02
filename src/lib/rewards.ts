import type { FunctionReturnType } from "convex/server"
import type { api } from "../../convex/_generated/api"
import { formatPointsLabel } from "@/lib/points"

// One row of the rewards list. For kids the server returns only active
// rewards; for parents it returns active and paused rewards.
export type RewardItem = FunctionReturnType<typeof api.rewards.list>[number]

// One of the caller's own redemptions, enriched with the resolved reward
// title/emoji and ordered by requestedAt descending, server-side.
export type RedemptionItem = FunctionReturnType<
  typeof api.rewards.listMine
>[number]

// Plain German status labels (symbols are composed by the helper below).
export const REDEMPTION_STATUS_LABELS: Record<
  RedemptionItem["status"],
  string
> = {
  requested: "Angefragt",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
}

const REDEMPTION_STATUS_SYMBOLS: Record<RedemptionItem["status"], string> = {
  requested: "⏳",
  approved: "✅",
  rejected: "❌",
}

// "Angefragt ⏳" / "Genehmigt ✅" / "Abgelehnt ❌".
export function formatRedemptionStatusLabel(
  status: RedemptionItem["status"],
): string {
  return `${REDEMPTION_STATUS_LABELS[status]} ${REDEMPTION_STATUS_SYMBOLS[status]}`
}

// Available-balance card label: "1 Punkt verfügbar" / "5 Punkte verfügbar".
// The trophy is composed by the caller and hidden from screen readers,
// mirroring PointsCounter.
export function formatAvailableLabel(available: number): string {
  return `${formatPointsLabel(available)} verfügbar`
}

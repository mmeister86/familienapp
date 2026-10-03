import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useSession } from "@/hooks/useSession"

/**
 * Number of open approvals (pending task completions + reward requests).
 * Parent-only queries: guarded by the role check so kids never trigger them.
 * Convex dedupes identical subscriptions, so several callers are cheap.
 */
export function useApprovalsCount(): number {
  const { user, token } = useSession()
  const enabled = token !== null && user?.role === "parent"
  const pending =
    useQuery(api.taskInstances.listPending, enabled ? { token } : "skip")
      ?.length ?? 0
  const requested =
    useQuery(api.rewards.listRequested, enabled ? { token } : "skip")?.length ??
    0
  return pending + requested
}

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { Gift, Pencil, Plus, Trash2 } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { PointsChip } from "@/components/chips"
import { RewardEditor } from "@/components/reward-editor"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import {
  formatAvailableLabel,
  formatRedemptionStatusLabel,
  type RewardItem,
} from "@/lib/rewards"
import { formatRelativeTimeDe } from "@/lib/tasks"

const REQUEST_FAILED_MESSAGE = "Speichern fehlgeschlagen. Bitte erneut versuchen."
const NOT_ENOUGH_POINTS_MESSAGE = "Nicht genug Punkte für diese Belohnung."
const DELETE_FAILED_MESSAGE = "Löschen fehlgeschlagen. Bitte erneut versuchen."

function LoadingState() {
  return (
    <section aria-label="Belohnungen" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40 bg-muted" />
      <Skeleton className="h-24 bg-muted" />
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        aria-hidden="true"
      >
        <Skeleton className="h-48 bg-muted" />
        <Skeleton className="h-48 bg-muted" />
      </div>
    </section>
  )
}

function RewardEmoji({ reward }: { reward: RewardItem }) {
  if (reward.emoji === undefined) {
    return (
      <Gift aria-hidden="true" className="size-9 text-muted-foreground" />
    )
  }
  return (
    <span aria-hidden="true" className="text-4xl leading-none">
      {reward.emoji}
    </span>
  )
}

function KidRewardsView({ token }: { token: string }) {
  const balance = useQuery(api.points.getBalance, { token })
  const rewards = useQuery(api.rewards.list, { token })
  const mine = useQuery(api.rewards.listMine, { token })
  const requestReward = useMutation(api.rewards.request)

  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const available = balance?.available

  const handleRequest = async (reward: RewardItem): Promise<void> => {
    if (requestingId !== null) {
      return
    }
    // Stale-data guard: the reactive balance may have changed since the card
    // rendered. Never call the backend when the cost is no longer covered.
    if (available === undefined || available < reward.cost) {
      setActionError(NOT_ENOUGH_POINTS_MESSAGE)
      return
    }
    setRequestingId(reward._id)
    setActionError(null)
    try {
      await requestReward({ token, rewardId: reward._id })
    } catch {
      setActionError(REQUEST_FAILED_MESSAGE)
    } finally {
      setRequestingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Belohnungen</h1>

      <section
        aria-label="Verfügbare Punkte"
        className="rounded-xl border bg-card p-4 sm:p-6"
      >
        {balance === undefined ? (
          <Skeleton className="h-9 w-56 bg-muted" />
        ) : (
          <p className="text-2xl font-bold tracking-tight">
            {formatAvailableLabel(balance.available)}
          </p>
        )}
      </section>

      {actionError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <section aria-label="Verfügbare Belohnungen" className="flex flex-col gap-3">
        {rewards === undefined ? (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-hidden="true"
          >
            <Skeleton className="h-48 bg-muted" />
            <Skeleton className="h-48 bg-muted" />
            <Skeleton className="h-48 bg-muted" />
          </div>
        ) : rewards.length === 0 ? (
          <p className="text-muted-foreground">
            Noch keine Belohnungen verfügbar.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rewards.map((reward) => {
              const affordable =
                available !== undefined && available >= reward.cost
              const disabled = requestingId !== null || !affordable
              return (
                <li
                  key={reward._id}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-4"
                >
                  <RewardEmoji reward={reward} />
                  <p className="text-base font-medium break-words">
                    {reward.title}
                  </p>
                  <div className="flex">
                    <PointsChip points={reward.cost} />
                  </div>
                  <Button
                    type="button"
                    className="min-h-11 w-full"
                    disabled={disabled}
                    aria-label={`${reward.title} einlösen, ${String(reward.cost)} Punkte`}
                    onClick={() => void handleRequest(reward)}
                  >
                    {requestingId === reward._id ? "Wird angefragt …" : "Einlösen"}
                  </Button>
                  {!affordable && available !== undefined ? (
                    <p className="text-sm text-muted-foreground">
                      Nicht genug Punkte
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="rewards-mine-heading"
        className="flex flex-col gap-3"
      >
        <h2
          id="rewards-mine-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Meine Anfragen
        </h2>
        {mine === undefined ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            <Skeleton className="h-14 bg-muted" />
            <Skeleton className="h-14 bg-muted" />
          </div>
        ) : mine.length === 0 ? (
          <p className="text-muted-foreground">
            Noch keine Belohnungen angefragt.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((item) => (
              <li
                key={item._id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card p-3"
              >
                <span className="flex items-center gap-2 text-base font-medium">
                  {item.rewardEmoji !== undefined ? (
                    <span aria-hidden="true">{item.rewardEmoji}</span>
                  ) : null}
                  {item.rewardTitle}
                </span>
                <PointsChip points={item.costSnapshot} />
                <span className="text-sm">
                  {formatRedemptionStatusLabel(item.status)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatRelativeTimeDe(item.requestedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type EditorState = {
  open: boolean
  reward: RewardItem | null
}

function ParentRewardsView({ token }: { token: string }) {
  const rewards = useQuery(api.rewards.list, { token })
  const removeReward = useMutation(api.rewards.remove)
  const [editor, setEditor] = useState<EditorState>({ open: false, reward: null })
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async (reward: RewardItem): Promise<void> => {
    const confirmed = window.confirm(
      "Belohnung wirklich löschen? Alle zugehörigen Anfragen werden ebenfalls gelöscht.",
    )
    if (!confirmed) {
      return
    }
    setDeleteError(null)
    try {
      await removeReward({ token, rewardId: reward._id })
    } catch {
      setDeleteError(DELETE_FAILED_MESSAGE)
    }
  }

  if (rewards === undefined) {
    return <LoadingState />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Belohnungen</h1>
        <Button
          type="button"
          onClick={() => setEditor({ open: true, reward: null })}
        >
          <Plus aria-hidden="true" />
          Neue Belohnung
        </Button>
      </div>

      {deleteError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      ) : null}

      {rewards.length === 0 ? (
        <p className="text-muted-foreground">
          Noch keine Belohnungen angelegt.
        </p>
      ) : (
        <>
          {/* Cards below lg. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {rewards.map((reward) => (
              <li
                key={reward._id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border bg-card p-3",
                  !reward.active && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex min-w-0 flex-1 items-center gap-2 text-base font-medium break-words">
                    {reward.emoji !== undefined ? (
                      <span aria-hidden="true">{reward.emoji}</span>
                    ) : null}
                    {reward.title}
                  </p>
                  {reward.active ? (
                    <span className="shrink-0 text-xs font-medium">Aktiv</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      Pausiert
                    </span>
                  )}
                </div>
                <div className="flex">
                  <PointsChip points={reward.cost} />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 flex-1"
                    aria-label={`Belohnung bearbeiten: ${reward.title}`}
                    onClick={() => setEditor({ open: true, reward })}
                  >
                    <Pencil aria-hidden="true" />
                    Bearbeiten
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="min-h-11 flex-1"
                    aria-label={`Belohnung löschen: ${reward.title}`}
                    onClick={() => void handleDelete(reward)}
                  >
                    <Trash2 aria-hidden="true" />
                    Löschen
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Table on lg. */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Belohnung
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Kosten
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((reward) => (
                  <tr
                    key={reward._id}
                    className={cn(
                      "border-b border-border last:border-0",
                      !reward.active && "opacity-60",
                    )}
                  >
                    <td className="max-w-64 px-4 py-3 font-medium">
                      <span className="flex items-center gap-2 break-words">
                        {reward.emoji !== undefined ? (
                          <span aria-hidden="true">{reward.emoji}</span>
                        ) : null}
                        {reward.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <PointsChip points={reward.cost} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {reward.active ? (
                        "Aktiv"
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                          Pausiert
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11"
                          aria-label={`Belohnung bearbeiten: ${reward.title}`}
                          onClick={() => setEditor({ open: true, reward })}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11"
                          aria-label={`Belohnung löschen: ${reward.title}`}
                          onClick={() => void handleDelete(reward)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <RewardEditor
        token={token}
        reward={editor.reward}
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
      />
    </div>
  )
}

export function RewardsPage() {
  const { token, user } = useSession()
  const isParent = user?.role === "parent"

  // Role-gated rendering: kids only ever query their own data (no userId) and
  // never fire parent-only queries/mutations.
  if (token === null || user === undefined) {
    return <LoadingState />
  }

  return isParent ? (
    <ParentRewardsView token={token} />
  ) : (
    <KidRewardsView token={token} />
  )
}

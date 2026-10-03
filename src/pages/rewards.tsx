import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { ChevronRight, Gift, Plus } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { PointsChip } from "@/components/chips"
import { ListGroup } from "@/components/list"
import { PageHeader } from "@/components/page-header"
import { PointsHero } from "@/components/points"
import { RewardEditor } from "@/components/reward-editor"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import {
  REDEMPTION_STATUS_LABELS,
  formatAvailableLabel,
  type RedemptionItem,
  type RewardItem,
} from "@/lib/rewards"
import { formatRelativeTimeDe } from "@/lib/tasks"

const REQUEST_FAILED_MESSAGE = "Nicht angefragt. Bitte erneut versuchen."
const NOT_ENOUGH_POINTS_MESSAGE = "Dafür reichen deine Punkte noch nicht."

function LoadingState() {
  return (
    <section aria-label="Belohnungen" className="flex flex-col gap-5">
      <Skeleton className="h-10 w-44 bg-muted" />
      <Skeleton className="h-32 rounded-3xl bg-muted" />
      <div className="grid grid-cols-2 gap-3" aria-hidden="true">
        <Skeleton className="h-52 rounded-3xl bg-muted" />
        <Skeleton className="h-52 rounded-3xl bg-muted" />
      </div>
    </section>
  )
}

function RewardEmoji({
  emoji,
  className,
}: {
  emoji: string | undefined
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-gold/15 leading-none",
        className,
      )}
    >
      {emoji ?? <Gift className="size-1/2 text-gold" />}
    </span>
  )
}

const STATUS_STYLES: Record<RedemptionItem["status"], string> = {
  requested: "bg-warning/12 text-warning",
  approved: "bg-success/12 text-success",
  rejected: "bg-destructive/10 text-destructive",
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
      <PageHeader title="Belohnungen" />

      <PointsHero
        balance={balance?.balance}
        caption={
          balance === undefined
            ? undefined
            : formatAvailableLabel(balance.available)
        }
      />

      {actionError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <section aria-label="Verfügbare Belohnungen">
        {rewards === undefined ? (
          <div className="grid grid-cols-2 gap-3" aria-hidden="true">
            <Skeleton className="h-52 rounded-3xl bg-muted" />
            <Skeleton className="h-52 rounded-3xl bg-muted" />
          </div>
        ) : rewards.length === 0 ? (
          <p className="rounded-3xl bg-card px-6 py-10 text-center text-muted-foreground shadow-[0_0_0_1px_var(--border)]">
            Noch keine Belohnungen. Frag Mama oder Papa, welche es geben soll.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {rewards.map((reward) => {
              const affordable =
                available !== undefined && available >= reward.cost
              const missing =
                available === undefined ? 0 : reward.cost - available
              const progress =
                available === undefined
                  ? 0
                  : Math.min(1, Math.max(0, available / reward.cost))
              const disabled = requestingId !== null || !affordable
              return (
                <li
                  key={reward._id}
                  className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_0_0_1px_var(--border)]"
                >
                  <RewardEmoji
                    emoji={reward.emoji}
                    className="size-14 text-3xl"
                  />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <p className="text-[0.9375rem] leading-snug font-semibold break-words">
                      {reward.title}
                    </p>
                    <PointsChip points={reward.cost} className="self-start" />
                  </div>
                  {affordable ? null : (
                    <div className="flex flex-col gap-1">
                      <div
                        role="progressbar"
                        aria-label={`Fortschritt zu ${reward.title}`}
                        aria-valuemin={0}
                        aria-valuemax={reward.cost}
                        aria-valuenow={Math.min(available ?? 0, reward.cost)}
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                      >
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{ width: `${String(progress * 100)}%` }}
                        />
                      </div>
                      {available !== undefined ? (
                        <p className="text-xs text-muted-foreground">
                          Noch {missing} {missing === 1 ? "Punkt" : "Punkte"}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <Button
                    type="button"
                    className={cn(
                      "h-10 w-full rounded-xl",
                      affordable &&
                        "bg-gold text-gold-foreground hover:bg-gold/90",
                    )}
                    variant={affordable ? "default" : "secondary"}
                    disabled={disabled}
                    aria-label={`${reward.title} einlösen, ${String(reward.cost)} Punkte`}
                    onClick={() => void handleRequest(reward)}
                  >
                    {requestingId === reward._id
                      ? "Wird angefragt …"
                      : "Einlösen"}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {mine === undefined ? (
        <Skeleton className="h-28 rounded-2xl bg-muted" aria-hidden="true" />
      ) : mine.length === 0 ? null : (
        <ListGroup title="Meine Anfragen" titleId="rewards-mine-heading">
          {mine.map((item) => (
            <li key={item._id} className="flex items-center gap-3 px-4 py-3">
              <RewardEmoji
                emoji={item.rewardEmoji}
                className="size-10 text-xl"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[0.9375rem] font-medium">
                  {item.rewardTitle}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatRelativeTimeDe(item.requestedAt)}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                  STATUS_STYLES[item.status],
                )}
              >
                {REDEMPTION_STATUS_LABELS[item.status]}
              </span>
            </li>
          ))}
        </ListGroup>
      )}
    </div>
  )
}

type EditorState = {
  open: boolean
  reward: RewardItem | null
}

function RewardRow({
  reward,
  onEdit,
}: {
  reward: RewardItem
  onEdit: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Belohnung bearbeiten: ${reward.title}`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:bg-muted active:bg-muted md:hover:bg-muted/60"
      >
        <RewardEmoji
          emoji={reward.emoji}
          className={cn("size-10 text-xl", !reward.active && "opacity-50")}
        />
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            !reward.active && "opacity-60",
          )}
        >
          <span className="truncate text-[1rem] font-semibold">
            {reward.title}
          </span>
          {!reward.active ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Pausiert
            </span>
          ) : null}
        </span>
        <PointsChip points={reward.cost} />
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground/60"
        />
      </button>
    </li>
  )
}

function ParentRewardsView({ token }: { token: string }) {
  const rewards = useQuery(api.rewards.list, { token })
  const removeReward = useMutation(api.rewards.remove)
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    reward: null,
  })

  const handleDelete = async (reward: RewardItem): Promise<void> => {
    await removeReward({ token, rewardId: reward._id })
    setEditor((prev) => ({ ...prev, open: false }))
  }

  if (rewards === undefined) {
    return <LoadingState />
  }

  const sorted = [...rewards].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.cost - b.cost,
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Belohnungen"
        subtitle="Was die Kinder sich mit Punkten wünschen können"
        actions={
          <Button
            type="button"
            onClick={() => setEditor({ open: true, reward: null })}
            aria-label="Neue Belohnung"
            className="size-11 rounded-full p-0 md:h-10 md:w-auto md:rounded-xl md:px-4"
          >
            <Plus aria-hidden="true" className="size-5 md:size-4" />
            <span className="hidden md:inline">Neue Belohnung</span>
          </Button>
        }
      />

      {rewards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-10 text-center shadow-[0_0_0_1px_var(--border)]">
          <p className="text-lg font-semibold">Noch keine Belohnungen</p>
          <p className="text-sm text-muted-foreground">
            Zum Beispiel „Eis essen gehen“ für 40 Punkte.
          </p>
          <Button
            type="button"
            className="h-11 rounded-xl"
            onClick={() => setEditor({ open: true, reward: null })}
          >
            <Plus aria-hidden="true" />
            Erste Belohnung anlegen
          </Button>
        </div>
      ) : (
        <ListGroup>
          {sorted.map((reward) => (
            <RewardRow
              key={reward._id}
              reward={reward}
              onEdit={() => setEditor({ open: true, reward })}
            />
          ))}
        </ListGroup>
      )}

      <RewardEditor
        token={token}
        reward={editor.reward}
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        onDelete={handleDelete}
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

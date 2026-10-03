import { cn } from "cn"
import { Link } from "react-router"
import { ListGroup } from "@/components/list"
import { Skeleton } from "@/components/ui/skeleton"
import {
  REASON_LABELS,
  formatDelta,
  formatPointsLabel,
  formatTransactionDate,
  type PointTransaction,
} from "@/lib/points"

/**
 * The kid's points as the one loud element of their screens: a gold tile
 * with a big number. Optional link (Today → Points). The live region
 * announces balance changes (e.g. after a parent adjustment).
 */
export function PointsHero({
  balance,
  caption,
  to,
}: {
  balance: number | undefined
  /** Second line under the number, e.g. "43 davon verfügbar". */
  caption?: string
  to?: string
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 -bottom-3 text-[5.75rem] leading-none select-none"
      >
        🏆
      </span>
      <span className="relative flex flex-col gap-0.5">
        <span className="text-[0.9375rem] font-semibold opacity-80">
          Deine Punkte
        </span>
        {balance === undefined ? (
          <Skeleton className="my-1 h-12 w-32 bg-gold-foreground/15" />
        ) : (
          <span
            aria-live="polite"
            className="text-[3.5rem] leading-none font-bold tracking-[-0.04em] tabular-nums"
          >
            <span className="sr-only">{formatPointsLabel(balance)}</span>
            <span aria-hidden="true">{balance}</span>
          </span>
        )}
        {caption !== undefined ? (
          <span className="pt-1 text-sm font-medium opacity-80">{caption}</span>
        ) : null}
      </span>
    </>
  )

  const className =
    "relative flex overflow-hidden rounded-3xl bg-gold px-5 py-5 text-gold-foreground shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--gold)_80%,transparent)]"

  if (to !== undefined) {
    return (
      <Link
        to={to}
        className={cn(
          className,
          "pressable outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        )}
      >
        {content}
        <span className="sr-only">Zu den Punkten</span>
      </Link>
    )
  }
  return (
    <section aria-label="Punktestand" className={className}>
      {content}
    </section>
  )
}

// Transaction list (newest first), shared by the kid view and the parent view.
export function PointsHistory({
  transactions,
  emptyText = "Noch keine Punkte. Hake Aufgaben ab, um Punkte zu sammeln.",
}: {
  transactions: PointTransaction[] | undefined
  emptyText?: string
}) {
  if (transactions === undefined) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-16 rounded-2xl bg-muted" />
        <Skeleton className="h-16 rounded-2xl bg-muted" />
        <Skeleton className="h-16 rounded-2xl bg-muted" />
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-muted-foreground">
        {emptyText}
      </p>
    )
  }

  return (
    <ListGroup>
      {transactions.map((transaction) => {
        const credit = transaction.delta >= 0
        return (
          <li
            key={transaction._id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-[0.9375rem] font-medium">
                {transaction.note ??
                  REASON_LABELS[transaction.reason] ??
                  transaction.reason}
              </p>
              <p className="text-sm text-muted-foreground">
                {REASON_LABELS[transaction.reason] ?? transaction.reason}
                {" – "}
                {formatTransactionDate(transaction.createdAt)}
              </p>
            </div>
            <p
              className={cn(
                "shrink-0 text-lg font-bold tabular-nums",
                credit ? "text-success" : "text-destructive",
              )}
            >
              <span aria-hidden="true">{formatDelta(transaction.delta)}</span>
              <span className="sr-only">
                {credit
                  ? `plus ${String(transaction.delta)} Punkte`
                  : `minus ${String(Math.abs(transaction.delta))} Punkte`}
              </span>
            </p>
          </li>
        )
      })}
    </ListGroup>
  )
}

import { Skeleton } from "@/components/ui/skeleton"
import {
  REASON_LABELS,
  formatDelta,
  formatPointsLabel,
  formatTransactionDate,
  type PointTransaction,
} from "@/lib/points"

// Big trophy counter, shared by the Today card and the Points page. Renders a
// skeleton while the balance loads. The live region announces balance changes
// (e.g. after a parent adjustment in another tab).
export function PointsCounter({
  balance,
}: {
  balance: number | undefined
}) {
  if (balance === undefined) {
    return <Skeleton className="h-9 w-48 bg-muted" aria-hidden="true" />
  }
  return (
    <p aria-live="polite" className="text-3xl font-bold tracking-tight">
      <span aria-hidden="true">🏆 </span>
      {formatPointsLabel(balance)}
    </p>
  )
}

// Transaction list (newest first), shared by the kid view and the parent view.
export function PointsHistory({
  transactions,
}: {
  transactions: PointTransaction[] | undefined
}) {
  if (transactions === undefined) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-[4.5rem] bg-muted" />
        <Skeleton className="h-[4.5rem] bg-muted" />
        <Skeleton className="h-[4.5rem] bg-muted" />
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <p className="text-muted-foreground">
        Noch keine Punkte. Erledige Aufgaben, um Punkte zu sammeln!
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {transactions.map((transaction) => {
        const credit = transaction.delta >= 0
        return (
          <li
            key={transaction._id}
            className="flex items-start justify-between gap-3 rounded-xl border bg-card p-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-base font-medium">
                {REASON_LABELS[transaction.reason]}
              </p>
              {transaction.note ? (
                <p className="text-sm break-words text-muted-foreground">
                  {transaction.note}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {formatTransactionDate(transaction.createdAt)}
              </p>
            </div>
            <p
              className={
                credit
                  ? "shrink-0 text-lg font-bold text-emerald-600 dark:text-emerald-400"
                  : "shrink-0 text-lg font-bold text-destructive"
              }
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
    </ul>
  )
}

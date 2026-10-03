import { useState } from "react"
import type { CSSProperties, FormEvent } from "react"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { Minus, Plus } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Avatar } from "@/components/avatar"
import { PageHeader } from "@/components/page-header"
import { PointsHero, PointsHistory } from "@/components/points"
import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import { type PointsBalanceEntry } from "@/lib/points"

const MAX_ADJUST_ABS = 10000
const MAX_NOTE_LENGTH = 200

const AMOUNT_ERROR_MESSAGE = "Gib eine ganze Zahl zwischen 1 und 10000 ein."
const NOTE_REQUIRED_MESSAGE = "Gib einen Grund ein."
const SAVE_FAILED_MESSAGE = "Nicht gespeichert. Bitte erneut versuchen."

type Direction = "add" | "subtract"

function LoadingState() {
  return (
    <section aria-label="Punkte" className="flex flex-col gap-5">
      <Skeleton className="h-10 w-32 bg-muted" />
      <Skeleton className="h-32 rounded-3xl bg-muted" />
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-16 rounded-2xl bg-muted" />
        <Skeleton className="h-16 rounded-2xl bg-muted" />
      </div>
    </section>
  )
}

function KidPointsView({ token }: { token: string }) {
  const balance = useQuery(api.points.getBalance, { token })
  const history = useQuery(api.points.listHistory, { token })
  const reserved =
    balance === undefined ? 0 : balance.balance - balance.available

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Punkte" />
      <PointsHero
        balance={balance?.balance}
        caption={
          balance !== undefined && reserved > 0
            ? `${String(balance.available)} verfügbar, ${String(reserved)} für offene Wünsche reserviert`
            : undefined
        }
      />
      <section
        aria-labelledby="points-history-heading"
        className="flex flex-col gap-2"
      >
        <h2
          id="points-history-heading"
          className="px-1 text-[0.9375rem] font-semibold tracking-tight"
        >
          Verlauf
        </h2>
        <PointsHistory transactions={history} />
      </section>
    </div>
  )
}

function ParentPointsView({ token }: { token: string }) {
  const balances = useQuery(api.points.listBalances, { token })
  const adjust = useMutation(api.points.adjust)

  // Selected kid for the history below; defaults to the first kid (balances
  // arrive name-sorted from the server).
  const [selectedKidId, setSelectedKidId] = useState<Id<"users"> | null>(null)
  // Guard against a stale selection (kid vanished from balances): fall back
  // to the first kid instead of querying history for an unknown user.
  const selectedValid =
    balances?.some((kid) => kid.userId === selectedKidId) ?? false
  const effectiveKidId =
    (selectedValid ? selectedKidId : balances?.[0]?.userId) ?? null
  const selectedKid = balances?.find((kid) => kid.userId === effectiveKidId)
  const selectedHistory = useQuery(
    api.points.listHistory,
    effectiveKidId ? { token, userId: effectiveKidId } : "skip",
  )

  const [adjustTarget, setAdjustTarget] = useState<PointsBalanceEntry | null>(
    null,
  )
  const [direction, setDirection] = useState<Direction>("add")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [amountError, setAmountError] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const resetForm = (): void => {
    setDirection("add")
    setAmount("")
    setNote("")
    setAmountError(null)
    setNoteError(null)
    setSaveError(null)
  }

  const openAdjust = (kid: PointsBalanceEntry): void => {
    resetForm()
    setAdjustTarget(kid)
  }

  const closeAdjust = (): void => {
    if (busy) {
      return
    }
    setAdjustTarget(null)
    resetForm()
  }

  const handleAdjustSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (busy || adjustTarget === null) {
      return
    }
    const parsed = Number(amount)
    const amountValid =
      amount.trim() !== "" &&
      Number.isInteger(parsed) &&
      parsed >= 1 &&
      parsed <= MAX_ADJUST_ABS
    const trimmedNote = note.trim()
    setAmountError(amountValid ? null : AMOUNT_ERROR_MESSAGE)
    setNoteError(trimmedNote === "" ? NOTE_REQUIRED_MESSAGE : null)
    if (!amountValid || trimmedNote === "") {
      return
    }
    const target = adjustTarget
    const delta = direction === "add" ? parsed : -parsed
    setBusy(true)
    setSaveError(null)
    void (async (): Promise<void> => {
      try {
        await adjust({ token, userId: target.userId, delta, note: trimmedNote })
        setAdjustTarget(null)
        resetForm()
      } catch {
        setSaveError(SAVE_FAILED_MESSAGE)
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Punkte"
        subtitle="Kontostände und Verlauf der Kinder"
      />

      {balances === undefined ? (
        <div className="grid grid-cols-2 gap-3" aria-hidden="true">
          <Skeleton className="h-40 rounded-3xl bg-muted" />
          <Skeleton className="h-40 rounded-3xl bg-muted" />
        </div>
      ) : balances.length === 0 ? (
        <p className="text-muted-foreground">Keine Kinder gefunden.</p>
      ) : (
        <ul
          aria-label="Kontostände"
          className="grid grid-cols-2 gap-3 lg:grid-cols-3"
        >
          {balances.map((kid) => {
            const selected = kid.userId === effectiveKidId
            return (
              <li
                key={kid.userId}
                className={cn(
                  "flex flex-col gap-3 rounded-3xl bg-card p-4 transition-shadow",
                  selected
                    ? "shadow-[0_0_0_2px_var(--kid-color),0_8px_24px_-16px_var(--kid-color)]"
                    : "shadow-[0_0_0_1px_var(--border)]",
                )}
                style={{ "--kid-color": kid.color } as CSSProperties}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Verlauf von ${kid.name} anzeigen`}
                  onClick={() => setSelectedKidId(kid.userId)}
                  className="pressable flex flex-col items-start gap-3 rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                    <Avatar emoji={kid.emoji} color={kid.color} size="sm" />
                    {kid.name}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[2.5rem] leading-none font-bold tracking-[-0.04em] tabular-nums">
                      {kid.balance}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {kid.balance === 1 ? "Punkt" : "Punkte"}
                    </span>
                  </span>
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-full rounded-xl"
                  aria-label={`Punkte für ${kid.name} anpassen`}
                  onClick={() => openAdjust(kid)}
                >
                  Anpassen
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {selectedKid !== undefined ? (
        <section
          aria-labelledby="points-history-heading"
          className="flex flex-col gap-2"
        >
          <h2
            id="points-history-heading"
            className="px-1 text-[0.9375rem] font-semibold tracking-tight"
          >
            Verlauf von {selectedKid.name}
          </h2>
          <PointsHistory
            transactions={selectedHistory}
            emptyText={`${selectedKid.name} hat noch keine Punkte.`}
          />
        </section>
      ) : null}

      <ResponsiveDialog
        open={adjustTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeAdjust()
          }
        }}
        dismissible={!busy}
        title={
          adjustTarget === null
            ? "Punkte anpassen"
            : `Punkte für ${adjustTarget.name}`
        }
      >
        <form
          onSubmit={handleAdjustSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <div
            role="radiogroup"
            aria-label="Art der Anpassung"
            className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
          >
            {(
              [
                { value: "add", label: "Gutschrift", icon: Plus },
                { value: "subtract", label: "Abzug", icon: Minus },
              ] as const
            ).map((option) => {
              const checked = direction === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={busy}
                  onClick={() => setDirection(option.value)}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    checked
                      ? option.value === "add"
                        ? "bg-card text-success shadow-sm"
                        : "bg-card text-destructive shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  <option.icon aria-hidden="true" className="size-4" />
                  {option.label}
                </button>
              )
            })}
          </div>

          <label
            htmlFor="points-adjust-amount"
            className="flex flex-col gap-1.5 text-sm font-medium"
          >
            Punkte
            <Input
              id="points-adjust-amount"
              type="number"
              inputMode="numeric"
              step={1}
              min={1}
              max={MAX_ADJUST_ABS}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="z. B. 10"
              disabled={busy}
              aria-invalid={amountError !== null}
              aria-describedby={
                amountError !== null ? "points-adjust-amount-error" : undefined
              }
            />
          </label>
          {amountError !== null ? (
            <p
              id="points-adjust-amount-error"
              role="alert"
              className="-mt-2 text-sm text-destructive"
            >
              {amountError}
            </p>
          ) : null}
          <label
            htmlFor="points-adjust-note"
            className="flex flex-col gap-1.5 text-sm font-medium"
          >
            Grund
            <Input
              id="points-adjust-note"
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="z. B. beim Einkaufen geholfen"
              maxLength={MAX_NOTE_LENGTH}
              disabled={busy}
              aria-invalid={noteError !== null}
              aria-describedby={
                noteError !== null ? "points-adjust-note-error" : undefined
              }
            />
          </label>
          {noteError !== null ? (
            <p
              id="points-adjust-note-error"
              role="alert"
              className="-mt-2 text-sm text-destructive"
            >
              {noteError}
            </p>
          ) : null}
          {saveError !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl sm:h-10"
              disabled={busy}
              onClick={closeAdjust}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              className="h-11 rounded-xl sm:h-10"
              disabled={busy}
            >
              {direction === "add" ? "Punkte gutschreiben" : "Punkte abziehen"}
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </div>
  )
}

export function PointsPage() {
  const { token, user } = useSession()
  const isParent = user?.role === "parent"

  // Role-gated queries: kids only ever query their own data (no userId), and
  // the parent-only listBalances query never runs for kids.
  if (token === null || user === undefined) {
    return <LoadingState />
  }

  return isParent ? (
    <ParentPointsView token={token} />
  ) : (
    <KidPointsView token={token} />
  )
}

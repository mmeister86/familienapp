import { useState } from "react"
import type { FormEvent } from "react"
import { useMutation, useQuery } from "convex/react"
import { cn } from "cn"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { PointsCounter, PointsHistory } from "@/components/points"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import { formatPointsLabel, type PointsBalanceEntry } from "@/lib/points"

const MAX_ADJUST_ABS = 10000
const MAX_NOTE_LENGTH = 200

const AMOUNT_ERROR_MESSAGE =
  "Bitte eine Zahl ungleich 0 eingeben (max. ±10000)."
const NOTE_REQUIRED_MESSAGE = "Bitte eine Notiz eingeben."
const SAVE_FAILED_MESSAGE = "Speichern fehlgeschlagen. Bitte erneut versuchen."

function LoadingState() {
  return (
    <section aria-label="Punkte" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-32 bg-muted" />
      <Skeleton className="h-24 bg-muted" />
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-16 bg-muted" />
        <Skeleton className="h-16 bg-muted" />
      </div>
    </section>
  )
}

function KidPointsView({
  token,
}: {
  token: string
}) {
  const balance = useQuery(api.points.getBalance, { token })
  const history = useQuery(api.points.listHistory, { token })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Punkte</h1>

      <section
        aria-label="Punktestand"
        className="rounded-xl border bg-card p-4 sm:p-6"
      >
        <PointsCounter balance={balance?.balance} />
      </section>

      <section
        aria-labelledby="points-history-heading"
        className="flex flex-col gap-3"
      >
        <h2
          id="points-history-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Verlauf
        </h2>
        <PointsHistory transactions={history} />
      </section>
    </div>
  )
}

function ParentPointsView({
  token,
}: {
  token: string
}) {
  const balances = useQuery(api.points.listBalances, { token })
  const adjust = useMutation(api.points.adjust)

  // Selected kid for the history below; defaults to the first kid (balances
  // arrive name-sorted from the server).
  const [selectedKidId, setSelectedKidId] = useState<Id<"users"> | null>(null)
  const effectiveKidId = selectedKidId ?? balances?.[0]?.userId ?? null
  const selectedHistory = useQuery(
    api.points.listHistory,
    effectiveKidId ? { token, userId: effectiveKidId } : "skip",
  )

  const [adjustTarget, setAdjustTarget] = useState<PointsBalanceEntry | null>(
    null,
  )
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [amountError, setAmountError] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const openAdjust = (kid: PointsBalanceEntry): void => {
    setAdjustTarget(kid)
    setAmount("")
    setNote("")
    setAmountError(null)
    setNoteError(null)
    setSaveError(null)
  }

  const closeAdjust = (): void => {
    if (busy) {
      return
    }
    setAdjustTarget(null)
    setAmount("")
    setNote("")
    setAmountError(null)
    setNoteError(null)
    setSaveError(null)
  }

  const viewHistory = (kid: PointsBalanceEntry): void => {
    setSelectedKidId(kid.userId)
    document
      .getElementById("points-history")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
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
      parsed !== 0 &&
      Math.abs(parsed) <= MAX_ADJUST_ABS
    const trimmedNote = note.trim()
    setAmountError(amountValid ? null : AMOUNT_ERROR_MESSAGE)
    setNoteError(trimmedNote === "" ? NOTE_REQUIRED_MESSAGE : null)
    if (!amountValid || trimmedNote === "") {
      return
    }
    const target = adjustTarget
    const delta = parsed
    setBusy(true)
    setSaveError(null)
    void (async (): Promise<void> => {
      try {
        await adjust({ token, userId: target.userId, delta, note: trimmedNote })
        setAdjustTarget(null)
        setAmount("")
        setNote("")
      } catch {
        setSaveError(SAVE_FAILED_MESSAGE)
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Punkte</h1>

      <section
        aria-labelledby="points-balances-heading"
        className="flex flex-col gap-3"
      >
        <h2
          id="points-balances-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Kontostände
        </h2>
        {balances === undefined ? (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-hidden="true"
          >
            <Skeleton className="h-36 bg-muted" />
            <Skeleton className="h-36 bg-muted" />
          </div>
        ) : balances.length === 0 ? (
          <p className="text-muted-foreground">Keine Kinder gefunden.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {balances.map((kid) => (
              <li
                key={kid.userId}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4"
              >
                <p className="flex items-center gap-2 text-base font-medium">
                  <span aria-hidden="true">{kid.emoji}</span>
                  {kid.name}
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  <span aria-hidden="true">🏆 </span>
                  {formatPointsLabel(kid.balance)}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 flex-1"
                    onClick={() => viewHistory(kid)}
                  >
                    Verlauf ansehen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 flex-1"
                    onClick={() => openAdjust(kid)}
                  >
                    Anpassen
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="points-history"
        aria-labelledby="points-history-heading"
        className="flex scroll-mt-4 flex-col gap-3"
      >
        <h2
          id="points-history-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Verlauf
        </h2>
        {balances === undefined ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            <Skeleton className="h-8 w-48 bg-muted" />
            <Skeleton className="h-16 bg-muted" />
            <Skeleton className="h-16 bg-muted" />
          </div>
        ) : balances.length === 0 ? null : (
          <>
            <div role="group" aria-label="Kind auswählen" className="flex flex-wrap gap-2">
              {balances.map((kid) => {
                const selected = kid.userId === effectiveKidId
                return (
                  <Button
                    key={kid.userId}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    onClick={() => setSelectedKidId(kid.userId)}
                    className="min-h-11"
                  >
                    <span aria-hidden="true">{kid.emoji}</span>
                    {kid.name}
                  </Button>
                )
              })}
            </div>
            <PointsHistory transactions={selectedHistory} />
          </>
        )}
      </section>

      <Dialog
        open={adjustTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeAdjust()
          }
        }}
      >
        <DialogContent showCloseButton={!busy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustTarget === null
                ? "Punkte anpassen"
                : `Punkte für ${adjustTarget.name} anpassen`}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleAdjustSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            <label
              htmlFor="points-adjust-amount"
              className="flex flex-col gap-1.5 text-sm font-medium"
            >
              Betrag
              <Input
                id="points-adjust-amount"
                type="number"
                step={1}
                min={-MAX_ADJUST_ABS}
                max={MAX_ADJUST_ABS}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="z. B. 10 oder -5"
                disabled={busy}
                aria-invalid={amountError !== null}
                aria-describedby={
                  amountError !== null
                    ? "points-adjust-amount-error"
                    : undefined
                }
                className={cn(amountError !== null && "border-destructive")}
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
              Notiz
              <Input
                id="points-adjust-note"
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Grund für die Anpassung"
                maxLength={MAX_NOTE_LENGTH}
                disabled={busy}
                aria-invalid={noteError !== null}
                aria-describedby={
                  noteError !== null ? "points-adjust-note-error" : undefined
                }
                className={cn(noteError !== null && "border-destructive")}
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
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={closeAdjust}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={busy}>
                Speichern
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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

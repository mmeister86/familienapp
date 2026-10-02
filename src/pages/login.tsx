import { useCallback, useEffect, useRef, useState } from "react"
import { Navigate } from "react-router"
import { cn } from "cn"
import { ArrowLeft, Delete, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/useSession"
import { PROFILES, type Profile } from "@/profiles"

const FALLBACK_LOGIN_ERROR =
  "Anmeldung fehlgeschlagen. Bitte erneut versuchen."

// Custom PIN pad built from Button primitives: shadcn's OTP input would need
// the extra `input-otp` dependency, and a tap-friendly numeric pad fits the
// family/kiosk-style login better than a text field.
const PIN_PAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

// German login screen. Step 1 renders the hardcoded profiles with NO backend
// call; the server is only contacted when a complete PIN is submitted.
export function LoginPage() {
  const { status, login } = useSession()
  const [selected, setSelected] = useState<Profile | null>(null)
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Ref mirror of `submitting` so rapid taps/keys cannot double-submit.
  const submittingRef = useRef(false)

  const goBack = useCallback((): void => {
    if (submittingRef.current) {
      return
    }
    setSelected(null)
    setPin("")
    setError(null)
  }, [])

  const submitPin = useCallback(
    async (profile: Profile, code: string): Promise<void> => {
      if (submittingRef.current) {
        return
      }
      submittingRef.current = true
      setSubmitting(true)
      setError(null)
      try {
        await login(profile.slug, code)
        // Success flips the session to authenticated and the Navigate below
        // takes over once the `me` query resolves.
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : FALLBACK_LOGIN_ERROR,
        )
        setPin("")
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [login],
  )

  const appendDigit = useCallback(
    (digit: string): void => {
      if (selected === null || submittingRef.current) {
        return
      }
      if (pin.length >= selected.pinLength) {
        return
      }
      const next = pin + digit
      setError(null)
      setPin(next)
      if (next.length === selected.pinLength) {
        void submitPin(selected, next)
      }
    },
    [selected, pin, submitPin],
  )

  const deleteDigit = useCallback((): void => {
    if (selected === null || submittingRef.current) {
      return
    }
    if (pin.length === 0) {
      return
    }
    setError(null)
    setPin(pin.slice(0, -1))
  }, [selected, pin])

  // Physical keyboard: digits append, Backspace deletes, Enter submits a
  // complete PIN, Escape returns to the avatar grid.
  useEffect(() => {
    if (selected === null) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        appendDigit(event.key)
      } else if (event.key === "Backspace") {
        event.preventDefault()
        deleteDigit()
      } else if (event.key === "Enter") {
        if (pin.length === selected.pinLength) {
          event.preventDefault()
          void submitPin(selected, pin)
        }
      } else if (event.key === "Escape") {
        event.preventDefault()
        goBack()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selected, pin, appendDigit, deleteDigit, submitPin, goBack])

  if (status === "authenticated") {
    return <Navigate to="/" replace />
  }

  if (status === "loading") {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-6">
        <div
          className="flex flex-col items-center gap-3"
          role="status"
          aria-label="Wird geladen"
        >
          <LoaderCircle
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3" aria-hidden="true">
          {PROFILES.map((profile) => (
            <Skeleton key={profile.slug} className="h-36 bg-muted" />
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center px-4 py-6">
      {selected === null ? (
        <section
          aria-labelledby="login-heading"
          className="flex w-full flex-col gap-6"
        >
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 id="login-heading" className="text-2xl font-semibold">
              Wer meldet sich an?
            </h1>
            <p className="text-sm text-muted-foreground">
              Wähle dein Profil aus.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {PROFILES.map((profile) => (
              <li key={profile.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(profile)
                    setPin("")
                    setError(null)
                  }}
                  className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 bg-card p-6 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ borderColor: `${profile.color}66` }}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-16 items-center justify-center rounded-full text-4xl"
                    style={{ backgroundColor: `${profile.color}26` }}
                  >
                    {profile.emoji}
                  </span>
                  <span className="text-lg font-semibold">{profile.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section
          aria-labelledby="pin-heading"
          className="flex w-full flex-col items-center gap-5"
        >
          <div className="flex w-full items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={goBack}
              disabled={submitting}
            >
              <ArrowLeft aria-hidden="true" />
              Abbrechen
            </Button>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full text-4xl"
              style={{ backgroundColor: `${selected.color}26` }}
            >
              {selected.emoji}
            </span>
            <h1 id="pin-heading" className="text-2xl font-semibold">
              Hallo, {selected.name}!
            </h1>
            <p className="text-sm text-muted-foreground">Gib deine PIN ein.</p>
          </div>
          <div
            className="flex items-center gap-3"
            role="status"
            aria-label={`PIN-Eingabe: ${pin.length} von ${selected.pinLength} Ziffern`}
          >
            <span className="sr-only">
              {pin.length} von {selected.pinLength} Ziffern eingegeben
            </span>
            {Array.from({ length: selected.pinLength }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className={cn(
                  "size-4 rounded-full border",
                  index < pin.length
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40 bg-muted",
                )}
              />
            ))}
          </div>
          <div
            className="flex min-h-6 items-center justify-center"
            aria-live="polite"
          >
            {submitting ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
                Wird angemeldet …
              </p>
            ) : error !== null ? (
              <p
                role="alert"
                className="text-center text-sm font-medium text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
          <div
            className="grid w-full max-w-60 grid-cols-3 gap-2"
            role="group"
            aria-label="Ziffernblock"
          >
            {PIN_PAD_DIGITS.map((digit) => (
              <Button
                key={digit}
                type="button"
                variant="outline"
                size="lg"
                className="h-14 text-xl"
                disabled={submitting}
                onClick={() => appendDigit(digit)}
              >
                {digit}
              </Button>
            ))}
            <span aria-hidden="true" />
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-14 text-xl"
              disabled={submitting}
              onClick={() => appendDigit("0")}
            >
              0
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-14"
              disabled={submitting}
              onClick={deleteDigit}
              aria-label="Letzte Ziffer löschen"
            >
              <Delete aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}
    </main>
  )
}

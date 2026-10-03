import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { Navigate } from "react-router"
import { cn } from "cn"
import { ArrowLeft, Delete, House, LoaderCircle } from "lucide-react"
import { Avatar } from "@/components/avatar"
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
  const { status, user, login } = useSession()
  const [selected, setSelected] = useState<Profile | null>(null)
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Ref mirror of `submitting` so rapid taps/keys cannot double-submit.
  const submittingRef = useRef(false)
  // Synchronous accumulator for digit entry: handlers read the latest value
  // instead of a stale render-scope closure, so two taps/keys before a
  // re-render cannot lose a digit. `pin` state mirrors it for rendering the
  // dots; every mutation goes through setPinState so the two cannot drift.
  const pinRef = useRef("")

  const setPinState = useCallback((next: string): void => {
    pinRef.current = next
    setPin(next)
  }, [])

  // Focus target for step transitions. Selecting an avatar unmounts the
  // focused tile (and going back unmounts the PIN step), which would drop
  // keyboard focus to <body>; moving it to the new step's heading keeps
  // keyboard/screen-reader users oriented. Explicit effect instead of the
  // autoFocus prop: native autofocus only fires during page load, not for
  // dynamically mounted elements.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const stepKey = selected === null ? null : selected.slug
  useEffect(() => {
    headingRef.current?.focus()
  }, [stepKey])

  const goBack = useCallback((): void => {
    if (submittingRef.current) {
      return
    }
    setSelected(null)
    setPinState("")
    setError(null)
  }, [setPinState])

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
        setPinState("")
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [login, setPinState],
  )

  const appendDigit = useCallback(
    (digit: string): void => {
      if (selected === null || submittingRef.current) {
        return
      }
      const prev = pinRef.current
      if (prev.length >= selected.pinLength) {
        return
      }
      const next = prev + digit
      setError(null)
      setPinState(next)
      if (next.length === selected.pinLength) {
        void submitPin(selected, next)
      }
    },
    [selected, submitPin, setPinState],
  )

  const deleteDigit = useCallback((): void => {
    if (submittingRef.current || pinRef.current.length === 0) {
      return
    }
    setError(null)
    setPinState(pinRef.current.slice(0, -1))
  }, [setPinState])

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
        if (pinRef.current.length === selected.pinLength) {
          event.preventDefault()
          void submitPin(selected, pinRef.current)
        }
      } else if (event.key === "Escape") {
        event.preventDefault()
        goBack()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selected, appendDigit, deleteDigit, submitPin, goBack])

  if (status === "authenticated") {
    return <Navigate to={user?.role === "parent" ? "/overview" : "/"} replace />
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

  const padKeyClassName =
    "pressable flex size-[4.5rem] items-center justify-center justify-self-center rounded-full bg-card text-[1.75rem] font-medium tabular-nums shadow-[0_0_0_1px_var(--border)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:hover:bg-muted"

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center px-5 pt-safe pb-safe">
      {selected === null ? (
        <section
          aria-labelledby="login-heading"
          className="flex w-full flex-col gap-8 py-8"
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <span
              aria-hidden="true"
              className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_var(--primary)]"
            >
              <House className="size-7" strokeWidth={2.3} />
            </span>
            <div className="flex flex-col gap-1">
              <h1
                id="login-heading"
                ref={headingRef}
                tabIndex={-1}
                className="text-[2rem] leading-tight font-bold tracking-[-0.03em] outline-none"
              >
                Wer bist du?
              </h1>
              <p className="text-[0.9375rem] text-muted-foreground">
                Tippe auf dein Profil.
              </p>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {PROFILES.map((profile) => (
              <li key={profile.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(profile)
                    setPinState("")
                    setError(null)
                  }}
                  className="pressable flex w-full flex-col items-center gap-3 rounded-3xl bg-card px-4 py-6 shadow-[0_0_0_1px_var(--border)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hover:shadow-[0_0_0_2px_var(--profile-color)]"
                  style={{ "--profile-color": profile.color } as CSSProperties}
                >
                  <Avatar emoji={profile.emoji} color={profile.color} size="xl" />
                  <span className="flex flex-col items-center">
                    <span className="text-lg font-bold tracking-tight">
                      {profile.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {profile.role === "parent" ? "Elternteil" : "Kind"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section
          aria-labelledby="pin-heading"
          className="flex w-full flex-col items-center gap-6 py-6"
        >
          <div className="flex w-full items-center">
            <Button
              type="button"
              variant="ghost"
              className="-ml-2 h-10 rounded-xl text-[0.9375rem]"
              onClick={goBack}
              disabled={submitting}
            >
              <ArrowLeft aria-hidden="true" />
              Profile
            </Button>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar emoji={selected.emoji} color={selected.color} size="xl" />
            <div className="flex flex-col gap-1">
              <h1
                id="pin-heading"
                ref={headingRef}
                tabIndex={-1}
                className="text-[1.75rem] leading-tight font-bold tracking-[-0.03em] outline-none"
              >
                Hallo, {selected.name}!
              </h1>
              <p className="text-[0.9375rem] text-muted-foreground">
                Gib deine PIN ein.
              </p>
            </div>
          </div>
          <div
            key={error ?? "ok"}
            className={cn(
              "flex items-center gap-4 py-1",
              error !== null && "animate-shake",
            )}
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
                  "size-3.5 rounded-full border-2 transition-colors duration-150",
                  index < pin.length
                    ? "border-primary bg-primary"
                    : error !== null
                      ? "border-destructive/60"
                      : "border-muted-foreground/40",
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
            className="grid w-full max-w-[17.5rem] grid-cols-3 gap-x-6 gap-y-4"
            role="group"
            aria-label="Ziffernblock"
          >
            {PIN_PAD_DIGITS.map((digit) => (
              <button
                key={digit}
                type="button"
                className={padKeyClassName}
                disabled={submitting}
                onClick={() => appendDigit(digit)}
              >
                {digit}
              </button>
            ))}
            <span aria-hidden="true" />
            <button
              type="button"
              className={padKeyClassName}
              disabled={submitting}
              onClick={() => appendDigit("0")}
            >
              0
            </button>
            <button
              type="button"
              className="pressable flex size-[4.5rem] items-center justify-center justify-self-center rounded-full text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:hover:bg-muted"
              disabled={submitting}
              onClick={deleteDigit}
              aria-label="Letzte Ziffer löschen"
            >
              <Delete aria-hidden="true" className="size-7" />
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

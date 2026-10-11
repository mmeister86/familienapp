"use client"

import { useEffect, useState } from "react"

// Laptop is >= 1024 px (`lg`): the expanded sidebar breakpoint and the
// minimum width for desktop-only pages like the scene builder.
const LAPTOP_BREAKPOINT = 1024

function matchesLaptop(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(`(min-width: ${LAPTOP_BREAKPOINT}px)`).matches
  )
}

// Resolved synchronously at mount (no undefined first render): guards must
// not redirect before the viewport is known.
export function useIsLaptop() {
  const [isLaptop, setIsLaptop] = useState(matchesLaptop)

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }
    const mql = window.matchMedia(`(min-width: ${LAPTOP_BREAKPOINT}px)`)
    const onChange = (event: MediaQueryListEvent): void => {
      setIsLaptop(event.matches)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isLaptop
}

"use client"

import { useEffect, useState } from "react"

// Laptop is >= 1024 px (`lg`): the expanded sidebar breakpoint and the
// minimum width for desktop-only pages like the scene builder.
const LAPTOP_BREAKPOINT = 1024

export function useIsLaptop() {
  const [isLaptop, setIsLaptop] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LAPTOP_BREAKPOINT}px)`)
    const onChange = () => {
      setIsLaptop(window.innerWidth >= LAPTOP_BREAKPOINT)
    }

    mql.addEventListener("change", onChange)
    setTimeout(() => setIsLaptop(window.innerWidth >= LAPTOP_BREAKPOINT), 0)

    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isLaptop
}

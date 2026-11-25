export type History<T> = { past: readonly T[]; future: readonly T[] }

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] }
}

/** Remember the state before a change; drops the oldest beyond the limit and clears redo. */
export function record<T>(history: History<T>, before: T, limit = 20): History<T> {
  return { past: [...history.past, before].slice(-limit), future: [] }
}

export function undo<T>(
  history: History<T>,
  current: T,
): { history: History<T>; value: T } | null {
  if (history.past.length === 0) {
    return null
  }
  return {
    value: history.past[history.past.length - 1],
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future],
    },
  }
}

export function redo<T>(
  history: History<T>,
  current: T,
): { history: History<T>; value: T } | null {
  if (history.future.length === 0) {
    return null
  }
  return {
    value: history.future[0],
    history: {
      past: [...history.past, current],
      future: history.future.slice(1),
    },
  }
}

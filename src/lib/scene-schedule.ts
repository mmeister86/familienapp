// Pure schedule helpers for the scene builder (Phase 8).

export type DayKind = "schoolDay" | "weekend"

export type SceneScheduleInput = {
  sceneId: string
  name: string
  start: { schoolDay: string | null; weekend: string | null }
}

export type DaySegment = {
  sceneId: string
  name: string
  /** Minutes since midnight, [fromMin, toMin). */
  fromMin: number
  toMin: number
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

function toMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value)
  if (match === null) {
    return null
  }
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * Schematic day bar: each scene runs from its start to the next start, and
 * before the first start the last scene runs on (like the wall when the day
 * types align). Scenes without a start that day are skipped.
 */
export function daySegments(
  scenes: SceneScheduleInput[],
  day: DayKind,
): DaySegment[] {
  const starts = scenes.flatMap((scene) => {
    const raw = scene.start[day]
    if (raw === null) {
      return []
    }
    const min = toMinutes(raw)
    if (min === null) {
      return []
    }
    return [{ sceneId: scene.sceneId, name: scene.name, min }]
  })
  starts.sort((a, b) => a.min - b.min)
  if (starts.length === 0) {
    return []
  }
  const segments = starts.map((entry, index) => ({
    sceneId: entry.sceneId,
    name: entry.name,
    fromMin: entry.min,
    toMin: index + 1 < starts.length ? starts[index + 1].min : 24 * 60,
  }))
  const first = starts[0]
  const last = starts[starts.length - 1]
  if (first.min > 0) {
    segments.unshift({
      sceneId: last.sceneId,
      name: last.name,
      fromMin: 0,
      toMin: first.min,
    })
  }
  return segments
}

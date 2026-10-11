// Pure scene validation (Phase 8). Every failure throws a ConvexError with a
// German message the builder shows directly. Mutations fetch the rows and call
// these; unit tests cover them in tests/unit/scenes.test.ts.
import { ConvexError } from "convex/values";
import {
  GRID_COLS,
  GRID_ROWS,
  isWidgetType,
  widgetDef,
} from "./dashboardWidgets";
import type { SceneStart, SceneWidget, WidgetProps } from "./validators";

export interface SceneScheduleEntry {
  readonly sceneId: string;
  readonly name: string;
  readonly start: SceneStart;
}

export interface SceneCoverageEntry {
  readonly kind: "layout" | "night";
  readonly start: SceneStart;
}

export function assertValidSceneName(name: string): void {
  const length = name.trim().length;
  if (length < 1 || length > 30) {
    throw new ConvexError("Der Szenenname muss 1–30 Zeichen lang sein.");
  }
}

export function assertUniqueSceneName(
  name: string,
  sceneId: string,
  others: readonly { sceneId: string; name: string }[],
): void {
  const wanted = name.trim().toLowerCase();
  const clash = others.find(
    (other) =>
      other.sceneId !== sceneId && other.name.trim().toLowerCase() === wanted,
  );
  if (clash !== undefined) {
    throw new ConvexError(`Den Namen „${name.trim()}" gibt es schon.`);
  }
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function assertValidStart(start: SceneStart): void {
  for (const value of [start.schoolDay, start.weekend]) {
    if (value !== null && !TIME_PATTERN.test(value)) {
      throw new ConvexError(
        `„${value}" ist keine gültige Uhrzeit (erwartet HH:MM).`,
      );
    }
  }
  if (start.schoolDay === null && start.weekend === null) {
    throw new ConvexError(
      "Die Szene muss mindestens an einem Tag laufen (Mo–Fr oder Sa/So).",
    );
  }
}

const DAY_LABELS: Record<keyof SceneStart, string> = {
  schoolDay: "Mo–Fr",
  weekend: "Sa/So",
};

export function assertScheduleCompatible(
  candidate: SceneScheduleEntry,
  published: readonly SceneScheduleEntry[],
): void {
  for (const day of ["schoolDay", "weekend"] as const) {
    const time = candidate.start[day];
    if (time === null) {
      continue;
    }
    const clash = published.find(
      (other) => other.sceneId !== candidate.sceneId && other.start[day] === time,
    );
    if (clash !== undefined) {
      throw new ConvexError(
        `Um ${time} startet ${DAY_LABELS[day]} schon die Szene ${clash.name}.`,
      );
    }
  }
}

export function assertDayTypesCovered(
  scenes: readonly SceneCoverageEntry[],
): void {
  for (const day of ["schoolDay", "weekend"] as const) {
    const covered = scenes.some(
      (scene) => scene.kind === "layout" && scene.start[day] !== null,
    );
    if (!covered) {
      throw new ConvexError(
        `Mindestens eine Layout-Szene muss ${DAY_LABELS[day]} laufen.`,
      );
    }
  }
}

const ALLOWED_PROPS: Record<string, readonly string[]> = {
  clock: ["wide", "hints"],
  briefing: ["kind"],
  school: ["mode", "mealDay"],
};

function assertValidProps(
  type: string,
  displayName: string,
  props: WidgetProps | undefined,
): void {
  const allowed = ALLOWED_PROPS[type] ?? [];
  for (const key of Object.keys(props ?? {})) {
    if (!allowed.includes(key)) {
      throw new ConvexError(
        `„${displayName}": unbekannte Einstellung „${key}".`,
      );
    }
  }
  if (
    type === "briefing" &&
    props?.kind !== "today" &&
    props?.kind !== "tomorrow"
  ) {
    throw new ConvexError(
      `„${displayName}" braucht kind „today" oder „tomorrow".`,
    );
  }
  if (type === "school") {
    if (
      props?.mode !== "full" &&
      props?.mode !== "plan" &&
      props?.mode !== "plan-meal"
    ) {
      throw new ConvexError(
        `„${displayName}" braucht mode „full", „plan" oder „plan-meal".`,
      );
    }
    if (props?.mealDay !== "today" && props?.mealDay !== "tomorrow") {
      throw new ConvexError(
        `„${displayName}" braucht mealDay „today" oder „tomorrow".`,
      );
    }
  }
}

function rectsOverlap(a: SceneWidget, b: SceneWidget): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

function assertWidgetShape(widget: SceneWidget): void {
  if (widget.id.trim() === "") {
    throw new ConvexError("Jedes Widget braucht eine Id.");
  }
  const def = widgetDef(widget.type);
  if (def === undefined) {
    throw new ConvexError(`Unbekannter Widget-Typ „${widget.type}".`);
  }
  if (![widget.x, widget.y, widget.w, widget.h].every(Number.isInteger)) {
    throw new ConvexError(
      `„${widget.id}": x, y, w und h müssen ganze Zahlen sein.`,
    );
  }
  if (
    widget.x < 0 ||
    widget.y < 0 ||
    widget.w < 1 ||
    widget.h < 1 ||
    widget.x + widget.w > GRID_COLS ||
    widget.y + widget.h > GRID_ROWS
  ) {
    throw new ConvexError(
      `Das Widget „${widget.id}" ragt aus dem Raster (${GRID_COLS} × ${GRID_ROWS}).`,
    );
  }
  if (widget.w < def.minW || widget.h < def.minH) {
    throw new ConvexError(
      `„${def.name}" braucht mindestens ${def.minW} × ${def.minH} Kacheln.`,
    );
  }
  assertValidProps(widget.type, def.name, widget.props);
  if (widget.fallback !== undefined) {
    if (!isWidgetType(widget.fallback)) {
      throw new ConvexError(`Unbekannter Fallback-Typ „${widget.fallback}".`);
    }
    if (widget.fallback === widget.type) {
      throw new ConvexError("Ein Widget kann nicht sein eigener Fallback sein.");
    }
  }
}

export function assertValidWidgets(widgets: readonly SceneWidget[]): void {
  for (const widget of widgets) {
    assertWidgetShape(widget);
  }
  const ids = new Set<string>();
  for (const widget of widgets) {
    if (ids.has(widget.id)) {
      throw new ConvexError(
        `Die Widget-Id „${widget.id}" gibt es doppelt in dieser Szene.`,
      );
    }
    ids.add(widget.id);
  }
  const types = new Set<string>();
  for (const widget of widgets) {
    if (types.has(widget.type)) {
      const name = widgetDef(widget.type)?.name ?? widget.type;
      throw new ConvexError(
        `„${name}" gibt es schon in dieser Szene (jedes Widget nur einmal).`,
      );
    }
    types.add(widget.type);
  }
  widgets.forEach((a, index) => {
    for (const b of widgets.slice(index + 1)) {
      if (rectsOverlap(a, b)) {
        throw new ConvexError(
          `Die Widgets „${a.id}" und „${b.id}" überlappen sich.`,
        );
      }
    }
  });
}

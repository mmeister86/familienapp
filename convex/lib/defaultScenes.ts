// Built-in wall scenes (Phase 8): schedule and 12 x 24 layouts matching today's
// wall (times from internal/scene, widgets from the SCENES table in app.js).
// Consumed by the seed and by resetToDefault; ids stay stable forever so
// `?scene=` and SCENE_FORCE keep working.
import type { SceneStart, SceneWidget } from "./validators";

export interface DefaultScene {
  readonly sceneId: string;
  readonly kind: "layout" | "night";
  readonly name: string;
  readonly start: SceneStart;
  readonly widgets: readonly SceneWidget[];
}

export const DEFAULT_SCENES: readonly DefaultScene[] = [
  {
    sceneId: "morning",
    kind: "layout",
    name: "Morgen",
    start: { schoolDay: "06:45", weekend: "07:30" },
    widgets: [
      {
        id: "clock",
        type: "clock",
        x: 0,
        y: 0,
        w: 12,
        h: 5,
        props: { wide: true, hints: true },
      },
      {
        id: "school",
        type: "school",
        x: 0,
        y: 5,
        w: 6,
        h: 11,
        props: { mode: "plan-meal", mealDay: "today" },
      },
      {
        id: "briefing",
        type: "briefing",
        x: 6,
        y: 5,
        w: 6,
        h: 6,
        props: { kind: "today" },
        fallback: "shopping",
      },
      { id: "news", type: "news", x: 6, y: 11, w: 6, h: 5 },
      { id: "calendars", type: "calendars", x: 0, y: 16, w: 12, h: 8 },
    ],
  },
  {
    sceneId: "day",
    kind: "layout",
    name: "Tag",
    start: { schoolDay: "09:00", weekend: "10:00" },
    widgets: [
      {
        id: "clock",
        type: "clock",
        x: 0,
        y: 0,
        w: 6,
        h: 5,
        props: { wide: false, hints: false },
      },
      { id: "shopping", type: "shopping", x: 6, y: 0, w: 6, h: 5 },
      { id: "photos", type: "photos", x: 0, y: 5, w: 6, h: 10 },
      { id: "news", type: "news", x: 6, y: 5, w: 6, h: 10 },
      { id: "calendars", type: "calendars", x: 0, y: 15, w: 12, h: 9 },
    ],
  },
  {
    sceneId: "afternoon",
    kind: "layout",
    name: "Nachmittag",
    start: { schoolDay: "14:00", weekend: "14:00" },
    widgets: [
      {
        id: "clock",
        type: "clock",
        x: 0,
        y: 0,
        w: 6,
        h: 5,
        props: { wide: false, hints: false },
      },
      { id: "shopping", type: "shopping", x: 6, y: 0, w: 6, h: 5 },
      {
        id: "school",
        type: "school",
        x: 0,
        y: 5,
        w: 12,
        h: 11,
        props: { mode: "full", mealDay: "today" },
      },
      { id: "calendars", type: "calendars", x: 0, y: 16, w: 12, h: 8 },
    ],
  },
  {
    sceneId: "evening",
    kind: "layout",
    name: "Abend",
    start: { schoolDay: "19:00", weekend: "19:00" },
    widgets: [
      {
        id: "clock",
        type: "clock",
        x: 0,
        y: 0,
        w: 12,
        h: 5,
        props: { wide: true, hints: false },
      },
      {
        id: "briefing",
        type: "briefing",
        x: 0,
        y: 5,
        w: 6,
        h: 6,
        props: { kind: "tomorrow" },
      },
      {
        id: "school",
        type: "school",
        x: 6,
        y: 5,
        w: 6,
        h: 11,
        props: { mode: "plan-meal", mealDay: "tomorrow" },
      },
      { id: "photos", type: "photos", x: 0, y: 11, w: 6, h: 5 },
      { id: "calendars", type: "calendars", x: 0, y: 16, w: 12, h: 8 },
    ],
  },
  {
    sceneId: "night",
    kind: "night",
    name: "Nacht",
    start: { schoolDay: "21:30", weekend: "21:30" },
    widgets: [],
  },
];

export function defaultScene(sceneId: string): DefaultScene | undefined {
  return DEFAULT_SCENES.find((scene) => scene.sceneId === sceneId);
}

// Widget catalog for the wall-dashboard scenes (Phase 8). Single source for the
// builder sidebar, the validation in ./scenes.ts and the Go mirror
// (internal/layout/widgets.go); both repos pin it via contract tests.
export const GRID_COLS = 12;
export const GRID_ROWS = 24;

export const WIDGET_TYPES = [
  "clock",
  "shopping",
  "briefing",
  "news",
  "photos",
  "school",
  "calendars",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export interface WidgetDef {
  readonly type: WidgetType;
  /** German display name for the builder sidebar. */
  readonly name: string;
  readonly minW: number;
  readonly minH: number;
}

export const WIDGET_CATALOG: readonly WidgetDef[] = [
  { type: "clock", name: "Uhr & Wetter", minW: 4, minH: 3 },
  { type: "shopping", name: "Einkaufsliste (Bring!)", minW: 4, minH: 4 },
  { type: "briefing", name: "KI-Briefing", minW: 4, minH: 4 },
  { type: "news", name: "Nachrichten", minW: 4, minH: 3 },
  { type: "photos", name: "Fotorahmen", minW: 4, minH: 4 },
  { type: "school", name: "Schule & Essen", minW: 6, minH: 4 },
  { type: "calendars", name: "Kalender", minW: 6, minH: 4 },
];

export function widgetDef(type: string): WidgetDef | undefined {
  return WIDGET_CATALOG.find((def) => def.type === type);
}

export function isWidgetType(value: string): value is WidgetType {
  return widgetDef(value) !== undefined;
}

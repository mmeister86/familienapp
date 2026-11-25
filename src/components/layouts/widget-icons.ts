import type { LucideIcon } from "lucide-react"
import {
  Calendar,
  CalendarDays,
  ChartGantt,
  Clock,
  GraduationCap,
  Image,
  LayoutTemplate,
  Newspaper,
  ShoppingCart,
  Sparkles,
} from "lucide-react"

/** Sidebar + tile icons per widget type. */
export const WIDGET_ICONS: Record<string, LucideIcon> = {
  clock: Clock,
  shopping: ShoppingCart,
  briefing: Sparkles,
  news: Newspaper,
  photos: Image,
  school: GraduationCap,
  calendars: Calendar,
  dayband: ChartGantt,
  week: CalendarDays,
}

export function widgetIcon(type: string): LucideIcon {
  return WIDGET_ICONS[type] ?? LayoutTemplate
}

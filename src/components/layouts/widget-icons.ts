import type { LucideIcon } from "lucide-react"
import {
  Calendar,
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
}

export function widgetIcon(type: string): LucideIcon {
  return WIDGET_ICONS[type] ?? LayoutTemplate
}

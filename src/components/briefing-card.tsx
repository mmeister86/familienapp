import { useState } from "react"
import { cn } from "cn"
import { ChevronDown, Moon, Sun } from "lucide-react"
import type { BriefingItem } from "../../convex/lib/validators"
import { formatBerlinTime } from "@/lib/dashboard"

export type BriefingView = {
  kind: "morning" | "evening"
  date: string
  text: string
  headline?: string
  items: BriefingItem[]
  ai: boolean
  generatedAt: number
}

function ItemList({ title, items }: { title: string; items: BriefingItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold opacity-70">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2.5 text-[0.9375rem]">
            <span aria-hidden="true" className="w-5 shrink-0 text-center">
              {item.icon}
            </span>
            <span className="min-w-0">
              {item.who ? (
                <span className="mr-1 inline-flex items-center gap-1.5 font-semibold">
                  {item.color ? (
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  ) : null}
                  {item.who}:
                </span>
              ) : null}
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The parents' daily briefing — the one dark (navy) surface on the overview.
 * Starts expanded; the toggle collapses it to the headline.
 */
export function BriefingCard({ briefing }: { briefing: BriefingView }) {
  const [expanded, setExpanded] = useState(true)
  const tonight = briefing.items.filter((item) => item.section === "tonight")
  const day = briefing.items.filter((item) => item.section === "day")
  const KindIcon = briefing.kind === "morning" ? Sun : Moon

  return (
    <section
      aria-labelledby="briefing-heading"
      className="overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-[0_12px_32px_-18px_var(--primary)]"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls="briefing-body"
        className="flex w-full items-start gap-3 px-5 pt-5 pb-4 text-left outline-none focus-visible:bg-primary-foreground/10"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium opacity-70">
            <KindIcon aria-hidden="true" className="size-4" />
            <span id="briefing-heading">
              {briefing.kind === "morning"
                ? "Briefing am Morgen"
                : "Briefing am Abend"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {formatBerlinTime(briefing.generatedAt)}
            </span>
          </span>
          {briefing.headline ? (
            <span className="text-xl leading-snug font-bold tracking-tight text-balance">
              {briefing.headline}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "mt-1 size-5 shrink-0 opacity-70 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
        <span className="sr-only">
          {expanded ? "Briefing einklappen" : "Briefing ausklappen"}
        </span>
      </button>
      {expanded ? (
        <div id="briefing-body" className="flex flex-col gap-4 px-5 pb-5">
          <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap opacity-85">
            {briefing.text}
          </p>
          {day.length > 0 || tonight.length > 0 ? (
            <div className="grid gap-4 rounded-2xl bg-primary-foreground/8 p-4 sm:grid-cols-2">
              {day.length > 0 ? (
                <ItemList title="Tagsüber" items={day} />
              ) : null}
              {tonight.length > 0 ? (
                <ItemList title="Heute Abend" items={tonight} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

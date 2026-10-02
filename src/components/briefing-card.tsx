import { useState } from "react"
import type { BriefingItem } from "../../convex/lib/validators"

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
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>
              {item.who ? <span className="font-medium">{item.who}: </span> : null}
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BriefingCard({ briefing }: { briefing: BriefingView }) {
  const [expanded, setExpanded] = useState(true)
  const tonight = briefing.items.filter((item) => item.section === "tonight")
  const day = briefing.items.filter((item) => item.section === "day")

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {briefing.kind === "morning" ? "Briefing" : "Briefing am Abend"}
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expanded ? "Einklappen" : "Ausklappen"}
        </button>
      </div>
      {expanded ? (
        <div className="mt-2 flex flex-col gap-3">
          {briefing.headline ? (
            <p className="font-medium">{briefing.headline}</p>
          ) : null}
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {briefing.text}
          </p>
          {tonight.length > 0 ? (
            <ItemList title="Heute Abend" items={tonight} />
          ) : null}
          {day.length > 0 ? <ItemList title="Tag" items={day} /> : null}
        </div>
      ) : null}
    </section>
  )
}

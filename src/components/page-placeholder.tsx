type PagePlaceholderProps = {
  title: string
  description: string
}

/** Placeholder screen shown until the real screen lands in a later phase. */
export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </section>
  )
}

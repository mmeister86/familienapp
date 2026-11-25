import { useState } from "react"
import { Ellipsis } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

export function SceneMoreMenu({
  isNight,
  isSeeded,
  busy,
  canClear,
  onOpenVersions,
  onResetDefault,
  onClear,
  onDelete,
}: {
  isNight: boolean
  isSeeded: boolean
  /** Autosave in flight: "Standard laden" waits to avoid clobbering it. */
  busy: boolean
  canClear: boolean
  onOpenVersions: () => void
  onResetDefault: () => void
  onClear: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  const itemClass = "w-full justify-start"
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Weitere Aktionen"
            title="Weitere Aktionen"
          />
        }
      >
        <Ellipsis aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 gap-0.5 p-1">
        <Button
          variant="ghost"
          className={itemClass}
          disabled={isNight}
          onClick={choose(onOpenVersions)}
        >
          Versionen
        </Button>
        {isSeeded && !isNight && (
          <Button
            variant="ghost"
            className={itemClass}
            disabled={busy}
            onClick={choose(onResetDefault)}
          >
            Standard laden
          </Button>
        )}
        <Button
          variant="ghost"
          className={itemClass}
          disabled={!canClear}
          onClick={choose(onClear)}
        >
          Szene leeren
        </Button>
        {!isNight && (
          <>
            <Separator className="my-1" />
            <Button
              variant="ghost"
              className={`${itemClass} text-destructive hover:text-destructive`}
              onClick={choose(onDelete)}
            >
              Szene löschen
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

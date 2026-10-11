import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

export type SelectOption = {
  value: string
  label: string
}

/**
 * Labeled select with a deterministic trigger label. Base UI's SelectValue
 * renders the raw value while the popup is closed, so the label is looked
 * up explicitly instead.
 */
export function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(next)
          }
        }}
      >
        <SelectTrigger className="w-full">
          <span className="flex flex-1 text-left">
            {options.find((option) => option.value === value)?.label ?? value}
          </span>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
